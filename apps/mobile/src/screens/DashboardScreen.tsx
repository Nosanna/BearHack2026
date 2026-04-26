import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { MaintenanceTaskDto, RoomDto } from '@fixit/shared';
import { useAuth } from '../auth/AuthProvider';
import { api, uploadToSignedUrl } from '../api/client';
import { theme } from '../theme';
import type { RootStackParamList } from '../navigation/AppShell';
import { VoiceOverlay } from '../components/VoiceOverlay';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type TabNav = { navigate: (name: 'Schedule' | 'CameraEntry') => void };

export function DashboardScreen() {
  const nav = useNavigation<Nav>();
  const tabNav = nav as unknown as TabNav;
  const { signOut, user } = useAuth();
  const [voiceOpen, setVoiceOpen] = useState(false);

  const qc = useQueryClient();
  const home = useQuery({
    queryKey: ['dashboard-home'],
    queryFn: () => api.dashboardHome(),
  });

  // Mark the dashboard data stale on focus. React Query's 30s staleTime
  // prevents this from triggering a fetch on every minor re-render — only
  // when data is actually stale and the screen comes into focus.
  useFocusEffect(
    useCallback(() => {
      qc.invalidateQueries({ queryKey: ['dashboard-home'] });
    }, [qc]),
  );

  const idle = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(idle, {
          toValue: 1,
          duration: 2400,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(idle, {
          toValue: 0,
          duration: 2400,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [idle]);

  const emote = () => {
    pulse.stopAnimation();
    pulse.setValue(0);
    Animated.sequence([
      Animated.timing(pulse, {
        toValue: 1,
        duration: 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(pulse, {
        toValue: 0,
        duration: 380,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start();
  };

  const avatarTransform = useMemo(() => {
    const translateY = idle.interpolate({ inputRange: [0, 1], outputRange: [0, -6] });
    const rotate = idle.interpolate({ inputRange: [0, 1], outputRange: ['-2deg', '2deg'] });
    const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] });
    return [{ translateY }, { rotate }, { scale }] as const;
  }, [idle, pulse]);

  // Picker modal state (unchanged behavior)
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pendingImageUri, setPendingImageUri] = useState<string | null>(null);
  const [pendingMime, setPendingMime] = useState<string>('image/jpeg');
  const [analyzing, setAnalyzing] = useState(false);
  const [spaces, setSpaces] = useState<Array<{ id: string; name: string }> | null>(null);
  const [showNewSpace, setShowNewSpace] = useState(false);
  const [newSpaceName, setNewSpaceName] = useState('');
  const [creatingSpace, setCreatingSpace] = useState(false);

  const openInAppCamera = () => {
    emote();
    nav.navigate('Camera', { mode: 'register' });
  };

  const openAsk = () => {
    emote();
    setVoiceOpen(true);
  };

  const startAnalyzeForRoom = async (roomId: string) => {
    if (!pendingImageUri) return;
    setAnalyzing(true);
    try {
      const signed = await api.signedUpload({ contentType: pendingMime, kind: 'appliance' });
      const publicUrl = await uploadToSignedUrl(signed, pendingImageUri);
      const analysis = await api.analyzeApplianceFromImage({ imageUrl: publicUrl });
      setPickerOpen(false);
      setPendingImageUri(null);
      setShowNewSpace(false);
      setNewSpaceName('');
      nav.navigate('ApplianceSave', {
        roomId,
        imageUrl: publicUrl,
        typeOptions: analysis.typeOptions,
        suggested: analysis.suggested,
      });
    } catch (e) {
      Alert.alert('Could not analyze photo', (e as Error).message);
    } finally {
      setAnalyzing(false);
    }
  };

  const createSpaceAndUse = async () => {
    const name = newSpaceName.trim();
    if (!name || creatingSpace) return;
    setCreatingSpace(true);
    try {
      const created = await api.createRoom(name);
      setSpaces((prev) => [...(prev ?? []), { id: created.id, name: created.name }]);
      setNewSpaceName('');
      setShowNewSpace(false);
      await startAnalyzeForRoom(created.id);
    } catch (e) {
      Alert.alert('Could not create space', (e as Error).message);
    } finally {
      setCreatingSpace(false);
    }
  };

  const openRoomPickerWithImage = async (uri: string, mime: string) => {
    setPendingImageUri(uri);
    setPendingMime(mime);
    setSpaces(null);
    setShowNewSpace(false);
    setNewSpaceName('');
    setPickerOpen(true);
    try {
      const list = await api.listRooms();
      setSpaces(list.map((r) => ({ id: r.id, name: r.name })));
    } catch (e) {
      Alert.alert('Could not load spaces', (e as Error).message);
    }
  };

  const pickFromLibrary = async () => {
    try {
      const perms = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perms.granted) {
        Alert.alert('Permission needed', 'Please allow photo library access to upload an image.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.9,
      });
      if (result.canceled) return;
      const asset = result.assets?.[0];
      if (!asset?.uri) return;
      emote();
      await openRoomPickerWithImage(asset.uri, asset.mimeType ?? 'image/jpeg');
    } catch (e) {
      Alert.alert('Could not open library', (e as Error).message);
    }
  };

  // Derived display data
  const firstName = (user?.name?.split(' ')[0] ?? 'there').trim() || 'there';
  const greetingLine = useMemo(() => {
    const h = new Date().getHours();
    if (h < 5) return 'Burning the midnight oil?';
    if (h < 12) return 'Good morning. Ready to tackle something?';
    if (h < 17) return 'Good afternoon. What can I help with?';
    if (h < 21) return 'Good evening. Need a hand?';
    return 'Late-night fix-it session?';
  }, []);

  const rooms: RoomDto[] = home.data?.rooms ?? [];
  const upcomingTasks: MaintenanceTaskDto[] = home.data?.upcomingTasks ?? [];
  const activeRepairSessionId = home.data?.activeRepairSessionId ?? null;
  const totalAppliances = rooms.reduce((acc, r) => acc + (r.applianceCount ?? 0), 0);
  const dueCount = upcomingTasks.length;

  return (
    <SafeAreaView style={styles.root}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={home.isFetching && !home.isLoading}
            onRefresh={() => void home.refetch()}
            tintColor={theme.colors.accent}
          />
        }
      >
        {/* Brand strip */}
        <View style={styles.brandRow}>
          <View style={styles.brandLogo}>
            <Ionicons name="home" size={16} color={theme.colors.bg} />
            <View style={styles.brandLogoTool}>
              <Ionicons name="construct" size={9} color={theme.colors.accent} />
            </View>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.brandText}>HOME HERO</Text>
          </View>
          <Pressable onPress={signOut} hitSlop={10} style={styles.signOutBtn}>
            <Text style={styles.signOutText}>Sign out</Text>
          </Pressable>
        </View>

        {/* Greeting */}
        <Text style={styles.greeting}>Hi {firstName}</Text>
        <Text style={styles.greetingSub}>{greetingLine}</Text>

        {/* Hero card */}
        <View style={styles.heroCard}>
          <View style={styles.heroGlow} pointerEvents="none" />
          <Animated.View style={[styles.heroAvatar, { transform: avatarTransform }]}>
            <Ionicons name="home" size={68} color={theme.colors.accent} />
            <View style={styles.heroAvatarBadge}>
              <Ionicons name="construct" size={18} color={theme.colors.bg} />
            </View>
          </Animated.View>
          <View style={styles.heroCopy}>
            <Text style={styles.heroTitle}>Your home, handled.</Text>
            <Text style={styles.heroBody}>
              Snap a photo, ask a question, or upload a manual — I&apos;ll take it from there.
            </Text>
          </View>
        </View>

        {/* Active repair callout */}
        {activeRepairSessionId && (
          <Pressable
            style={styles.repairBanner}
            onPress={() =>
              nav.navigate('Assistant', { sessionId: activeRepairSessionId })
            }
          >
            <View style={styles.repairBannerIcon}>
              <Ionicons name="play" size={14} color={theme.colors.bg} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.repairBannerTitle}>Resume your repair</Text>
              <Text style={styles.repairBannerSub}>Pick up right where you left off.</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={theme.colors.text} />
          </Pressable>
        )}

        {/* Stats row */}
        <View style={styles.statsRow}>
          <StatChip
            icon="cube-outline"
            value={home.isLoading ? '…' : String(totalAppliances)}
            label={totalAppliances === 1 ? 'item' : 'items'}
          />
          <StatChip
            icon="apps-outline"
            value={home.isLoading ? '…' : String(rooms.length)}
            label={rooms.length === 1 ? 'space' : 'spaces'}
          />
          <StatChip
            icon="time-outline"
            value={home.isLoading ? '…' : String(dueCount)}
            label={dueCount === 1 ? 'due' : 'due'}
            tone={dueCount > 0 ? 'warn' : 'default'}
          />
        </View>

        {/* Quick actions */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Quick actions</Text>
        </View>
        <View style={styles.actionsRow}>
          <ActionTile
            icon="cloud-upload-outline"
            label="Upload"
            sub="From your photos"
            onPress={pickFromLibrary}
          />
          <ActionTile
            icon="camera-outline"
            label="Camera"
            sub="Snap & identify"
            onPress={openInAppCamera}
          />
          <ActionTile
            icon="mic-outline"
            label="Ask"
            sub="Speak to me"
            onPress={openAsk}
            primary
          />
        </View>

        {/* Up next */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Up next</Text>
          {upcomingTasks.length > 0 && (
            <Pressable onPress={() => tabNav.navigate('Schedule')}>
              <Text style={styles.sectionLink}>View all</Text>
            </Pressable>
          )}
        </View>
        {home.isLoading ? (
          <View style={styles.emptyTile}>
            <ActivityIndicator color={theme.colors.accent} />
          </View>
        ) : upcomingTasks.length === 0 ? (
          <View style={styles.emptyTile}>
            <Ionicons name="checkmark-circle" size={20} color={theme.colors.success} />
            <Text style={styles.emptyTileText}>You&apos;re all caught up.</Text>
          </View>
        ) : (
          upcomingTasks.slice(0, 3).map((t) => (
            <Pressable
              key={t.id}
              style={styles.taskTile}
              onPress={() =>
                nav.navigate('ApplianceDetail', {
                  applianceId: t.applianceId,
                  taskId: t.id,
                  source: 'home-upcoming',
                })
              }
            >
              <View style={styles.taskIcon}>
                <Ionicons name="construct" size={16} color={theme.colors.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.taskTitle} numberOfLines={1}>
                  {t.title}
                </Text>
                <Text style={styles.taskSub} numberOfLines={1}>
                  {applianceLabel(t)} · {formatDue(t.dueDate)}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
            </Pressable>
          ))
        )}

        {/* Spaces rail */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Your spaces</Text>
          <Pressable onPress={() => tabNav.navigate('CameraEntry')}>
            <Text style={styles.sectionLink}>
              {rooms.length === 0 ? 'Get started' : 'Manage'}
            </Text>
          </Pressable>
        </View>
        {home.isLoading ? (
          <View style={styles.emptyTile}>
            <ActivityIndicator color={theme.colors.accent} />
          </View>
        ) : rooms.length === 0 ? (
          <Pressable
            style={styles.spaceEmpty}
            onPress={() => tabNav.navigate('CameraEntry')}
          >
            <Ionicons name="add-circle" size={20} color={theme.colors.accent} />
            <View style={{ flex: 1 }}>
              <Text style={styles.spaceEmptyTitle}>Create your first space</Text>
              <Text style={styles.spaceEmptySub}>
                Group equipment by where it lives — kitchen, garage, basement.
              </Text>
            </View>
          </Pressable>
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.spacesRail}
          >
            {rooms.map((r) => (
              <Pressable
                key={r.id}
                style={styles.spacePill}
                onPress={() => nav.navigate('RoomDetail', { roomId: r.id })}
              >
                <View style={styles.spacePillIcon}>
                  <Ionicons name="cube-outline" size={16} color={theme.colors.accent} />
                </View>
                <View>
                  <Text style={styles.spacePillName} numberOfLines={1}>
                    {r.name}
                  </Text>
                  <Text style={styles.spacePillCount}>
                    {r.applianceCount} {r.applianceCount === 1 ? 'item' : 'items'}
                  </Text>
                </View>
              </Pressable>
            ))}
            <Pressable
              style={styles.spaceAdd}
              onPress={() => tabNav.navigate('CameraEntry')}
            >
              <Ionicons name="add" size={18} color={theme.colors.accent} />
              <Text style={styles.spaceAddText}>New</Text>
            </Pressable>
          </ScrollView>
        )}

        <View style={{ height: theme.spacing.xl }} />
      </ScrollView>

      <Modal
        visible={pickerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => !analyzing && !creatingSpace && setPickerOpen(false)}
      >
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.modalBackdrop}>
            <View style={styles.modalCard}>
              <View style={styles.modalHeaderRow}>
                <Text style={styles.modalTitle}>Add to which space?</Text>
                <Pressable
                  onPress={() => !analyzing && !creatingSpace && setPickerOpen(false)}
                  hitSlop={12}
                  style={styles.headerIconBtn}
                >
                  <Ionicons name="close" size={18} color={theme.colors.textMuted} />
                </Pressable>
              </View>
              {analyzing ? (
                <View style={{ alignItems: 'center', paddingVertical: theme.spacing.xl }}>
                  <ActivityIndicator color={theme.colors.accent} />
                  <Text
                    style={{
                      ...theme.font.caption,
                      color: theme.colors.textMuted,
                      marginTop: theme.spacing.md,
                    }}
                  >
                    Identifying your equipment…
                  </Text>
                </View>
              ) : spaces === null ? (
                <ActivityIndicator
                  color={theme.colors.accent}
                  style={{ marginVertical: theme.spacing.lg }}
                />
              ) : (
                <View style={{ marginTop: theme.spacing.md, gap: theme.spacing.sm }}>
                  {spaces.length === 0 && !showNewSpace && (
                    <Text
                      style={{
                        ...theme.font.body,
                        color: theme.colors.textMuted,
                        marginBottom: theme.spacing.sm,
                      }}
                    >
                      You don&apos;t have any spaces yet — create one to get started.
                    </Text>
                  )}

                  {spaces.map((r) => (
                    <Pressable
                      key={r.id}
                      style={styles.roomPickerRow}
                      onPress={() => startAnalyzeForRoom(r.id)}
                    >
                      <Ionicons name="cube-outline" size={18} color={theme.colors.accent} />
                      <Text style={[styles.roomPickerName, { flex: 1, marginLeft: 10 }]}>
                        {r.name}
                      </Text>
                      <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
                    </Pressable>
                  ))}

                  {showNewSpace ? (
                    <View style={styles.newSpaceCard}>
                      <TextInput
                        autoFocus
                        value={newSpaceName}
                        onChangeText={setNewSpaceName}
                        placeholder="e.g. Garage"
                        placeholderTextColor={theme.colors.textMuted}
                        style={styles.newSpaceInput}
                        returnKeyType="done"
                        onSubmitEditing={createSpaceAndUse}
                        editable={!creatingSpace}
                      />
                      <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
                        <Pressable
                          style={[styles.newSpaceBtn, styles.newSpaceBtnGhost]}
                          disabled={creatingSpace}
                          onPress={() => {
                            setShowNewSpace(false);
                            setNewSpaceName('');
                          }}
                        >
                          <Text style={styles.newSpaceBtnGhostText}>Cancel</Text>
                        </Pressable>
                        <Pressable
                          style={[
                            styles.newSpaceBtn,
                            styles.newSpaceBtnPrimary,
                            (!newSpaceName.trim() || creatingSpace) && { opacity: 0.5 },
                          ]}
                          disabled={!newSpaceName.trim() || creatingSpace}
                          onPress={createSpaceAndUse}
                        >
                          <Text style={styles.newSpaceBtnPrimaryText}>
                            {creatingSpace ? 'Creating…' : 'Create & use'}
                          </Text>
                        </Pressable>
                      </View>
                    </View>
                  ) : (
                    <Pressable
                      style={styles.addSpaceRow}
                      onPress={() => setShowNewSpace(true)}
                    >
                      <Ionicons name="add" size={18} color={theme.colors.accent} />
                      <Text style={styles.addSpaceText}>New space</Text>
                    </Pressable>
                  )}
                </View>
              )}
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <VoiceOverlay visible={voiceOpen} onClose={() => setVoiceOpen(false)} />
    </SafeAreaView>
  );
}

function StatChip(props: {
  icon: keyof typeof Ionicons.glyphMap;
  value: string;
  label: string;
  tone?: 'default' | 'warn';
}) {
  const tone = props.tone ?? 'default';
  return (
    <View style={[styles.statChip, tone === 'warn' && styles.statChipWarn]}>
      <Ionicons
        name={props.icon}
        size={16}
        color={tone === 'warn' ? theme.colors.warning : theme.colors.accent}
      />
      <Text
        style={[
          styles.statValue,
          tone === 'warn' && { color: theme.colors.warning },
        ]}
      >
        {props.value}
      </Text>
      <Text style={styles.statLabel}>{props.label}</Text>
    </View>
  );
}

function ActionTile(props: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  sub: string;
  onPress: () => void;
  primary?: boolean;
}) {
  return (
    <Pressable
      style={[styles.actionTile, props.primary && styles.actionTilePrimary]}
      onPress={props.onPress}
    >
      <View
        style={[
          styles.actionTileIcon,
          props.primary && styles.actionTileIconPrimary,
        ]}
      >
        <Ionicons
          name={props.icon}
          size={22}
          color={props.primary ? theme.colors.bg : theme.colors.accent}
        />
      </View>
      <Text
        style={[
          styles.actionTileLabel,
          props.primary && { color: theme.colors.bg },
        ]}
      >
        {props.label}
      </Text>
      <Text
        style={[
          styles.actionTileSub,
          props.primary && { color: 'rgba(11,11,13,0.7)' },
        ]}
      >
        {props.sub}
      </Text>
    </Pressable>
  );
}

function applianceLabel(t: MaintenanceTaskDto): string {
  if (t.applianceNickname) return t.applianceNickname;
  return t.applianceType.toString().replace(/_/g, ' ').toLowerCase();
}

function formatDue(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const ms = d.getTime() - now.getTime();
  const day = 24 * 60 * 60 * 1000;
  const days = Math.round(ms / day);
  if (days < -1) return `${Math.abs(days)}d overdue`;
  if (days === -1) return '1d overdue';
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days < 7) return `in ${days}d`;
  if (days < 14) return 'next week';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.bg },
  scrollContent: {
    padding: theme.spacing.lg,
    paddingBottom: theme.spacing.xl * 2,
  },

  // Brand strip
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.lg,
  },
  brandLogo: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: theme.colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandLogoTool: {
    position: 'absolute',
    bottom: -3,
    right: -3,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: theme.colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.colors.accent,
  },
  brandText: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 2,
    color: theme.colors.text,
  },
  signOutBtn: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  signOutText: {
    ...theme.font.caption,
    color: theme.colors.textMuted,
    fontWeight: '600',
  },

  // Greeting
  greeting: {
    fontSize: 28,
    fontWeight: '800',
    color: theme.colors.text,
    letterSpacing: -0.5,
  },
  greetingSub: {
    ...theme.font.body,
    color: theme.colors.textMuted,
    marginTop: 4,
    marginBottom: theme.spacing.lg,
  },

  // Hero card
  heroCard: {
    backgroundColor: theme.colors.bgElevated,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.lg,
    overflow: 'hidden',
  },
  heroGlow: {
    position: 'absolute',
    top: -40,
    right: -40,
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: theme.colors.accent,
    opacity: 0.08,
  },
  heroAvatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: theme.colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  heroAvatarBadge: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: theme.colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: theme.colors.bgElevated,
  },
  heroCopy: { flex: 1 },
  heroTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.text,
    marginBottom: 4,
  },
  heroBody: {
    ...theme.font.caption,
    color: theme.colors.textMuted,
    lineHeight: 18,
  },

  // Active repair banner
  repairBanner: {
    marginTop: theme.spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    backgroundColor: 'rgba(249, 115, 22, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(249, 115, 22, 0.4)',
    borderRadius: theme.radius.md,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
  },
  repairBannerIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: theme.colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  repairBannerTitle: {
    ...theme.font.body,
    color: theme.colors.text,
    fontWeight: '700',
  },
  repairBannerSub: {
    ...theme.font.caption,
    color: theme.colors.textMuted,
    marginTop: 2,
  },

  // Stats
  statsRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.lg,
  },
  statChip: {
    flex: 1,
    backgroundColor: theme.colors.bgElevated,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
    alignItems: 'center',
    gap: 2,
  },
  statChipWarn: {
    borderColor: 'rgba(245, 158, 11, 0.4)',
    backgroundColor: 'rgba(245, 158, 11, 0.08)',
  },
  statValue: {
    fontSize: 20,
    fontWeight: '800',
    color: theme.colors.text,
    marginTop: 4,
  },
  statLabel: {
    ...theme.font.caption,
    color: theme.colors.textMuted,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },

  // Sections
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: theme.spacing.xl,
    marginBottom: theme.spacing.md,
  },
  sectionTitle: {
    ...theme.font.h2,
    color: theme.colors.text,
  },
  sectionLink: {
    ...theme.font.caption,
    color: theme.colors.accent,
    fontWeight: '600',
  },

  // Action tiles
  actionsRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  actionTile: {
    flex: 1,
    backgroundColor: theme.colors.bgElevated,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
    alignItems: 'flex-start',
    gap: 4,
  },
  actionTilePrimary: {
    backgroundColor: theme.colors.accent,
    borderColor: theme.colors.accent,
  },
  actionTileIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(249,115,22,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.spacing.sm,
  },
  actionTileIconPrimary: { backgroundColor: 'rgba(11,11,13,0.18)' },
  actionTileLabel: {
    ...theme.font.body,
    fontWeight: '700',
    color: theme.colors.text,
  },
  actionTileSub: {
    fontSize: 11,
    color: theme.colors.textMuted,
  },

  // Up next
  emptyTile: {
    backgroundColor: theme.colors.bgElevated,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingVertical: theme.spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
    flexDirection: 'row',
  },
  emptyTileText: { ...theme.font.body, color: theme.colors.textMuted },
  taskTile: {
    backgroundColor: theme.colors.bgElevated,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    marginBottom: theme.spacing.sm,
  },
  taskIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(249,115,22,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  taskTitle: { ...theme.font.body, color: theme.colors.text, fontWeight: '600' },
  taskSub: {
    ...theme.font.caption,
    color: theme.colors.textMuted,
    marginTop: 2,
    textTransform: 'capitalize',
  },

  // Spaces rail
  spacesRail: {
    gap: theme.spacing.sm,
    paddingRight: theme.spacing.lg,
  },
  spacePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.bgElevated,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
    minWidth: 140,
  },
  spacePillIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(249,115,22,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  spacePillName: {
    ...theme.font.body,
    color: theme.colors.text,
    fontWeight: '600',
    maxWidth: 120,
  },
  spacePillCount: {
    fontSize: 11,
    color: theme.colors.textMuted,
    marginTop: 2,
  },
  spaceAdd: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: theme.colors.border,
  },
  spaceAddText: {
    ...theme.font.body,
    color: theme.colors.accent,
    fontWeight: '600',
  },
  spaceEmpty: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    backgroundColor: theme.colors.bgElevated,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: theme.colors.border,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
  },
  spaceEmptyTitle: { ...theme.font.body, color: theme.colors.text, fontWeight: '600' },
  spaceEmptySub: { ...theme.font.caption, color: theme.colors.textMuted, marginTop: 2 },

  // Modal (preserved)
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing.lg,
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: theme.colors.bgElevated,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.lg,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modalTitle: { ...theme.font.h2, color: theme.colors.text },
  headerIconBtn: {
    width: 34,
    height: 34,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.bg,
  },
  roomPickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.colors.bg,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  roomPickerName: { ...theme.font.body, color: theme.colors.text },
  addSpaceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: theme.colors.border,
    backgroundColor: 'transparent',
  },
  addSpaceText: {
    ...theme.font.body,
    color: theme.colors.accent,
    fontWeight: '600',
  },
  newSpaceCard: {
    padding: theme.spacing.md,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.bg,
    gap: theme.spacing.sm,
  },
  newSpaceInput: {
    backgroundColor: theme.colors.bgElevated,
    color: theme.colors.text,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    fontSize: 15,
  },
  newSpaceBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: theme.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  newSpaceBtnPrimary: { backgroundColor: theme.colors.accent },
  newSpaceBtnPrimaryText: {
    ...theme.font.body,
    color: theme.colors.bg,
    fontWeight: '700',
  },
  newSpaceBtnGhost: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: 'transparent',
  },
  newSpaceBtnGhostText: { ...theme.font.body, color: theme.colors.textMuted },
});

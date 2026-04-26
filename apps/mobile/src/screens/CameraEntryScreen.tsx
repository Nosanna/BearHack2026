import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Ionicons from '@expo/vector-icons/Ionicons';
import { api } from '../api/client';
import { theme } from '../theme';
import type { RootStackParamList } from '../navigation/AppShell';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function CameraEntryScreen() {
  const nav = useNavigation<Nav>();
  const qc = useQueryClient();
  const rooms = useQuery({ queryKey: ['rooms'], queryFn: () => api.listRooms() });
  const [newRoomName, setNewRoomName] = useState('');
  const [creating, setCreating] = useState(false);
  const [showNewRoom, setShowNewRoom] = useState(false);

  useFocusEffect(
    useCallback(() => {
      qc.invalidateQueries({ queryKey: ['rooms'] });
    }, [qc]),
  );

  const createRoom = async () => {
    if (!newRoomName.trim()) return;
    setCreating(true);
    try {
      await api.createRoom(newRoomName.trim());
      setNewRoomName('');
      setShowNewRoom(false);
      await rooms.refetch();
    } catch (e) {
      Alert.alert('Could not create space', (e as Error).message);
    } finally {
      setCreating(false);
    }
  };

  const openCameraNoRoom = () => {
    nav.navigate('Camera', { mode: 'register' });
  };

  const totalAppliances = (rooms.data ?? []).reduce(
    (acc, r) => acc + (r.applianceCount ?? 0),
    0,
  );
  const totalDue = (rooms.data ?? []).reduce(
    (acc, r) => acc + (r.openMaintenanceCount ?? 0),
    0,
  );

  return (
    <SafeAreaView style={styles.root}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={rooms.isFetching}
              onRefresh={() => rooms.refetch()}
              tintColor={theme.colors.accent}
            />
          }
        >
          <View style={styles.header}>
            <Text style={styles.title}>Your Equipment</Text>
            <Text style={styles.subtitle}>
              {rooms.data?.length
                ? `${totalAppliances} item${totalAppliances === 1 ? '' : 's'} across ${rooms.data.length} space${rooms.data.length === 1 ? '' : 's'}${
                    totalDue > 0 ? ` · ${totalDue} due` : ''
                  }`
                : 'Organize the things in your home, space by space.'}
            </Text>
          </View>

          <Pressable style={styles.primaryCta} onPress={openCameraNoRoom}>
            <View style={styles.primaryCtaIcon}>
              <Ionicons name="camera" size={22} color={theme.colors.bg} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.primaryCtaTitle}>Add equipment</Text>
              <Text style={styles.primaryCtaSubtitle}>
                Snap a photo and we'll identify it.
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={theme.colors.bg} />
          </Pressable>

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Spaces</Text>
            <Pressable
              hitSlop={8}
              onPress={() => setShowNewRoom((v) => !v)}
              style={styles.sectionAction}
            >
              <Ionicons
                name={showNewRoom ? 'remove' : 'add'}
                size={16}
                color={theme.colors.accent}
              />
              <Text style={styles.sectionActionText}>
                {showNewRoom ? 'Cancel' : 'New space'}
              </Text>
            </Pressable>
          </View>

          {showNewRoom && (
            <View style={styles.newRoomCard}>
              <TextInput
                placeholder="e.g. Kitchen"
                placeholderTextColor={theme.colors.textMuted}
                value={newRoomName}
                onChangeText={setNewRoomName}
                style={styles.input}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={createRoom}
              />
              <Pressable
                style={[
                  styles.createBtn,
                  (!newRoomName.trim() || creating) && styles.createBtnDisabled,
                ]}
                disabled={!newRoomName.trim() || creating}
                onPress={createRoom}
              >
                <Text style={styles.createBtnText}>
                  {creating ? 'Creating…' : 'Create space'}
                </Text>
              </Pressable>
            </View>
          )}

          {rooms.isLoading && (
            <View style={{ paddingVertical: theme.spacing.xl }}>
              <ActivityIndicator color={theme.colors.accent} />
            </View>
          )}

          {!rooms.isLoading && (rooms.data?.length ?? 0) === 0 && !showNewRoom && (
            <Pressable
              style={styles.emptyCard}
              onPress={() => setShowNewRoom(true)}
            >
              <View style={styles.emptyIconWrap}>
                <Ionicons name="home-outline" size={28} color={theme.colors.accent} />
              </View>
              <Text style={styles.emptyTitle}>Create your first space</Text>
              <Text style={styles.emptyBody}>
                Group equipment by where it lives — kitchen, garage, basement, etc.
              </Text>
              <View style={styles.emptyCta}>
                <Text style={styles.emptyCtaText}>Get started</Text>
                <Ionicons
                  name="chevron-forward"
                  size={16}
                  color={theme.colors.accent}
                />
              </View>
            </Pressable>
          )}

          {(rooms.data ?? []).map((r) => (
            <Pressable
              key={r.id}
              style={({ pressed }) => [styles.roomCard, pressed && styles.roomCardPressed]}
              onPress={() => nav.navigate('RoomDetail', { roomId: r.id })}
            >
              {r.previewImageUrl ? (
                <Image
                  source={{ uri: r.previewImageUrl }}
                  style={styles.roomThumb}
                />
              ) : (
                <View style={[styles.roomThumb, styles.roomThumbFallback]}>
                  <Ionicons
                    name="cube-outline"
                    size={24}
                    color={theme.colors.textMuted}
                  />
                </View>
              )}

              <View style={styles.roomMain}>
                <Text style={styles.roomName} numberOfLines={1}>
                  {r.name}
                </Text>
                <Text style={styles.roomMeta}>
                  {r.applianceCount === 0
                    ? 'No equipment yet'
                    : `${r.applianceCount} item${r.applianceCount === 1 ? '' : 's'}`}
                </Text>
              </View>

              {(r.openMaintenanceCount ?? 0) > 0 && (
                <View style={styles.dueBadge}>
                  <Text style={styles.dueBadgeText}>{r.openMaintenanceCount}</Text>
                </View>
              )}

              <Ionicons
                name="chevron-forward"
                size={18}
                color={theme.colors.textMuted}
              />
            </Pressable>
          ))}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.bg },
  content: {
    padding: theme.spacing.lg,
    paddingBottom: theme.spacing.xl * 2,
  },
  header: { marginBottom: theme.spacing.lg },
  title: { ...theme.font.title, color: theme.colors.text },
  subtitle: {
    ...theme.font.body,
    color: theme.colors.textMuted,
    marginTop: 4,
  },

  primaryCta: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radius.lg,
    paddingVertical: 14,
    paddingHorizontal: theme.spacing.lg,
    gap: theme.spacing.md,
  },
  primaryCtaIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryCtaTitle: {
    ...theme.font.h2,
    color: theme.colors.bg,
    fontWeight: '700',
  },
  primaryCtaSubtitle: {
    ...theme.font.caption,
    color: 'rgba(0,0,0,0.65)',
    marginTop: 2,
  },

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
  sectionAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  sectionActionText: {
    ...theme.font.caption,
    color: theme.colors.accent,
    fontWeight: '600',
  },

  newRoomCard: {
    backgroundColor: theme.colors.bgElevated,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: theme.spacing.md,
  },
  input: {
    backgroundColor: theme.colors.bg,
    color: theme.colors.text,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: theme.spacing.md,
    fontSize: 15,
  },
  createBtn: {
    backgroundColor: theme.colors.accent,
    paddingVertical: 12,
    borderRadius: theme.radius.md,
    alignItems: 'center',
  },
  createBtnDisabled: { opacity: 0.5 },
  createBtnText: {
    ...theme.font.body,
    fontWeight: '600',
    color: theme.colors.bg,
  },

  roomCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
    gap: theme.spacing.md,
  },
  roomCardPressed: {
    backgroundColor: theme.colors.bgElevated,
    borderColor: theme.colors.accent,
  },
  roomThumb: {
    width: 56,
    height: 56,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.border,
  },
  roomThumbFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.bgElevated,
  },
  roomMain: { flex: 1 },
  roomName: {
    ...theme.font.h2,
    color: theme.colors.text,
  },
  roomMeta: {
    ...theme.font.caption,
    color: theme.colors.textMuted,
    marginTop: 2,
  },
  dueBadge: {
    minWidth: 26,
    height: 22,
    paddingHorizontal: 8,
    borderRadius: 11,
    backgroundColor: theme.colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dueBadgeText: {
    ...theme.font.caption,
    color: theme.colors.bg,
    fontWeight: '700',
  },

  emptyCard: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: theme.spacing.md,
  },
  emptyIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(249,115,22,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.spacing.md,
  },
  emptyTitle: {
    ...theme.font.h2,
    color: theme.colors.text,
    marginBottom: 4,
  },
  emptyBody: {
    ...theme.font.body,
    color: theme.colors.textMuted,
  },
  emptyCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: theme.spacing.md,
  },
  emptyCtaText: {
    ...theme.font.body,
    color: theme.colors.accent,
    fontWeight: '600',
  },
});

import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { RouteProp } from '@react-navigation/native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import { api, uploadToSignedUrl } from '../api/client';
import { theme } from '../theme';
import type { RootStackParamList } from '../navigation/AppShell';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Route = RouteProp<RootStackParamList, 'Camera'>;

export function CameraScreen() {
  const nav = useNavigation<Nav>();
  const route = useRoute<Route>();
  const qc = useQueryClient();
  const insets = useSafeAreaInsets();
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [busy, setBusy] = useState(false);

  // Inline space picker state — used when register mode is opened without a roomId
  const [pickerOpen, setPickerOpen] = useState(false);
  const [spaces, setSpaces] = useState<Array<{ id: string; name: string }> | null>(null);
  const [pendingPublicUrl, setPendingPublicUrl] = useState<string | null>(null);
  const [showNewSpace, setShowNewSpace] = useState(false);
  const [newSpaceName, setNewSpaceName] = useState('');
  const [creatingSpace, setCreatingSpace] = useState(false);

  useEffect(() => {
    if (permission && !permission.granted) requestPermission();
  }, [permission]);

  const analyzeAndNav = async (publicUrl: string, roomId: string) => {
    const analysis = await api.analyzeApplianceFromImage({ imageUrl: publicUrl });
    nav.replace('ApplianceSave', {
      roomId,
      imageUrl: publicUrl,
      typeOptions: analysis.typeOptions,
      suggested: analysis.suggested,
    });
  };

  const openSpacePickerForUrl = async (publicUrl: string) => {
    setPendingPublicUrl(publicUrl);
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

  const uploadAndHandleRegister = async (localUri: string, contentType: string) => {
    setBusy(true);
    try {
      const signed = await api.signedUpload({
        contentType,
        kind: route.params.mode === 'repair-step' ? 'repair-step' : 'appliance',
      });
      const publicUrl = await uploadToSignedUrl(signed, localUri);

      if (route.params.mode === 'register') {
        if (route.params.roomId) {
          await analyzeAndNav(publicUrl, route.params.roomId);
        } else {
          // No space chosen yet — let the user pick one inline.
          await openSpacePickerForUrl(publicUrl);
        }
      } else if (route.params.mode === 'repair-step') {
        if (!route.params.sessionId) throw new Error('Missing repair session.');
        const result = await api.submitRepairPhoto(route.params.sessionId, publicUrl);
        qc.setQueryData(['repair-session', route.params.sessionId], result.session);
        if (result.photoPassed === false) {
          Alert.alert('Photo did not match', result.feedback ?? 'Please try again.');
        } else if (result.feedback && /\(stubbed\)/i.test(result.feedback)) {
          Alert.alert('Heads up', result.feedback);
        }
        nav.goBack();
      }
    } catch (e) {
      Alert.alert('Something went wrong', (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const onPickSpace = async (roomId: string) => {
    if (!pendingPublicUrl) return;
    setBusy(true);
    try {
      setPickerOpen(false);
      await analyzeAndNav(pendingPublicUrl, roomId);
      setPendingPublicUrl(null);
    } catch (e) {
      Alert.alert('Could not analyze photo', (e as Error).message);
    } finally {
      setBusy(false);
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
      await onPickSpace(created.id);
    } catch (e) {
      Alert.alert('Could not create space', (e as Error).message);
    } finally {
      setCreatingSpace(false);
    }
  };

  const capture = async () => {
    if (!cameraRef.current || busy) return;
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.8 });
      if (!photo) throw new Error('Capture failed.');
      await uploadAndHandleRegister(photo.uri, 'image/jpeg');
    } catch (e) {
      Alert.alert('Something went wrong', (e as Error).message);
    }
  };

  const pickFromLibrary = async () => {
    if (busy) return;
    try {
      const picked = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.9,
      });
      if (picked.canceled) return;
      const asset = picked.assets?.[0];
      if (!asset?.uri) return;
      await uploadAndHandleRegister(asset.uri, asset.mimeType ?? 'image/jpeg');
    } catch (e) {
      Alert.alert('Upload failed', (e as Error).message);
    }
  };

  if (!permission) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={theme.colors.accent} />
      </View>
    );
  }
  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Text style={styles.text}>Camera access is required.</Text>
        <Pressable onPress={requestPermission} style={styles.button}>
          <Text style={styles.buttonText}>Grant permission</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: 'black' }}>
      <CameraView ref={cameraRef} style={{ flex: 1 }} facing="back" />
      <View style={[styles.controls, { bottom: insets.bottom + 56 }]}>
        {route.params.mode === 'register' && (
          <Pressable
            style={[styles.iconBtn, busy && { opacity: 0.5 }]}
            disabled={busy}
            onPress={pickFromLibrary}
          >
            <Ionicons name="images-outline" size={22} color="white" />
          </Pressable>
        )}
        <Pressable
          style={[styles.shutter, busy && { opacity: 0.5 }]}
          disabled={busy}
          onPress={capture}
        >
          {busy ? (
            <ActivityIndicator color={theme.colors.bg} />
          ) : (
            <View style={styles.shutterInner} />
          )}
        </Pressable>
        {route.params.mode === 'register' && <View style={{ width: 42 }} />}
      </View>

      <Modal
        visible={pickerOpen}
        animationType="slide"
        transparent
        onRequestClose={() => !busy && !creatingSpace && setPickerOpen(false)}
      >
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.modalBackdrop}>
            <View style={styles.modalCard}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Which space is it in?</Text>
                <Pressable
                  onPress={() => !busy && !creatingSpace && setPickerOpen(false)}
                  hitSlop={12}
                >
                  <Ionicons name="close" size={22} color={theme.colors.text} />
                </Pressable>
              </View>

              {spaces === null ? (
                <ActivityIndicator color={theme.colors.accent} style={{ marginVertical: 24 }} />
              ) : (
                <>
                  {spaces.length === 0 && !showNewSpace && (
                    <Text style={styles.modalSubtle}>
                      You don't have any spaces yet — create one to get started.
                    </Text>
                  )}

                  <FlatList
                    data={spaces}
                    keyExtractor={(r) => r.id}
                    ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
                    renderItem={({ item }) => (
                      <Pressable
                        style={styles.roomRow}
                        disabled={busy || creatingSpace}
                        onPress={() => onPickSpace(item.id)}
                      >
                        <Ionicons name="cube-outline" size={20} color={theme.colors.accent} />
                        <Text style={styles.roomName}>{item.name}</Text>
                        <Ionicons
                          name="chevron-forward"
                          size={18}
                          color={theme.colors.textMuted}
                        />
                      </Pressable>
                    )}
                    ListFooterComponent={
                      showNewSpace ? (
                        <View style={[styles.newSpaceCard, { marginTop: spaces.length > 0 ? 8 : 0 }]}>
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
                          <View style={{ flexDirection: 'row', gap: 8 }}>
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
                          style={[styles.addSpaceRow, { marginTop: spaces.length > 0 ? 8 : 0 }]}
                          onPress={() => setShowNewSpace(true)}
                        >
                          <Ionicons name="add" size={18} color={theme.colors.accent} />
                          <Text style={styles.addSpaceText}>New space</Text>
                        </Pressable>
                      )
                    }
                  />
                </>
              )}

              {busy && (
                <View style={styles.busyOverlay}>
                  <ActivityIndicator color={theme.colors.accent} />
                  <Text style={styles.modalSubtle}>Analyzing…</Text>
                </View>
              )}
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.bg },
  text: { ...theme.font.body, color: theme.colors.text, marginBottom: theme.spacing.lg },
  button: {
    backgroundColor: theme.colors.accent,
    paddingHorizontal: theme.spacing.xl,
    paddingVertical: 12,
    borderRadius: theme.radius.md,
  },
  buttonText: { ...theme.font.body, fontWeight: '600', color: theme.colors.bg },
  controls: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  iconBtn: {
    width: 42,
    height: 42,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    backgroundColor: 'rgba(255,255,255,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutter: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: 'white',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 3,
    borderColor: theme.colors.bg,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: theme.colors.bgElevated,
    borderTopLeftRadius: theme.radius.lg,
    borderTopRightRadius: theme.radius.lg,
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.lg,
    paddingBottom: theme.spacing.xl,
    maxHeight: '70%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
  },
  modalTitle: { ...theme.font.h2, color: theme.colors.text },
  modalSubtle: { ...theme.font.body, color: theme.colors.textMuted, marginVertical: 8 },
  roomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.bg,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  roomName: { ...theme.font.body, color: theme.colors.text, flex: 1 },
  primaryBtn: {
    marginTop: 12,
    backgroundColor: theme.colors.accent,
    paddingVertical: 12,
    borderRadius: theme.radius.md,
    alignItems: 'center',
  },
  primaryBtnText: { ...theme.font.body, color: theme.colors.bg, fontWeight: '600' },
  addSpaceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 14,
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
    gap: 8,
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
  busyOverlay: {
    position: 'absolute',
    inset: 0 as unknown as number,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderTopLeftRadius: theme.radius.lg,
    borderTopRightRadius: theme.radius.lg,
  },
});

import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import type { RouteProp } from '@react-navigation/native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
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
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (permission && !permission.granted) requestPermission();
  }, [permission]);

  const capture = async () => {
    if (!cameraRef.current || busy) return;
    setBusy(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.8 });
      if (!photo) throw new Error('Capture failed.');

      const signed = await api.signedUpload({
        contentType: 'image/jpeg',
        kind: route.params.mode === 'register' ? 'appliance' : 'repair-step',
      });
      const publicUrl = await uploadToSignedUrl(signed, photo.uri);

      if (route.params.mode === 'register') {
        if (!route.params.roomId) throw new Error('Missing room.');
        const result = await api.registerFromImage({
          roomId: route.params.roomId,
          imageUrl: publicUrl,
        });
        nav.replace('ApplianceDetail', { applianceId: result.appliance.id });
      } else {
        if (!route.params.sessionId) throw new Error('Missing repair session.');
        const result = await api.submitRepairPhoto(route.params.sessionId, publicUrl);
        // Update the AssistantScreen's cache so it renders the post-photo state
        // instead of the stale verify_photo step.
        qc.setQueryData(['repair-session', route.params.sessionId], result.session);
        if (result.photoPassed === false) {
          Alert.alert('Photo did not match', result.feedback ?? 'Please try again.');
        }
        nav.goBack();
      }
    } catch (e) {
      Alert.alert('Something went wrong', (e as Error).message);
    } finally {
      setBusy(false);
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
      <View style={styles.controls}>
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
      </View>
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
    bottom: 32,
    left: 0,
    right: 0,
    alignItems: 'center',
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
});

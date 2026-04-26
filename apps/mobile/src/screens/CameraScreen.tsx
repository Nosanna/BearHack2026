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
import * as ImagePicker from 'expo-image-picker';
import Ionicons from '@expo/vector-icons/Ionicons';
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

  const uploadAndHandleRegister = async (localUri: string, contentType: string) => {
    setBusy(true);
    try {
      const signed = await api.signedUpload({
        contentType,
        kind: route.params.mode === 'register' ? 'appliance' : 'repair-step',
      });
      const publicUrl = await uploadToSignedUrl(signed, localUri);

      if (route.params.mode === 'register') {
        if (!route.params.roomId) throw new Error('Missing room.');
        const analysis = await api.analyzeApplianceFromImage({ imageUrl: publicUrl });
        nav.replace('ApplianceSave', {
          roomId: route.params.roomId,
          imageUrl: publicUrl,
          typeOptions: analysis.typeOptions,
          suggested: analysis.suggested,
        });
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
      <View style={styles.controls}>
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
});

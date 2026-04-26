import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import type { RouteProp } from '@react-navigation/native';
import { useIsFocused, useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { api, uploadToSignedUrl } from '../api/client';
import { theme } from '../theme';
import type { RootStackParamList } from '../navigation/AppShell';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Route = RouteProp<RootStackParamList, 'LintGuidedCamera'>;

type Box = { label: string; confidence: number; bbox: { x: number; y: number; w: number; h: number } };

export function LintGuidedCameraScreen() {
  const nav = useNavigation<Nav>();
  const route = useRoute<Route>();
  const isFocused = useIsFocused();
  const sessionId = route.params.sessionId;

  const camRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [busy, setBusy] = useState(false);
  const [boxes, setBoxes] = useState<Box[]>([]);
  const [previewSize, setPreviewSize] = useState<{ w: number; h: number }>({ w: 1, h: 1 });

  useEffect(() => {
    if (permission && !permission.granted) requestPermission();
  }, [permission]);

  useEffect(() => {
    if (!isFocused) return;
    if (!permission?.granted) return;
    let timer: any = null;
    let stopped = false;

    const tick = async () => {
      if (busy || stopped) return;
      try {
        setBusy(true);
        const pic = await camRef.current?.takePictureAsync({ quality: 0.4, skipProcessing: true });
        if (!pic?.uri) return;

        const signed = await api.signedUpload({ contentType: 'image/jpeg', kind: 'repair-step' });
        const publicUrl = await uploadToSignedUrl(signed, pic.uri);
        const det = await api.detectParts({ imageUrl: publicUrl });
        setBoxes(det.detections);
      } catch (e) {
        // don’t spam alerts while streaming; show once
        if (!stopped) Alert.alert('Detection failed', (e as Error).message);
        stopped = true;
      } finally {
        setBusy(false);
      }
    };

    // ~3fps
    timer = setInterval(tick, 350);
    void tick();
    return () => {
      stopped = true;
      if (timer) clearInterval(timer);
    };
  }, [isFocused, permission?.granted, busy]);

  const overlays = useMemo(() => {
    return boxes.map((b, idx) => {
      const w = previewSize.w * b.bbox.w;
      const h = previewSize.h * b.bbox.h;
      const left = previewSize.w * (b.bbox.x - b.bbox.w / 2);
      const top = previewSize.h * (b.bbox.y - b.bbox.h / 2);
      const isLint = /lint/i.test(b.label);
      return (
        <View
          key={`${b.label}-${idx}`}
          style={[
            styles.box,
            {
              borderColor: isLint ? theme.colors.accent : theme.colors.border,
              left,
              top,
              width: w,
              height: h,
            },
          ]}
        >
          <View style={[styles.boxLabel, { backgroundColor: isLint ? theme.colors.accent : theme.colors.bgElevated }]}>
            <Text style={[styles.boxLabelText, { color: isLint ? theme.colors.bg : theme.colors.text }]}>
              {b.label} {(b.confidence * 100).toFixed(0)}%
            </Text>
          </View>
        </View>
      );
    });
  }, [boxes, previewSize]);

  const onNext = () => {
    nav.replace('Assistant', { sessionId });
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
        <Text style={styles.text}>Camera permission is required.</Text>
        <Pressable style={styles.button} onPress={() => requestPermission()}>
          <Text style={styles.buttonText}>Grant permission</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <View
        style={styles.previewWrap}
        onLayout={(e) => setPreviewSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
      >
        <CameraView ref={camRef} style={StyleSheet.absoluteFill} facing="back" />
        {overlays}
      </View>

      <View style={styles.footer}>
        <Text style={styles.hint}>Point the camera at the lint filter. Boxes will highlight parts.</Text>
        <Pressable style={styles.next} onPress={onNext}>
          <Text style={styles.nextText}>Next</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.bg },
  text: { ...theme.font.body, color: theme.colors.text, marginBottom: theme.spacing.md },
  previewWrap: { flex: 1, position: 'relative', backgroundColor: theme.colors.border },
  footer: { padding: theme.spacing.lg, gap: theme.spacing.md, backgroundColor: theme.colors.bg },
  hint: { ...theme.font.caption, color: theme.colors.textMuted },
  next: {
    backgroundColor: theme.colors.accent,
    paddingVertical: 14,
    borderRadius: theme.radius.md,
    alignItems: 'center',
  },
  nextText: { ...theme.font.body, fontWeight: '700', color: theme.colors.bg },
  box: { position: 'absolute', borderWidth: 2, borderRadius: 6 },
  boxLabel: { position: 'absolute', left: 0, top: 0, paddingHorizontal: 6, paddingVertical: 2, borderBottomRightRadius: 6 },
  boxLabelText: { ...theme.font.caption, fontWeight: '700' },
  button: {
    backgroundColor: theme.colors.accent,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: theme.radius.md,
  },
  buttonText: { ...theme.font.body, fontWeight: '700', color: theme.colors.bg },
});


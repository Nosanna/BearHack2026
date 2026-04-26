import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, StyleSheet, Text, View } from 'react-native';
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

function clamp01(n: number) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function rotate90CW(b: Box): Box {
  // Normalized xywh (center-based) rotation 90° clockwise around image center.
  // x' = 1 - y, y' = x, w' = h, h' = w
  const x = clamp01(b.bbox.x);
  const y = clamp01(b.bbox.y);
  const w = clamp01(b.bbox.w);
  const h = clamp01(b.bbox.h);
  return { ...b, bbox: { x: clamp01(1 - y), y: clamp01(x), w: h, h: w } };
}

export function LintGuidedCameraScreen() {
  const nav = useNavigation<Nav>();
  const route = useRoute<Route>();
  const isFocused = useIsFocused();
  const { applianceId, taskId } = route.params;

  const camRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState<'camera' | 'review'>('camera');
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [captureSize, setCaptureSize] = useState<{ w: number; h: number } | null>(null);
  const [target, setTarget] = useState<Box | null>(null);
  const [imgLayout, setImgLayout] = useState<{ w: number; h: number }>({ w: 1, h: 1 });

  useEffect(() => {
    if (permission && !permission.granted) requestPermission();
  }, [permission]);

  const takeOnePhoto = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      const pic = await camRef.current?.takePictureAsync({ quality: 1.0, skipProcessing: false });
      if (!pic?.uri) throw new Error('No photo captured.');
      const w = pic.width ?? 0;
      const h = pic.height ?? 0;
      setCaptureSize({ w, h });

      const signed = await api.signedUpload({ contentType: 'image/jpeg', kind: 'repair-step' });
      const publicUrl = await uploadToSignedUrl(signed, pic.uri);
      setImageUrl(publicUrl);

      const det = await api.detectParts({ imageUrl: publicUrl });
      const raw = det.detections ?? [];
      const pickBest = (pred: (d: any) => boolean) =>
        raw
          .filter(pred)
          .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))[0] ?? null;

      const filterBox = pickBest((d) => String(d.label ?? '').toLowerCase().includes('filter') && (d.confidence ?? 0) >= 0.3);
      const drumBox = pickBest((d) => String(d.label ?? '').toLowerCase().includes('drum'));
      setTarget((filterBox ?? drumBox) as Box | null);

      setStage('review');
    } catch (e) {
      Alert.alert('Could not capture', (e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [busy]);

  const rect = useMemo(() => {
    if (!target || !captureSize) return null;
    const cw = captureSize.w;
    const ch = captureSize.h;
    if (!cw || !ch) return null;

    // Image is rendered with resizeMode='contain' inside imgLayout.
    const scale = Math.min(imgLayout.w / cw, imgLayout.h / ch);
    const dispW = cw * scale;
    const dispH = ch * scale;
    const offsetX = (imgLayout.w - dispW) / 2;
    const offsetY = (imgLayout.h - dispH) / 2;

    const x = clamp01(target.bbox.x);
    const y = clamp01(target.bbox.y);
    const w = clamp01(target.bbox.w);
    const h = clamp01(target.bbox.h);

    const left = offsetX + (x - w / 2) * cw * scale;
    const top = offsetY + (y - h / 2) * ch * scale;
    const width = w * cw * scale;
    const height = h * ch * scale;

    return { left, top, width, height };
  }, [target, captureSize, imgLayout]);

  const instructions = useMemo(() => {
    const hasFilter = !!target && String(target.label ?? '').toLowerCase().includes('filter');
    return hasFilter
      ? '1) Pull the lint filter out.\n2) Peel lint off by hand.\n3) Rinse under warm water if needed, then dry fully.\n4) Reinsert the filter.'
      : 'We could not confidently find the lint filter.\nLook near the drum opening and the door area. Clean the lint screen/filter and reinsert it fully.';
  }, [target]);

  const [advancing, setAdvancing] = useState(false);
  const onMarkDone = async () => {
    if (advancing) return;
    setAdvancing(true);
    try {
      await api.completeTask(taskId);
      nav.goBack();
    } catch (e) {
      Alert.alert('Could not complete task', (e as Error).message);
      setAdvancing(false);
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
        <Text style={styles.text}>Camera permission is required.</Text>
        <Pressable style={styles.button} onPress={() => requestPermission()}>
          <Text style={styles.buttonText}>Grant permission</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      {stage === 'camera' ? (
        <View style={styles.cameraWrap}>
          <CameraView ref={camRef} style={StyleSheet.absoluteFill} facing="back" />
          <View style={styles.footer}>
            <Text style={styles.hint}>Take a photo so we can label the lint filter.</Text>
            <Pressable style={[styles.next, busy && { opacity: 0.7 }]} onPress={takeOnePhoto} disabled={busy}>
              <Text style={styles.nextText}>{busy ? 'Working…' : 'Take photo'}</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <View style={styles.reviewWrap}>
          <View style={styles.reviewRow}>
            <View
              style={styles.imagePane}
              onLayout={(e) => setImgLayout({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
            >
              {imageUrl ? (
                <>
                  <Image source={{ uri: imageUrl }} style={StyleSheet.absoluteFill} resizeMode="contain" />
                  {rect ? (
                    <View style={[styles.box, { left: rect.left, top: rect.top, width: rect.width, height: rect.height }]}>
                      <View style={styles.boxLabel}>
                        <Text style={styles.boxLabelText}>
                          {target?.label ?? 'target'} {(((target?.confidence ?? 0) * 100) as number).toFixed(0)}%
                        </Text>
                      </View>
                    </View>
                  ) : null}
                </>
              ) : (
                <View style={styles.center}>
                  <ActivityIndicator color={theme.colors.accent} />
                </View>
              )}
            </View>
            <View style={styles.instructionPane}>
              <Text style={styles.instructionsTitle}>
                {target && String(target.label ?? '').toLowerCase().includes('filter') ? 'Lint filter' : 'Drum area'}
              </Text>
              <Text style={styles.instructionsBody}>{instructions}</Text>
            </View>
          </View>
          <View style={styles.footer}>
            <Pressable style={[styles.next, advancing && { opacity: 0.7 }]} onPress={onMarkDone} disabled={advancing}>
              <Text style={styles.nextText}>{advancing ? 'Saving…' : 'Mark done'}</Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.bg },
  text: { ...theme.font.body, color: theme.colors.text, marginBottom: theme.spacing.md },
  cameraWrap: { flex: 1, position: 'relative', backgroundColor: theme.colors.border },
  reviewWrap: { flex: 1 },
  reviewRow: { flex: 1, flexDirection: 'row' },
  imagePane: { flex: 1, backgroundColor: theme.colors.border, position: 'relative' },
  instructionPane: { width: 160, padding: theme.spacing.md, backgroundColor: theme.colors.bgElevated },
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
  boxLabel: { position: 'absolute', left: 0, top: 0, paddingHorizontal: 6, paddingVertical: 2, borderBottomRightRadius: 6, backgroundColor: theme.colors.accent },
  boxLabelText: { ...theme.font.caption, fontWeight: '700', color: theme.colors.bg },
  instructionsTitle: { ...theme.font.h2, color: theme.colors.text, marginBottom: theme.spacing.sm },
  instructionsBody: { ...theme.font.body, color: theme.colors.text, lineHeight: 20 },
  button: {
    backgroundColor: theme.colors.accent,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: theme.radius.md,
  },
  buttonText: { ...theme.font.body, fontWeight: '700', color: theme.colors.bg },
});


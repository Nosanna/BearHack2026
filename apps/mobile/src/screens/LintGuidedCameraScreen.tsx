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
  const { applianceId, taskTitle, taskDescription } = route.params;

  const camRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [busy, setBusy] = useState(false);
  const [boxes, setBoxes] = useState<Box[]>([]);
  const [previewSize, setPreviewSize] = useState<{ w: number; h: number }>({ w: 1, h: 1 });
  const [lastCaptureSize, setLastCaptureSize] = useState<{ w: number; h: number } | null>(null);

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
        const pic = await camRef.current?.takePictureAsync({ quality: 1.0, skipProcessing: false });
        if (!pic?.uri) return;
        setLastCaptureSize({ w: pic.width ?? 0, h: pic.height ?? 0 });
        // #region agent log
        fetch('http://127.0.0.1:7901/ingest/858e3ef0-15fa-4006-be55-bfedf1b0470c',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'239de5'},body:JSON.stringify({sessionId:'239de5',runId:'pre-fix',hypothesisId:'B1',location:'LintGuidedCameraScreen.tsx:tick-capture',message:'Captured frame + preview sizing',data:{quality:1.0,skipProcessing:false,picW:pic.width??null,picH:pic.height??null,previewW:previewSize.w,previewH:previewSize.h,uriPrefix:String(pic.uri).slice(0,30)},timestamp:Date.now()})}).catch(()=>{});
        // #endregion agent log

        const signed = await api.signedUpload({ contentType: 'image/jpeg', kind: 'repair-step' });
        const publicUrl = await uploadToSignedUrl(signed, pic.uri);
        const det = await api.detectParts({ imageUrl: publicUrl });
        if (__DEV__) {
          const raw = det.detections ?? [];
          const filterLike = raw
            .map((d) => ({ label: String(d.label ?? ''), confidence: d.confidence ?? 0 }))
            .filter((d) => d.label.toLowerCase().includes('filter'));
          console.log('[lintflow][raw] detections', {
            rawCount: raw.length,
            rawTop3: raw
              .slice(0, 3)
              .map((d) => ({ label: d.label, confidence: d.confidence, bbox: d.bbox })),
            filterLike,
          });
        }
        const filtered = (det.detections ?? []).filter((d) => {
          const conf = d.confidence ?? 0;
          const label = String(d.label ?? '').toLowerCase();
          const isFilter = label.includes('filter');
          return isFilter ? conf >= 0.3 : conf >= 0.7;
        });
        setBoxes(filtered);
        // #region agent log
        fetch('http://127.0.0.1:7901/ingest/858e3ef0-15fa-4006-be55-bfedf1b0470c',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'239de5'},body:JSON.stringify({sessionId:'239de5',runId:'pre-fix',hypothesisId:'B2',location:'LintGuidedCameraScreen.tsx:tick-detections',message:'Received detections',data:{count:det.detections?.length??0,count70:filtered.length,first:det.detections?.[0]??null,first70:filtered[0]??null},timestamp:Date.now()})}).catch(()=>{});
        // #endregion agent log

        // Evidence for orientation mismatch debugging (view stays portrait, capture flips).
        if (__DEV__) {
          console.log('[lintflow][bbox] preview/capture', {
            previewW: Math.round(previewSize.w),
            previewH: Math.round(previewSize.h),
            picW: pic.width ?? null,
            picH: pic.height ?? null,
            first70: filtered[0] ?? null,
          });
        }
      } catch (e) {
        // don’t spam alerts while streaming; show once
        if (!stopped) Alert.alert('Detection failed', (e as Error).message);
        stopped = true;
      } finally {
        setBusy(false);
      }
    };

    // ~1.25fps (accuracy > smoothness; keep some responsiveness)
    timer = setInterval(tick, 800);
    void tick();
    return () => {
      stopped = true;
      if (timer) clearInterval(timer);
    };
  }, [isFocused, permission?.granted, busy]);

  const overlays = useMemo(() => {
    const picW = lastCaptureSize?.w ?? 0;
    const picH = lastCaptureSize?.h ?? 0;
    const previewIsPortrait = previewSize.h >= previewSize.w;
    const captureIsLandscape = picW > 0 && picH > 0 && picW > picH;

    // If the UI is portrait-locked but the capture is landscape, rotate bboxes.
    // This fixes the common iOS behavior where takePictureAsync swaps width/height
    // while the app remains portrait.
    const normalizedForPreview =
      previewIsPortrait && captureIsLandscape ? boxes.map(rotate90CW) : boxes;

    if (__DEV__) {
      console.log('[lintflow][bbox] map', {
        previewW: Math.round(previewSize.w),
        previewH: Math.round(previewSize.h),
        picW,
        picH,
        rotated: previewIsPortrait && captureIsLandscape,
      });
    }

    return normalizedForPreview.map((b, idx) => {
      const w = previewSize.w * clamp01(b.bbox.w);
      const h = previewSize.h * clamp01(b.bbox.h);
      const left = previewSize.w * (clamp01(b.bbox.x) - clamp01(b.bbox.w) / 2);
      const top = previewSize.h * (clamp01(b.bbox.y) - clamp01(b.bbox.h) / 2);
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
  }, [boxes, previewSize, lastCaptureSize]);

  const [advancing, setAdvancing] = useState(false);
  const onNext = async () => {
    if (advancing) return;
    setAdvancing(true);
    try {
      const symptomText = [
        `Perform maintenance task: ${taskTitle}`,
        taskDescription ? `Details: ${taskDescription}` : null,
        'Make this a safe step-by-step maintenance checklist as a state machine.',
      ]
        .filter(Boolean)
        .join('\n');
      // #region agent log
      fetch('http://127.0.0.1:7901/ingest/858e3ef0-15fa-4006-be55-bfedf1b0470c',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'239de5'},body:JSON.stringify({sessionId:'239de5',runId:'pre-fix',hypothesisId:'G3',location:'LintGuidedCameraScreen.tsx:onNext',message:'Starting repair session AFTER YOLO step',data:{applianceId,taskTitle},timestamp:Date.now()})}).catch(()=>{});
      // #endregion agent log
      console.log('[lintflow] Next pressed → startRepair now', { applianceId, taskTitle });
      const session = await api.startRepair({ applianceId, symptom: symptomText });
      nav.replace('Assistant', { sessionId: session.id });
    } catch (e) {
      Alert.alert('Could not start guided maintenance', (e as Error).message);
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
      <View
        style={styles.previewWrap}
        onLayout={(e) => setPreviewSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
      >
        <CameraView ref={camRef} style={StyleSheet.absoluteFill} facing="back" />
        {overlays}
      </View>

      <View style={styles.footer}>
        <Text style={styles.hint}>Point the camera at the lint filter. Boxes will highlight parts.</Text>
        {lastCaptureSize?.w && lastCaptureSize?.h ? (
          <Text style={styles.hint}>
            Capture {lastCaptureSize.w}×{lastCaptureSize.h} · Preview {Math.round(previewSize.w)}×{Math.round(previewSize.h)}
          </Text>
        ) : null}
        <Pressable style={[styles.next, advancing && { opacity: 0.7 }]} onPress={onNext} disabled={advancing}>
          <Text style={styles.nextText}>{advancing ? 'Starting…' : 'Next'}</Text>
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


import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Audio } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../theme';
import { api } from '../api/client';

type VoiceMode = 'idle' | 'listening' | 'processing' | 'speaking' | 'error';

type ChatTurn = { role: 'user' | 'assistant'; text: string };

interface Props {
  visible: boolean;
  onClose: () => void;
}

/**
 * Android Auto-style hands-free voice overlay.
 *
 * Flow:
 *   idle -> (tap mic) -> listening -> (VAD silence) -> processing
 *   -> speaking (plays TTS) -> idle  (user re-taps mic to continue)
 *
 * Tapping the mic while listening *cancels* the turn (discards audio, returns
 * to idle). Manual end-of-turn isn't needed because the VAD auto-stops after
 * ~1.2s of trailing silence.
 */
export function VoiceOverlay({ visible, onClose }: Props) {
  const [mode, setMode] = useState<VoiceMode>('idle');
  const [error, setError] = useState<string | null>(null);
  const [lastUser, setLastUser] = useState<string | null>(null);
  const [lastAssistant, setLastAssistant] = useState<string | null>(null);
  const [chat, setChat] = useState<ChatTurn[]>([]);
  const [showText, setShowText] = useState(false);
  const [typed, setTyped] = useState('');

  const recordingRef = useRef<Audio.Recording | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);
  const vadRef = useRef<{ speechSeen: boolean; silenceMs: number; elapsedMs: number }>({
    speechSeen: false,
    silenceMs: 0,
    elapsedMs: 0,
  });
  const vadTickRef = useRef<NodeJS.Timeout | null>(null);
  const meterRef = useRef(new Animated.Value(0)).current;

  const ring1 = useRef(new Animated.Value(0)).current;
  const ring2 = useRef(new Animated.Value(0)).current;
  const ring3 = useRef(new Animated.Value(0)).current;
  const ringLoopRef = useRef<Animated.CompositeAnimation | null>(null);

  // ---- Lifecycle: open/close ----
  useEffect(() => {
    if (!visible) {
      void teardown();
      return;
    }
    return () => {
      void teardown();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // ---- Pulse animation, scaled by mode ----
  useEffect(() => {
    if (ringLoopRef.current) {
      ringLoopRef.current.stop();
      ringLoopRef.current = null;
    }
    if (!visible) return;
    const makeRing = (val: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(val, {
            toValue: 1,
            duration: 1800,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(val, {
            toValue: 0,
            duration: 0,
            useNativeDriver: true,
          }),
        ]),
      );
    const composite = Animated.parallel([
      makeRing(ring1, 0),
      makeRing(ring2, 600),
      makeRing(ring3, 1200),
    ]);
    composite.start();
    ringLoopRef.current = composite;
    return () => {
      composite.stop();
    };
  }, [visible, ring1, ring2, ring3]);

  // ---- Helpers ----
  const teardown = async () => {
    if (vadTickRef.current) {
      clearInterval(vadTickRef.current);
      vadTickRef.current = null;
    }
    try {
      const r = recordingRef.current;
      if (r) {
        await r.stopAndUnloadAsync().catch(() => null);
      }
    } catch {
      // ignore
    }
    recordingRef.current = null;
    try {
      const s = soundRef.current;
      if (s) {
        await s.unloadAsync().catch(() => null);
      }
    } catch {
      // ignore
    }
    soundRef.current = null;
    setMode('idle');
    setError(null);
  };

  const startListening = async () => {
    setError(null);
    try {
      const perm = await Audio.requestPermissionsAsync();
      if (!perm.granted) {
        setMode('error');
        setError('Microphone permission was denied.');
        return;
      }
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });
      const rec = new Audio.Recording();
      await rec.prepareToRecordAsync({
        ...Audio.RecordingOptionsPresets.HIGH_QUALITY,
        ios: {
          ...Audio.RecordingOptionsPresets.HIGH_QUALITY.ios,
          isMeteringEnabled: true,
        },
        android: {
          ...Audio.RecordingOptionsPresets.HIGH_QUALITY.android,
          isMeteringEnabled: true,
        },
      } as any);
      await rec.startAsync();
      recordingRef.current = rec;
      vadRef.current = { speechSeen: false, silenceMs: 0, elapsedMs: 0 };
      setMode('listening');
      if (vadTickRef.current) clearInterval(vadTickRef.current);
      vadTickRef.current = setInterval(async () => {
        const r = recordingRef.current;
        if (!r) return;
        try {
          const st: any = await r.getStatusAsync();
          const metering: number | undefined =
            typeof st.metering === 'number' ? st.metering : undefined;
          vadRef.current.elapsedMs += 200;
          if (metering != null) {
            // Map -60..0 dBFS -> 0..1 for visual feedback.
            const lvl = Math.max(0, Math.min(1, (metering + 60) / 60));
            Animated.timing(meterRef, {
              toValue: lvl,
              duration: 120,
              useNativeDriver: true,
            }).start();
            if (metering > -35) vadRef.current.speechSeen = true;
            if (vadRef.current.speechSeen && metering < -45) {
              vadRef.current.silenceMs += 200;
            } else {
              vadRef.current.silenceMs = 0;
            }
          }
          // 0.8s minimum + 1.2s of trailing silence after speech, OR 12s hard cap.
          const shouldStop =
            (vadRef.current.speechSeen &&
              vadRef.current.elapsedMs >= 800 &&
              vadRef.current.silenceMs >= 1200) ||
            vadRef.current.elapsedMs >= 12000;
          if (shouldStop) {
            if (vadTickRef.current) {
              clearInterval(vadTickRef.current);
              vadTickRef.current = null;
            }
            await stopAndProcess();
          }
        } catch {
          // ignore polling errors
        }
      }, 200);
    } catch (e) {
      setMode('error');
      setError((e as Error).message);
    }
  };

  const stopAndProcess = async () => {
    const rec = recordingRef.current;
    if (!rec) return;
    setMode('processing');
    let uri: string | null = null;
    try {
      await rec.stopAndUnloadAsync();
      uri = rec.getURI();
    } catch (e) {
      setMode('error');
      setError((e as Error).message);
      return;
    } finally {
      recordingRef.current = null;
    }
    if (!uri) {
      setMode('error');
      setError('No audio captured.');
      return;
    }
    if (!vadRef.current.speechSeen) {
      // User didn't actually say anything — return to idle without pinging the server.
      setMode('idle');
      return;
    }
    try {
      const res = await api.voiceAsk(
        { uri, mimeType: 'audio/mp4', filename: 'voice.m4a' },
        { history: chat },
      );
      const userTurn: ChatTurn = { role: 'user', text: '🎤' };
      const aiTurn: ChatTurn = { role: 'assistant', text: res.replyText };
      setChat((c) => [...c, userTurn, aiTurn]);
      setLastUser('🎤');
      setLastAssistant(res.replyText);
      if (res.audioBase64) {
        await playReply(res.audioBase64);
      } else {
        // No TTS — surface the reply and wait for the user to tap mic again.
        setMode('idle');
      }
    } catch (e) {
      setMode('error');
      setError((e as Error).message);
    }
  };

  const cancelListening = async () => {
    if (vadTickRef.current) {
      clearInterval(vadTickRef.current);
      vadTickRef.current = null;
    }
    const rec = recordingRef.current;
    recordingRef.current = null;
    if (rec) {
      try {
        await rec.stopAndUnloadAsync();
      } catch {
        // ignore
      }
    }
    vadRef.current = { speechSeen: false, silenceMs: 0, elapsedMs: 0 };
    meterRef.setValue(0);
    setMode('idle');
  };

  const playReply = async (base64: string) => {
    setMode('speaking');
    try {
      const sound = new Audio.Sound();
      soundRef.current = sound;
      await sound.loadAsync({ uri: `data:audio/mpeg;base64,${base64}` });
      sound.setOnPlaybackStatusUpdate((status) => {
        if (!status.isLoaded) return;
        if (status.didJustFinish) {
          sound.unloadAsync().catch(() => null);
          if (soundRef.current === sound) soundRef.current = null;
          // Settle back to idle — user explicitly taps mic to continue.
          setMode('idle');
        }
      });
      await sound.playAsync();
    } catch {
      setMode('idle');
    }
  };

  const onMicTap = () => {
    if (mode === 'idle' || mode === 'error') {
      void startListening();
    } else if (mode === 'listening') {
      // Tap-while-listening cancels the turn (VAD still auto-sends on silence).
      void cancelListening();
    }
    // 'processing' / 'speaking' — ignore taps.
  };

  const sendTyped = async () => {
    const text = typed.trim();
    if (!text) return;
    setError(null);
    setMode('processing');
    setLastUser(text);
    setTyped('');
    try {
      const res = await api.voiceAskText(text, { history: chat });
      setChat((c) => [...c, { role: 'user', text }, { role: 'assistant', text: res.replyText }]);
      setLastAssistant(res.replyText);
      if (res.audioBase64) {
        await playReply(res.audioBase64);
      } else {
        setMode('idle');
      }
    } catch (e) {
      setMode('error');
      setError((e as Error).message);
    }
  };

  // ---- UI ----
  const statusText = (() => {
    switch (mode) {
      case 'idle':
        return lastAssistant ? 'Tap mic to continue' : 'Tap to talk';
      case 'listening':
        return 'Listening… (tap to cancel)';
      case 'processing':
        return 'Thinking…';
      case 'speaking':
        return 'Speaking…';
      case 'error':
        return error ?? 'Something went wrong. Tap to try again.';
    }
  })();

  const ringStyle = (val: Animated.Value, base = 0) => ({
    transform: [
      {
        scale: val.interpolate({
          inputRange: [0, 1],
          outputRange: [1 + base, 1.9 + base],
        }),
      },
    ],
    opacity: val.interpolate({
      inputRange: [0, 0.6, 1],
      outputRange: [0.45, 0.18, 0],
    }),
  });

  const meterScale = meterRef.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.18],
  });

  const accentForMode = (() => {
    switch (mode) {
      case 'speaking':
        return theme.colors.success ?? theme.colors.accent;
      case 'error':
        return theme.colors.danger;
      default:
        return theme.colors.accent;
    }
  })();

  return (
    <Modal visible={visible} animationType="fade" onRequestClose={onClose} transparent={false}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.root}>
          <Pressable
            onPress={onClose}
            hitSlop={16}
            style={styles.closeBtn}
            accessibilityLabel="Close voice"
          >
            <Ionicons name="close" size={22} color={theme.colors.textMuted} />
          </Pressable>

          <Pressable
            onPress={() => setShowText((v) => !v)}
            hitSlop={16}
            style={styles.kbdBtn}
            accessibilityLabel={showText ? 'Hide keyboard' : 'Use keyboard instead'}
          >
            <Ionicons
              name={showText ? 'mic-outline' : 'chatbox-outline'}
              size={20}
              color={theme.colors.textMuted}
            />
          </Pressable>

          <View style={styles.middle}>
            {lastUser && mode !== 'idle' && (
              <Text style={styles.userLine} numberOfLines={2}>
                {lastUser}
              </Text>
            )}

            <View style={styles.micWrap}>
              <Animated.View style={[styles.ring, { backgroundColor: accentForMode }, ringStyle(ring1)]} />
              <Animated.View style={[styles.ring, { backgroundColor: accentForMode }, ringStyle(ring2)]} />
              <Animated.View style={[styles.ring, { backgroundColor: accentForMode }, ringStyle(ring3)]} />
              <Animated.View
                style={[
                  styles.mic,
                  { backgroundColor: accentForMode, transform: [{ scale: mode === 'listening' ? meterScale : 1 }] },
                ]}
              >
                <Pressable
                  onPress={onMicTap}
                  disabled={mode === 'processing' || mode === 'speaking'}
                  style={styles.micPress}
                  accessibilityLabel="Microphone"
                >
                  <Ionicons
                    name={
                      mode === 'speaking'
                        ? 'volume-high'
                        : mode === 'processing'
                          ? 'sync'
                          : mode === 'listening'
                            ? 'mic'
                            : mode === 'error'
                              ? 'alert'
                              : 'mic-outline'
                    }
                    size={48}
                    color={theme.colors.bg}
                  />
                </Pressable>
              </Animated.View>
            </View>

            <Text
              style={[styles.status, mode === 'error' && { color: theme.colors.danger }]}
              numberOfLines={3}
            >
              {statusText}
            </Text>
            {lastAssistant && (mode === 'speaking' || mode === 'idle') && (
              <Text style={styles.assistantLine}>{lastAssistant}</Text>
            )}
          </View>

          {showText ? (
            <View style={styles.textRow}>
              <TextInput
                value={typed}
                onChangeText={setTyped}
                placeholder="Type a message…"
                placeholderTextColor={theme.colors.textMuted}
                style={styles.textInput}
                multiline
                returnKeyType="send"
                onSubmitEditing={sendTyped}
                blurOnSubmit
                editable={mode !== 'processing'}
              />
              <Pressable
                onPress={sendTyped}
                disabled={!typed.trim() || mode === 'processing'}
                style={[styles.sendBtn, (!typed.trim() || mode === 'processing') && { opacity: 0.5 }]}
              >
                <Ionicons name="send" size={18} color={theme.colors.bg} />
              </Pressable>
            </View>
          ) : (
            <Text style={styles.hint}>Tap mic to talk · pause to send · tap mic again to cancel</Text>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const RING_SIZE = 200;
const MIC_SIZE = 116;

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: theme.colors.bg,
    paddingTop: theme.spacing.xl * 2,
    paddingBottom: theme.spacing.xl,
    paddingHorizontal: theme.spacing.lg,
  },
  closeBtn: {
    position: 'absolute',
    top: theme.spacing.xl + theme.spacing.sm,
    right: theme.spacing.lg,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.bgElevated,
    borderWidth: 1,
    borderColor: theme.colors.border,
    zIndex: 1,
  },
  kbdBtn: {
    position: 'absolute',
    top: theme.spacing.xl + theme.spacing.sm,
    left: theme.spacing.lg,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.bgElevated,
    borderWidth: 1,
    borderColor: theme.colors.border,
    zIndex: 1,
  },
  middle: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  userLine: {
    ...theme.font.caption,
    color: theme.colors.textMuted,
    marginBottom: theme.spacing.xl,
  },
  micWrap: {
    width: RING_SIZE,
    height: RING_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    width: MIC_SIZE,
    height: MIC_SIZE,
    borderRadius: MIC_SIZE / 2,
  },
  mic: {
    width: MIC_SIZE,
    height: MIC_SIZE,
    borderRadius: MIC_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  micPress: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  status: {
    ...theme.font.title,
    color: theme.colors.text,
    marginTop: theme.spacing.xl,
    textAlign: 'center',
  },
  assistantLine: {
    ...theme.font.body,
    color: theme.colors.textMuted,
    textAlign: 'center',
    marginTop: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
  },
  hint: {
    ...theme.font.caption,
    color: theme.colors.textMuted,
    textAlign: 'center',
  },
  textRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: theme.spacing.sm,
  },
  textInput: {
    flex: 1,
    backgroundColor: theme.colors.bgElevated,
    color: theme.colors.text,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    minHeight: 48,
    maxHeight: 140,
    textAlignVertical: 'top',
  },
  sendBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: theme.colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { api } from '../api/client';
import { theme } from '../theme';
import type { RootStackParamList } from '../navigation/AppShell';
import type { RepairSessionDto } from '@fixit/shared';
import { StepDiagram } from '../components/StepDiagram';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Route = RouteProp<RootStackParamList, 'Assistant'>;

export function AssistantScreen() {
  const route = useRoute<Route>();
  const nav = useNavigation<Nav>();
  const qc = useQueryClient();
  const [answer, setAnswer] = useState('');
  const [busy, setBusy] = useState(false);
  const sessionId = route.params.sessionId;

  const session = useQuery({
    queryKey: ['repair-session', sessionId],
    queryFn: async (): Promise<RepairSessionDto> => {
      // Re-derive via /respond with empty? No — we don't have a GET endpoint.
      // First load comes from the cache populated by startRepair; otherwise we
      // ping /respond with a no-op sentinel. Simpler: rely on queryClient seeding.
      const cached = qc.getQueryData<RepairSessionDto>(['repair-session', sessionId]);
      if (cached) return cached;
      // Fallback: send an empty answer to refresh state without advancing.
      const r = await api.respond(sessionId, ' ');
      return r.session;
    },
    staleTime: Infinity,
  });

  // Pulled separately so the StepDiagram can show the right device shape.
  // Cheap GET; cached and shared with ApplianceDetailScreen.
  const applianceId = session.data?.applianceId;
  const appliance = useQuery({
    queryKey: ['appliance-detail', applianceId],
    queryFn: () => api.applianceDetail(applianceId as string),
    enabled: !!applianceId,
    staleTime: 5 * 60 * 1000,
  });
  const applianceType = appliance.data?.type ?? null;

  const submitWithAnswer = async (raw: string) => {
    const text = raw.trim();
    if (!text) return;
    setBusy(true);
    try {
      const r = await api.respond(sessionId, text);
      qc.setQueryData(['repair-session', sessionId], r.session);
      setAnswer('');
      if (r.session.status !== 'ACTIVE') {
        Alert.alert('Repair complete', r.session.diagnosis);
      }
    } catch (e) {
      Alert.alert('Could not advance', (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const submitAnswer = () => submitWithAnswer(answer);

  if (session.isLoading || !session.data) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={theme.colors.accent} />
      </View>
    );
  }

  const s = session.data;
  const cs = s.currentState;

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
        >
          <Text style={styles.label}>Diagnosis</Text>
          <Text style={styles.diagnosis}>{s.diagnosis}</Text>

          {s.safetyWarnings.length > 0 && (
            <View style={styles.safetyBox}>
              <Text style={styles.safetyTitle}>Safety</Text>
              {s.safetyWarnings.map((w, i) => (
                <Text key={i} style={styles.safetyItem}>• {w}</Text>
              ))}
            </View>
          )}

          <Text style={styles.label}>Step</Text>
          {cs.type === 'instruction' && (
            <View style={styles.card}>
              <Text style={styles.body}>{cs.text}</Text>
              <StepDiagram applianceType={applianceType} stepText={cs.text} />
              <Pressable
                style={[styles.button, busy && styles.buttonDisabled]}
                disabled={busy}
                onPress={() => submitWithAnswer('next')}
              >
                <Text style={styles.buttonText}>{busy ? 'Working…' : 'Done — next step'}</Text>
              </Pressable>
            </View>
          )}

          {cs.type === 'question' && (
            <View style={styles.card}>
              <Text style={styles.body}>{cs.text}</Text>
              <StepDiagram applianceType={applianceType} stepText={cs.text} />
              {cs.branches?.length ? (
                <View style={{ marginTop: theme.spacing.md }}>
                  {cs.branches.map((b) => (
                    <Pressable
                      key={b.match}
                      style={[styles.optionButton, busy && styles.buttonDisabled]}
                      disabled={busy}
                      onPress={() => submitWithAnswer(b.match)}
                    >
                      <Text style={styles.optionText}>{b.match}</Text>
                    </Pressable>
                  ))}
                </View>
              ) : (
                <>
                  <TextInput
                    placeholder="Type your answer"
                    placeholderTextColor={theme.colors.textMuted}
                    value={answer}
                    onChangeText={setAnswer}
                    style={styles.input}
                    multiline
                  />
                  <Pressable
                    style={[styles.button, (!answer.trim() || busy) && styles.buttonDisabled]}
                    disabled={!answer.trim() || busy}
                    onPress={submitAnswer}
                  >
                    <Text style={styles.buttonText}>{busy ? 'Working…' : 'Continue'}</Text>
                  </Pressable>
                </>
              )}
            </View>
          )}

          {cs.type === 'verify_photo' && (
            <View style={styles.card}>
              <Text style={styles.body}>{cs.text ?? 'Take a photo to verify the previous step.'}</Text>
              <StepDiagram
                applianceType={applianceType}
                stepText={cs.text ?? `Photograph ${cs.expected_visual.join(', ')}`}
              />
              <Text style={styles.muted}>
                We need to see: {cs.expected_visual.join(', ')}
              </Text>
              <Pressable
                style={styles.button}
                onPress={() => nav.navigate('Camera', { mode: 'repair-step', sessionId })}
              >
                <Text style={styles.buttonText}>Open camera</Text>
              </Pressable>
            </View>
          )}

          {cs.type === 'complete' && (
            <View style={styles.card}>
              <Text style={[styles.body, { color: theme.colors.success }]}>{cs.text}</Text>
            </View>
          )}

          {cs.type === 'escalate' && (
            <View style={styles.card}>
              <Text style={[styles.body, { color: theme.colors.danger }]}>{cs.text}</Text>
              <Text style={styles.muted}>Reason: {cs.reason}</Text>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.bg },
  content: { padding: theme.spacing.lg, paddingBottom: theme.spacing.xl * 2 },
  label: {
    ...theme.font.caption,
    color: theme.colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: theme.spacing.md,
  },
  diagnosis: { ...theme.font.h2, color: theme.colors.text, marginVertical: theme.spacing.sm },
  safetyBox: {
    backgroundColor: '#3f1d1d',
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    marginVertical: theme.spacing.md,
  },
  safetyTitle: { ...theme.font.h2, color: theme.colors.danger, marginBottom: theme.spacing.xs },
  safetyItem: { ...theme.font.body, color: '#fecaca', marginVertical: 2 },
  card: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.lg,
    marginVertical: theme.spacing.md,
  },
  body: { ...theme.font.body, color: theme.colors.text, lineHeight: 22 },
  muted: { ...theme.font.caption, color: theme.colors.textMuted, marginVertical: theme.spacing.sm },
  input: {
    backgroundColor: theme.colors.bg,
    color: theme.colors.text,
    padding: theme.spacing.md,
    borderRadius: theme.radius.md,
    minHeight: 80,
    marginTop: theme.spacing.md,
    textAlignVertical: 'top',
  },
  button: {
    backgroundColor: theme.colors.accent,
    paddingVertical: 12,
    borderRadius: theme.radius.md,
    alignItems: 'center',
    marginTop: theme.spacing.md,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { ...theme.font.body, fontWeight: '600', color: theme.colors.bg },
  optionButton: {
    backgroundColor: theme.colors.bg,
    paddingVertical: 12,
    paddingHorizontal: theme.spacing.lg,
    borderRadius: theme.radius.md,
    marginVertical: theme.spacing.xs,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  optionText: { ...theme.font.body, color: theme.colors.text },
});

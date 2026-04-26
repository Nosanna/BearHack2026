import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { api } from '../api/client';
import { SwipeableTaskCard } from '../components/TaskCard';
import { theme } from '../theme';
import type { RootStackParamList } from '../navigation/AppShell';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Route = RouteProp<RootStackParamList, 'ApplianceDetail'>;

export function ApplianceDetailScreen() {
  const nav = useNavigation<Nav>();
  const route = useRoute<Route>();
  const id = route.params.applianceId;
  const selectedTaskId = route.params.taskId;
  const fromHomeUpcoming = route.params.source === 'home-upcoming';

  const detail = useQuery({
    queryKey: ['appliance', id],
    queryFn: () => api.applianceDetail(id),
  });

  const [symptom, setSymptom] = useState('');
  const [starting, setStarting] = useState(false);

  const startMaintenance = async (taskTitle: string, taskDescription: string | null) => {
    setStarting(true);
    try {
      const isDryerLint = a.type === 'DRYER' && selectedTask?.category === 'DRYER_LINT_FILTER';
      if (isDryerLint) {
        // #region agent log
        fetch('http://127.0.0.1:7901/ingest/858e3ef0-15fa-4006-be55-bfedf1b0470c',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'239de5'},body:JSON.stringify({sessionId:'239de5',runId:'pre-fix',hypothesisId:'G1',location:'ApplianceDetailScreen.tsx:startMaintenance',message:'Dryer lint task: skipping startRepair; entering YOLO camera',data:{applianceId:id,taskTitle},timestamp:Date.now()})}).catch(()=>{});
        // #endregion agent log
        console.log('[lintflow] enter yolo camera (no startRepair yet)', {
          applianceId: id,
          taskTitle,
          taskCategory: selectedTask?.category,
        });
        nav.navigate('LintGuidedCamera', { applianceId: id, taskTitle, taskDescription });
      } else {
        const symptomText = [
          `Perform maintenance task: ${taskTitle}`,
          taskDescription ? `Details: ${taskDescription}` : null,
          'Make this a safe step-by-step maintenance checklist as a state machine.',
        ]
          .filter(Boolean)
          .join('\n');
        // #region agent log
        fetch('http://127.0.0.1:7901/ingest/858e3ef0-15fa-4006-be55-bfedf1b0470c',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'239de5'},body:JSON.stringify({sessionId:'239de5',runId:'pre-fix',hypothesisId:'G2',location:'ApplianceDetailScreen.tsx:startMaintenance',message:'Non-lint maintenance: starting repair session now',data:{applianceId:id,taskTitle},timestamp:Date.now()})}).catch(()=>{});
        // #endregion agent log
        console.log('[lintflow] non-lint startRepair now', { applianceId: id, taskTitle });
        const session = await api.startRepair({ applianceId: id, symptom: symptomText });
        nav.navigate('Assistant', { sessionId: session.id });
      }
    } catch (e) {
      Alert.alert('Could not start maintenance', (e as Error).message);
    } finally {
      setStarting(false);
    }
  };

  const startRepair = async () => {
    if (!symptom.trim()) {
      Alert.alert('Tell us what\'s wrong first.');
      return;
    }
    setStarting(true);
    try {
      const session = await api.startRepair({ applianceId: id, symptom: symptom.trim() });
      nav.navigate('Assistant', { sessionId: session.id });
      setSymptom('');
    } catch (e) {
      Alert.alert('Could not start repair', (e as Error).message);
    } finally {
      setStarting(false);
    }
  };

  if (detail.isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={theme.colors.accent} />
      </View>
    );
  }
  if (!detail.data) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>Could not load this appliance.</Text>
      </View>
    );
  }

  const a = detail.data;
  const selectedTask =
    selectedTaskId ? a.upcomingTasks.find((t) => t.id === selectedTaskId) : undefined;
  const otherTasks =
    fromHomeUpcoming && selectedTask
      ? a.upcomingTasks.filter((t) => t.id !== selectedTask.id)
      : a.upcomingTasks;

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <ScrollView
        style={styles.root}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={detail.isFetching}
            onRefresh={() => detail.refetch()}
            tintColor={theme.colors.accent}
          />
        }
      >
        {a.primaryImageUrl && (
          <Image source={{ uri: a.primaryImageUrl }} style={styles.hero} />
        )}

      <Text style={styles.title}>
        {a.nickname ?? a.type.replace(/_/g, ' ')}
      </Text>
      <Text style={styles.subtitle}>
        {[a.brand, a.model].filter(Boolean).join(' · ') || a.type.replace(/_/g, ' ')}
      </Text>

      {selectedTask ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Start maintenance</Text>
          <Text style={styles.maintenanceTitle} numberOfLines={2}>
            {selectedTask.title}
          </Text>
          {selectedTask.description ? (
            <Text style={styles.maintenanceBody} numberOfLines={4}>
              {selectedTask.description}
            </Text>
          ) : null}
          <Pressable
            style={[styles.button, starting && styles.buttonDisabled]}
            disabled={starting}
            onPress={() => startMaintenance(selectedTask.title, selectedTask.description)}
          >
            <Text style={styles.buttonText}>
              {starting ? 'Generating steps…' : 'Start guided maintenance'}
            </Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Need a repair?</Text>
          <TextInput
            placeholder="Describe the symptom (e.g. it's leaking water from the door)"
            placeholderTextColor={theme.colors.textMuted}
            value={symptom}
            onChangeText={setSymptom}
            style={styles.input}
            multiline
          />
          <Pressable
            style={[styles.button, (!symptom.trim() || starting) && styles.buttonDisabled]}
            disabled={!symptom.trim() || starting}
            onPress={startRepair}
          >
            <Text style={styles.buttonText}>
              {starting ? 'Generating plan…' : 'Start guided repair'}
            </Text>
          </Pressable>
        </View>
      )}

      {otherTasks.length > 0 ? (
        <>
          <Text style={styles.sectionTitle}>Other maintenance</Text>
          {otherTasks.map((t) => (
            <SwipeableTaskCard key={t.id} task={t} />
          ))}
          <Text style={styles.hint}>
            Swipe right to mark done · swipe left to snooze 7 days
          </Text>
        </>
      ) : null}

      {!fromHomeUpcoming && (
        <>
          <Text style={styles.sectionTitle}>Photos</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {a.images.map((img) => (
              <Image key={img.id} source={{ uri: img.url }} style={styles.thumb} />
            ))}
          </ScrollView>
        </>
      )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.bg },
  content: { padding: theme.spacing.lg, paddingBottom: theme.spacing.xl * 2 },
  hero: {
    width: '100%',
    height: 220,
    borderRadius: theme.radius.lg,
    marginBottom: theme.spacing.lg,
    backgroundColor: theme.colors.border,
  },
  title: { ...theme.font.title, color: theme.colors.text },
  subtitle: { ...theme.font.body, color: theme.colors.textMuted, marginBottom: theme.spacing.lg },
  card: {
    backgroundColor: theme.colors.card,
    padding: theme.spacing.lg,
    borderRadius: theme.radius.lg,
    marginVertical: theme.spacing.lg,
  },
  sectionTitle: { ...theme.font.h2, color: theme.colors.text, marginTop: theme.spacing.lg, marginBottom: theme.spacing.md },
  input: {
    backgroundColor: theme.colors.bg,
    color: theme.colors.text,
    padding: theme.spacing.md,
    borderRadius: theme.radius.md,
    minHeight: 80,
    textAlignVertical: 'top',
    marginBottom: theme.spacing.md,
  },
  button: {
    backgroundColor: theme.colors.accent,
    paddingVertical: 14,
    borderRadius: theme.radius.md,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { ...theme.font.body, fontWeight: '600', color: theme.colors.bg },
  maintenanceTitle: { ...theme.font.body, color: theme.colors.text, marginBottom: 6 },
  maintenanceBody: { ...theme.font.caption, color: theme.colors.textMuted, marginBottom: theme.spacing.md },
  empty: { ...theme.font.caption, color: theme.colors.textMuted },
  hint: {
    ...theme.font.caption,
    color: theme.colors.textMuted,
    marginTop: theme.spacing.sm,
    fontStyle: 'italic',
  },
  error: { ...theme.font.body, color: theme.colors.danger },
  thumb: {
    width: 120,
    height: 120,
    borderRadius: theme.radius.md,
    marginRight: theme.spacing.md,
    backgroundColor: theme.colors.border,
  },
});

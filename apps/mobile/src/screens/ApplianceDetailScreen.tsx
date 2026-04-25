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
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { api } from '../api/client';
import { TaskCard } from '../components/TaskCard';
import { theme } from '../theme';
import type { RootStackParamList } from '../navigation/AppShell';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Route = RouteProp<RootStackParamList, 'ApplianceDetail'>;

export function ApplianceDetailScreen() {
  const nav = useNavigation<Nav>();
  const route = useRoute<Route>();
  const id = route.params.applianceId;

  const detail = useQuery({
    queryKey: ['appliance', id],
    queryFn: () => api.applianceDetail(id),
  });

  const [symptom, setSymptom] = useState('');
  const [starting, setStarting] = useState(false);

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

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
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

      <Text style={styles.sectionTitle}>Upcoming maintenance</Text>
      {a.upcomingTasks.length === 0 ? (
        <Text style={styles.empty}>No tasks scheduled — generate a maintenance plan from the dashboard.</Text>
      ) : (
        a.upcomingTasks.map((t) => <TaskCard key={t.id} task={t} />)
      )}

      <Text style={styles.sectionTitle}>Photos</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        {a.images.map((img) => (
          <Image key={img.id} source={{ uri: img.url }} style={styles.thumb} />
        ))}
      </ScrollView>
    </ScrollView>
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
  empty: { ...theme.font.caption, color: theme.colors.textMuted },
  error: { ...theme.font.body, color: theme.colors.danger },
  thumb: {
    width: 120,
    height: 120,
    borderRadius: theme.radius.md,
    marginRight: theme.spacing.md,
    backgroundColor: theme.colors.border,
  },
});

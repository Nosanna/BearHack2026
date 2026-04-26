import React from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { api } from '../api/client';
import { SwipeableTaskCard } from '../components/TaskCard';
import { theme } from '../theme';
import type { RootStackParamList } from '../navigation/AppShell';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function ScheduleScreen() {
  const nav = useNavigation<Nav>();
  const upcoming = useQuery({
    queryKey: ['schedule-upcoming'],
    queryFn: () => api.upcoming(),
  });

  return (
    <SafeAreaView style={styles.root}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={upcoming.isFetching}
            onRefresh={() => upcoming.refetch()}
            tintColor={theme.colors.accent}
          />
        }
      >
        <Text style={styles.title}>Upcoming maintenance</Text>
        {upcoming.isLoading && <ActivityIndicator color={theme.colors.accent} />}
        {(upcoming.data?.tasks ?? []).map((t) => (
          <SwipeableTaskCard
            key={t.id}
            task={t}
            onPress={() => nav.navigate('ApplianceDetail', { applianceId: t.applianceId })}
          />
        ))}
        {upcoming.data?.tasks?.length === 0 && (
          <Text style={styles.empty}>Nothing on the calendar in the next 30 days.</Text>
        )}
        {(upcoming.data?.tasks?.length ?? 0) > 0 && (
          <Text style={styles.hint}>
            Swipe right to mark done · swipe left to snooze 7 days
          </Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: theme.spacing.lg, paddingBottom: theme.spacing.xl * 2 },
  title: { ...theme.font.title, color: theme.colors.text, marginBottom: theme.spacing.lg },
  empty: { ...theme.font.caption, color: theme.colors.textMuted },
  hint: {
    ...theme.font.caption,
    color: theme.colors.textMuted,
    marginTop: theme.spacing.sm,
    fontStyle: 'italic',
  },
});

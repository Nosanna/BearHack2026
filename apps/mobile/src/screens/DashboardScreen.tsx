import React from 'react';
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Pressable,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { RoomCard } from '../components/RoomCard';
import { SwipeableTaskCard } from '../components/TaskCard';
import { useAuth } from '../auth/AuthProvider';
import { theme } from '../theme';
import type { RootStackParamList } from '../navigation/AppShell';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function DashboardScreen() {
  const nav = useNavigation<Nav>();
  const qc = useQueryClient();
  const { signOut } = useAuth();
  const home = useQuery({
    queryKey: ['dashboard-home'],
    queryFn: () => api.dashboardHome(),
  });

  const resetDemo = useMutation({
    mutationFn: () => api.resetDemo(),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['dashboard-home'] });
      qc.invalidateQueries({ queryKey: ['schedule-upcoming'] });
      qc.invalidateQueries({ queryKey: ['rooms'] });
      Alert.alert(
        'Demo home reset',
        `Loaded ${res.rooms} rooms, ${res.appliances} appliances, ${res.tasks} maintenance tasks.`,
      );
    },
    onError: (e) =>
      Alert.alert('Could not reset demo', (e as Error).message),
  });

  const confirmReset = () => {
    Alert.alert(
      'Reset demo home?',
      'This wipes all rooms, appliances, and tasks for this account, then loads the curated Demo Home.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: () => resetDemo.mutate(),
        },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.root}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={home.isFetching}
            onRefresh={() => home.refetch()}
            tintColor={theme.colors.accent}
          />
        }
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.hello}>
              Hi {home.data?.user.name?.split(' ')[0] ?? 'there'} 👋
            </Text>
            <Text style={styles.subhead}>Here's what your home needs.</Text>
          </View>
          <View style={styles.headerActions}>
            <Pressable
              onPress={confirmReset}
              disabled={resetDemo.isPending}
              hitSlop={8}
            >
              <Text
                style={[
                  styles.headerLink,
                  resetDemo.isPending && styles.headerLinkDisabled,
                ]}
              >
                {resetDemo.isPending ? 'Resetting…' : 'Reset demo'}
              </Text>
            </Pressable>
            <Pressable onPress={signOut} hitSlop={8}>
              <Text style={styles.signOut}>Sign out</Text>
            </Pressable>
          </View>
        </View>

        {home.isLoading && <ActivityIndicator color={theme.colors.accent} />}
        {home.error && (
          <Text style={styles.error}>Failed to load — pull to refresh.</Text>
        )}

        <Section title="Rooms">
          {(home.data?.rooms ?? []).map((r) => (
            <RoomCard
              key={r.id}
              room={r}
              onPress={() => nav.navigate('RoomDetail', { roomId: r.id })}
            />
          ))}
          {home.data?.rooms?.length === 0 && (
            <Text style={styles.empty}>No rooms yet. Tap “Add” below to register your first appliance.</Text>
          )}
        </Section>

        <Section title="Upcoming maintenance">
          {(home.data?.upcomingTasks ?? []).map((t) => (
            <SwipeableTaskCard
              key={t.id}
              task={t}
              onPress={() => nav.navigate('ApplianceDetail', { applianceId: t.applianceId })}
            />
          ))}
          {home.data?.upcomingTasks?.length === 0 && (
            <Text style={styles.empty}>You're all caught up.</Text>
          )}
          {(home.data?.upcomingTasks?.length ?? 0) > 0 && (
            <Text style={styles.hint}>Swipe right to mark done · swipe left to snooze 7 days</Text>
          )}
        </Section>
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ marginTop: theme.spacing.xl }}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: theme.spacing.lg, paddingBottom: theme.spacing.xl * 2 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
  },
  hello: { ...theme.font.title, color: theme.colors.text },
  subhead: { ...theme.font.caption, color: theme.colors.textMuted, marginTop: 2 },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  headerLink: { ...theme.font.caption, color: theme.colors.warning },
  headerLinkDisabled: { color: theme.colors.textMuted },
  signOut: { ...theme.font.caption, color: theme.colors.accent },
  sectionTitle: {
    ...theme.font.h2,
    color: theme.colors.text,
    marginBottom: theme.spacing.md,
  },
  empty: { ...theme.font.caption, color: theme.colors.textMuted },
  hint: {
    ...theme.font.caption,
    color: theme.colors.textMuted,
    marginTop: theme.spacing.sm,
    fontStyle: 'italic',
  },
  error: { color: theme.colors.danger, marginTop: theme.spacing.md },
});

import React from 'react';
import {
  ActivityIndicator,
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
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import { RoomCard } from '../components/RoomCard';
import { TaskCard } from '../components/TaskCard';
import { useAuth } from '../auth/AuthProvider';
import { theme } from '../theme';
import type { RootStackParamList } from '../navigation/AppShell';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function DashboardScreen() {
  const nav = useNavigation<Nav>();
  const { signOut } = useAuth();
  const home = useQuery({
    queryKey: ['dashboard-home'],
    queryFn: () => api.dashboardHome(),
  });

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
          <Pressable onPress={signOut}>
            <Text style={styles.signOut}>Sign out</Text>
          </Pressable>
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
            <TaskCard
              key={t.id}
              task={t}
              onPress={() => nav.navigate('ApplianceDetail', { applianceId: t.applianceId })}
            />
          ))}
          {home.data?.upcomingTasks?.length === 0 && (
            <Text style={styles.empty}>You're all caught up.</Text>
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
  signOut: { ...theme.font.caption, color: theme.colors.accent },
  sectionTitle: {
    ...theme.font.h2,
    color: theme.colors.text,
    marginBottom: theme.spacing.md,
  },
  empty: { ...theme.font.caption, color: theme.colors.textMuted },
  error: { color: theme.colors.danger, marginTop: theme.spacing.md },
});

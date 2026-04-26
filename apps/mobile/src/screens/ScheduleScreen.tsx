import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import type { MaintenanceTaskDto } from '@fixit/shared';
import { api } from '../api/client';
import { SwipeableTaskCard } from '../components/TaskCard';
import { theme } from '../theme';
import type { RootStackParamList } from '../navigation/AppShell';

type Nav = NativeStackNavigationProp<RootStackParamList>;

type Bucket = 'overdue' | 'today' | 'week' | 'later';
type Filter = 'all' | 'overdue' | 'week';

export function ScheduleScreen() {
  const nav = useNavigation<Nav>();
  const qc = useQueryClient();
  const upcoming = useQuery({
    queryKey: ['schedule-upcoming'],
    queryFn: () => api.upcoming(),
  });

  useFocusEffect(
    useCallback(() => {
      qc.invalidateQueries({ queryKey: ['schedule-upcoming'] });
    }, [qc]),
  );

  const [filter, setFilter] = useState<Filter>('all');

  const tasks = upcoming.data?.tasks ?? [];

  const grouped = useMemo(() => groupTasks(tasks), [tasks]);
  const counts = useMemo(
    () => ({
      overdue: grouped.overdue.length,
      today: grouped.today.length,
      week: grouped.week.length,
      later: grouped.later.length,
    }),
    [grouped],
  );

  const visibleSections: Array<{ key: Bucket; title: string; tone: 'danger' | 'accent' | 'muted' }> =
    useMemo(() => {
      if (filter === 'overdue') {
        return [{ key: 'overdue', title: 'Overdue', tone: 'danger' }];
      }
      if (filter === 'week') {
        return [
          { key: 'overdue', title: 'Overdue', tone: 'danger' },
          { key: 'today', title: 'Today', tone: 'accent' },
          { key: 'week', title: 'This week', tone: 'accent' },
        ];
      }
      return [
        { key: 'overdue', title: 'Overdue', tone: 'danger' },
        { key: 'today', title: 'Today', tone: 'accent' },
        { key: 'week', title: 'This week', tone: 'accent' },
        { key: 'later', title: 'Later', tone: 'muted' },
      ];
    }, [filter]);

  const visibleTotal = visibleSections.reduce((acc, s) => acc + grouped[s.key].length, 0);

  return (
    <SafeAreaView style={styles.root}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={upcoming.isFetching && !upcoming.isLoading}
            onRefresh={() => void upcoming.refetch()}
            tintColor={theme.colors.accent}
          />
        }
      >
        {/* Header */}
        <Text style={styles.title}>Maintenance plan</Text>
        <Text style={styles.subtitle}>
          What needs attention so things keep humming.
        </Text>

        {/* Summary card */}
        <View style={styles.summaryCard}>
          <SummaryStat
            value={counts.overdue}
            label={counts.overdue === 1 ? 'overdue' : 'overdue'}
            tone={counts.overdue > 0 ? 'danger' : 'default'}
          />
          <View style={styles.summaryDivider} />
          <SummaryStat
            value={counts.today + counts.week}
            label="this week"
            tone={counts.today + counts.week > 0 ? 'accent' : 'default'}
          />
          <View style={styles.summaryDivider} />
          <SummaryStat value={counts.later} label="later" tone="default" />
        </View>

        {/* Filter chips */}
        <View style={styles.filterRow}>
          <FilterChip active={filter === 'all'} onPress={() => setFilter('all')}>
            All ({tasks.length})
          </FilterChip>
          <FilterChip
            active={filter === 'overdue'}
            tone="danger"
            onPress={() => setFilter('overdue')}
          >
            Overdue ({counts.overdue})
          </FilterChip>
          <FilterChip active={filter === 'week'} onPress={() => setFilter('week')}>
            This week ({counts.overdue + counts.today + counts.week})
          </FilterChip>
        </View>

        {/* Body */}
        {upcoming.isLoading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={theme.colors.accent} />
          </View>
        ) : tasks.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="checkmark-done" size={28} color={theme.colors.success} />
            <Text style={styles.emptyTitle}>You&apos;re all caught up.</Text>
            <Text style={styles.emptyBody}>
              Nothing on the calendar in the next 30 days. Add equipment to get
              tailored maintenance suggestions.
            </Text>
          </View>
        ) : visibleTotal === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="filter" size={24} color={theme.colors.textMuted} />
            <Text style={styles.emptyTitle}>Nothing in this view.</Text>
            <Text style={styles.emptyBody}>
              Try a different filter — you have other tasks scheduled.
            </Text>
          </View>
        ) : (
          visibleSections.map((section) => {
            const items = grouped[section.key];
            if (items.length === 0) return null;
            return (
              <View key={section.key} style={styles.section}>
                <View style={styles.sectionHeader}>
                  <View style={[styles.sectionDot, toneStyles[section.tone].dot]} />
                  <Text style={[styles.sectionTitle, toneStyles[section.tone].title]}>
                    {section.title}
                  </Text>
                  <View style={[styles.sectionCount, toneStyles[section.tone].count]}>
                    <Text style={[styles.sectionCountText, toneStyles[section.tone].countText]}>
                      {items.length}
                    </Text>
                  </View>
                </View>
                {items.map((t) => (
                  <SwipeableTaskCard
                    key={t.id}
                    task={t}
                    onPress={() =>
                      nav.navigate('ApplianceDetail', {
                        applianceId: t.applianceId,
                        taskId: t.id,
                      })
                    }
                  />
                ))}
              </View>
            );
          })
        )}

        {tasks.length > 0 && (
          <Text style={styles.hint}>
            <Ionicons name="swap-horizontal" size={12} color={theme.colors.textMuted} />
            {'  '}Swipe right to mark done · swipe left to snooze 7 days
          </Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function SummaryStat(props: {
  value: number;
  label: string;
  tone: 'default' | 'accent' | 'danger';
}) {
  const color =
    props.tone === 'danger'
      ? theme.colors.danger
      : props.tone === 'accent'
        ? theme.colors.accent
        : theme.colors.text;
  return (
    <View style={styles.summaryStat}>
      <Text style={[styles.summaryValue, { color }]}>{props.value}</Text>
      <Text style={styles.summaryLabel}>{props.label}</Text>
    </View>
  );
}

function FilterChip(props: {
  active: boolean;
  tone?: 'default' | 'danger';
  onPress: () => void;
  children: React.ReactNode;
}) {
  const danger = props.tone === 'danger';
  return (
    <Pressable
      onPress={props.onPress}
      style={[
        styles.filterChip,
        props.active && styles.filterChipActive,
        props.active && danger && styles.filterChipActiveDanger,
      ]}
    >
      <Text
        style={[
          styles.filterChipText,
          props.active && styles.filterChipTextActive,
          props.active && danger && styles.filterChipTextActiveDanger,
        ]}
      >
        {props.children}
      </Text>
    </Pressable>
  );
}

function groupTasks(tasks: MaintenanceTaskDto[]): Record<Bucket, MaintenanceTaskDto[]> {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfTomorrow = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000);
  const startOfWeekEnd = new Date(startOfToday.getTime() + 7 * 24 * 60 * 60 * 1000);

  const result: Record<Bucket, MaintenanceTaskDto[]> = {
    overdue: [],
    today: [],
    week: [],
    later: [],
  };

  for (const t of tasks) {
    const due = new Date(t.dueDate);
    if (t.status === 'OVERDUE' || due < startOfToday) {
      result.overdue.push(t);
    } else if (due < startOfTomorrow) {
      result.today.push(t);
    } else if (due < startOfWeekEnd) {
      result.week.push(t);
    } else {
      result.later.push(t);
    }
  }

  // Within each bucket, sort by due date ascending.
  for (const k of Object.keys(result) as Bucket[]) {
    result[k].sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
  }

  return result;
}

const toneStyles: Record<
  'danger' | 'accent' | 'muted',
  {
    dot: { backgroundColor: string };
    title: { color: string };
    count: { backgroundColor: string };
    countText: { color: string };
  }
> = {
  danger: {
    dot: { backgroundColor: theme.colors.danger },
    title: { color: theme.colors.text },
    count: { backgroundColor: 'rgba(239, 68, 68, 0.18)' },
    countText: { color: theme.colors.danger },
  },
  accent: {
    dot: { backgroundColor: theme.colors.accent },
    title: { color: theme.colors.text },
    count: { backgroundColor: 'rgba(249, 115, 22, 0.16)' },
    countText: { color: theme.colors.accent },
  },
  muted: {
    dot: { backgroundColor: theme.colors.border },
    title: { color: theme.colors.textMuted },
    count: { backgroundColor: theme.colors.bgElevated },
    countText: { color: theme.colors.textMuted },
  },
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.bg },
  content: {
    padding: theme.spacing.lg,
    paddingBottom: theme.spacing.xl * 2,
  },

  title: {
    fontSize: 26,
    fontWeight: '800',
    color: theme.colors.text,
    letterSpacing: -0.5,
  },
  subtitle: {
    ...theme.font.body,
    color: theme.colors.textMuted,
    marginTop: 4,
    marginBottom: theme.spacing.lg,
  },

  // Summary card
  summaryCard: {
    flexDirection: 'row',
    backgroundColor: theme.colors.bgElevated,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingVertical: theme.spacing.md,
    marginBottom: theme.spacing.lg,
  },
  summaryStat: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  summaryValue: {
    fontSize: 22,
    fontWeight: '800',
  },
  summaryLabel: {
    ...theme.font.caption,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    color: theme.colors.textMuted,
  },
  summaryDivider: {
    width: 1,
    backgroundColor: theme.colors.border,
    marginVertical: theme.spacing.sm,
  },

  // Filter chips
  filterRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.lg,
  },
  filterChip: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: theme.colors.bgElevated,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  filterChipActive: {
    backgroundColor: theme.colors.accent,
    borderColor: theme.colors.accent,
  },
  filterChipActiveDanger: {
    backgroundColor: theme.colors.danger,
    borderColor: theme.colors.danger,
  },
  filterChipText: {
    ...theme.font.caption,
    color: theme.colors.textMuted,
    fontWeight: '600',
  },
  filterChipTextActive: { color: theme.colors.bg },
  filterChipTextActiveDanger: { color: theme.colors.text },

  // Sections
  section: { marginBottom: theme.spacing.lg },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
  },
  sectionDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  sectionTitle: {
    ...theme.font.h2,
    fontSize: 15,
    fontWeight: '700',
  },
  sectionCount: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
  },
  sectionCountText: {
    fontSize: 12,
    fontWeight: '700',
  },

  // States
  loadingWrap: { paddingVertical: theme.spacing.xl, alignItems: 'center' },
  emptyCard: {
    alignItems: 'center',
    paddingVertical: theme.spacing.xl,
    paddingHorizontal: theme.spacing.lg,
    backgroundColor: theme.colors.bgElevated,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    gap: theme.spacing.sm,
  },
  emptyTitle: {
    ...theme.font.h2,
    color: theme.colors.text,
    marginTop: theme.spacing.sm,
  },
  emptyBody: {
    ...theme.font.caption,
    color: theme.colors.textMuted,
    textAlign: 'center',
    lineHeight: 18,
  },

  hint: {
    ...theme.font.caption,
    color: theme.colors.textMuted,
    marginTop: theme.spacing.md,
    textAlign: 'center',
  },
});

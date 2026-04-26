import React, { useRef } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import type { MaintenanceTaskDto } from '@fixit/shared';
import {
  Swipeable,
  RectButton,
} from 'react-native-gesture-handler';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { theme } from '../theme';

const STATUS_COLORS: Record<string, string> = {
  PENDING: theme.colors.accent,
  IN_PROGRESS: theme.colors.accent,
  OVERDUE: theme.colors.danger,
  COMPLETED: theme.colors.success,
  SKIPPED: theme.colors.textMuted,
};

/**
 * Static (non-swipeable) presentation. Used in places where actions don't
 * make sense (e.g. completed-task history) or as the inner cell of the
 * swipeable variant below.
 */
export function TaskCard({
  task,
  onPress,
}: {
  task: MaintenanceTaskDto;
  onPress?: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={styles.card}>
      <View
        style={[
          styles.statusDot,
          {
            backgroundColor:
              STATUS_COLORS[task.status] ?? theme.colors.accent,
          },
        ]}
      />
      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={1}>
          {task.title}
        </Text>
        <Text style={styles.subtitle} numberOfLines={1}>
          {task.applianceNickname ?? task.applianceType.replace(/_/g, ' ')} ·
          due {formatDate(task.dueDate)}
        </Text>
        {task.whyItMatters ? (
          <Text style={styles.why} numberOfLines={2}>
            {task.whyItMatters}
          </Text>
        ) : null}
      </View>
      <Text style={styles.status}>{task.status.replace('_', ' ')}</Text>
    </Pressable>
  );
}

/**
 * Swipeable wrapper:
 *   • swipe right → complete (and auto-schedule next instance for recurring tasks)
 *   • swipe left  → snooze 7 days (default)
 *
 * Owns its own mutations + cache invalidation so any screen that drops one
 * of these in stays in sync without per-screen wiring.
 */
export function SwipeableTaskCard({
  task,
  onPress,
}: {
  task: MaintenanceTaskDto;
  onPress?: () => void;
}) {
  const qc = useQueryClient();
  const swipeRef = useRef<Swipeable | null>(null);

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ['dashboard-home'] });
    qc.invalidateQueries({ queryKey: ['schedule-upcoming'] });
    qc.invalidateQueries({ queryKey: ['appliance', task.applianceId] });
  };

  const completeMut = useMutation({
    mutationFn: () => api.completeTask(task.id),
    onSuccess: (res) => {
      invalidateAll();
      if (res.nextTask) {
        const days = task.cadenceDays ?? 0;
        Alert.alert(
          'Nice — done.',
          `We scheduled the next "${task.title}" in ${days} days.`,
        );
      }
    },
    onError: (e) => {
      swipeRef.current?.close();
      Alert.alert('Could not complete task', (e as Error).message);
    },
  });

  const snoozeMut = useMutation({
    mutationFn: (days: number) => api.snoozeTask(task.id, days),
    onSuccess: () => invalidateAll(),
    onError: (e) => {
      swipeRef.current?.close();
      Alert.alert('Could not snooze task', (e as Error).message);
    },
  });

  // Already completed → don't allow further actions (still tappable for detail).
  if (task.status === 'COMPLETED') {
    return <TaskCard task={task} onPress={onPress} />;
  }

  return (
    <Swipeable
      ref={swipeRef}
      friction={2}
      leftThreshold={70}
      rightThreshold={70}
      overshootLeft={false}
      overshootRight={false}
      renderLeftActions={() => (
        <ActionPane
          color={theme.colors.success}
          label="Done"
          align="left"
          disabled={completeMut.isPending}
        />
      )}
      renderRightActions={() => (
        <ActionPane
          color={theme.colors.warning}
          label="Snooze 7d"
          align="right"
          disabled={snoozeMut.isPending}
        />
      )}
      onSwipeableOpen={(direction) => {
        if (direction === 'left') {
          completeMut.mutate();
        } else if (direction === 'right') {
          snoozeMut.mutate(7);
        }
        swipeRef.current?.close();
      }}
    >
      <TaskCard task={task} onPress={onPress} />
    </Swipeable>
  );
}

function ActionPane({
  color,
  label,
  align,
  disabled,
}: {
  color: string;
  label: string;
  align: 'left' | 'right';
  disabled: boolean;
}) {
  return (
    <RectButton
      enabled={!disabled}
      style={[
        styles.actionPane,
        {
          backgroundColor: color,
          marginRight: align === 'left' ? theme.spacing.sm : 0,
          marginLeft: align === 'right' ? theme.spacing.sm : 0,
          alignItems: align === 'left' ? 'flex-start' : 'flex-end',
        },
      ]}
    >
      <Text style={styles.actionLabel}>{label}</Text>
    </RectButton>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const dayMs = 24 * 60 * 60 * 1000;
  const diff = Math.round((d.getTime() - now.getTime()) / dayMs);
  if (diff < 0) return `${-diff}d ago`;
  if (diff === 0) return 'today';
  if (diff < 7) return `in ${diff}d`;
  return d.toLocaleDateString();
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.md,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    marginBottom: theme.spacing.sm,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: theme.spacing.md,
  },
  body: { flex: 1 },
  title: { ...theme.font.body, color: theme.colors.text },
  subtitle: {
    ...theme.font.caption,
    color: theme.colors.textMuted,
    marginTop: 2,
  },
  why: {
    ...theme.font.caption,
    color: theme.colors.textMuted,
    marginTop: 4,
    fontStyle: 'italic',
  },
  status: {
    ...theme.font.caption,
    color: theme.colors.textMuted,
    marginLeft: theme.spacing.md,
  },
  actionPane: {
    width: 110,
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.lg,
    borderRadius: theme.radius.md,
    marginBottom: theme.spacing.sm,
  },
  actionLabel: {
    ...theme.font.body,
    fontWeight: '700',
    color: theme.colors.bg,
  },
});

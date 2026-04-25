import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { MaintenanceTaskDto } from '@fixit/shared';
import { theme } from '../theme';

const STATUS_COLORS: Record<string, string> = {
  PENDING: theme.colors.accent,
  IN_PROGRESS: theme.colors.accent,
  OVERDUE: theme.colors.danger,
  COMPLETED: theme.colors.success,
  SKIPPED: theme.colors.textMuted,
};

export function TaskCard({
  task,
  onPress,
}: {
  task: MaintenanceTaskDto;
  onPress?: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={styles.card}>
      <View style={[styles.statusDot, { backgroundColor: STATUS_COLORS[task.status] ?? theme.colors.accent }]} />
      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={1}>{task.title}</Text>
        <Text style={styles.subtitle} numberOfLines={1}>
          {task.applianceNickname ?? task.applianceType.replace(/_/g, ' ')} · due {formatDate(task.dueDate)}
        </Text>
      </View>
      <Text style={styles.status}>{task.status.replace('_', ' ')}</Text>
    </Pressable>
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
  statusDot: { width: 10, height: 10, borderRadius: 5, marginRight: theme.spacing.md },
  body: { flex: 1 },
  title: { ...theme.font.body, color: theme.colors.text },
  subtitle: { ...theme.font.caption, color: theme.colors.textMuted, marginTop: 2 },
  status: { ...theme.font.caption, color: theme.colors.textMuted, marginLeft: theme.spacing.md },
});

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { RoomDto } from '@fixit/shared';
import { theme } from '../theme';

export function RoomCard({ room, onPress }: { room: RoomDto; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.card}>
      <Text style={styles.title}>{room.name}</Text>
      <Text style={styles.subtitle}>
        {room.applianceCount} appliance{room.applianceCount === 1 ? '' : 's'}
      </Text>
      <View style={styles.dot} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.lg,
    marginBottom: theme.spacing.md,
  },
  title: { ...theme.font.h2, color: theme.colors.text },
  subtitle: { ...theme.font.caption, color: theme.colors.textMuted, marginTop: theme.spacing.xs },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.colors.accent,
    marginTop: theme.spacing.md,
  },
});

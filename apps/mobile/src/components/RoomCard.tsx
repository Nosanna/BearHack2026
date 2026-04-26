import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import type { RoomDto } from '@fixit/shared';
import { theme } from '../theme';

export function RoomCard({ room, onPress }: { room: RoomDto; onPress?: () => void }) {
  return (
    <View style={styles.wrap}>
      <Pressable onPress={onPress} style={styles.card}>
        <View style={styles.headerRow}>
          <Text style={styles.title} numberOfLines={1}>
            {room.name}
          </Text>
        </View>

        {room.previewImageUrl ? (
          <Image source={{ uri: room.previewImageUrl }} style={styles.preview} />
        ) : (
          <View style={[styles.preview, styles.previewFallback]} />
        )}
      </Pressable>

      {(room.openMaintenanceCount ?? 0) > 0 && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{room.openMaintenanceCount}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'relative' },
  card: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.lg,
    overflow: 'hidden',
  },
  headerRow: {
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.md,
    paddingBottom: theme.spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
  },
  title: { ...theme.font.h2, color: theme.colors.text, flex: 1, paddingRight: theme.spacing.sm },
  preview: { width: '100%', height: 110, backgroundColor: theme.colors.border },
  previewFallback: { opacity: 0.6 },
  badge: {
    position: 'absolute',
    top: -8,
    right: -8,
    minWidth: 22,
    height: 22,
    paddingHorizontal: 6,
    borderRadius: 11,
    backgroundColor: theme.colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { ...theme.font.caption, color: theme.colors.text, fontWeight: '800' },
});

import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import type { ApplianceDto } from '@fixit/shared';
import { theme } from '../theme';

export function ApplianceCard({
  appliance,
  onPress,
}: {
  appliance: ApplianceDto;
  onPress?: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={styles.card}>
      {appliance.primaryImageUrl ? (
        <Image source={{ uri: appliance.primaryImageUrl }} style={styles.image} />
      ) : (
        <View style={[styles.image, styles.placeholder]}>
          <Text style={styles.placeholderText}>No photo</Text>
        </View>
      )}
      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={1}>
          {appliance.nickname ?? humanType(appliance.type)}
        </Text>
        <Text style={styles.subtitle} numberOfLines={1}>
          {[appliance.brand, appliance.model].filter(Boolean).join(' · ') || humanType(appliance.type)}
        </Text>
      </View>
    </Pressable>
  );
}

function humanType(t: string) {
  return t
    .toLowerCase()
    .split('_')
    .map((p) => p[0]?.toUpperCase() + p.slice(1))
    .join(' ');
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.lg,
    overflow: 'hidden',
    marginBottom: theme.spacing.md,
  },
  image: { width: '100%', height: 140, backgroundColor: theme.colors.border },
  placeholder: { alignItems: 'center', justifyContent: 'center' },
  placeholderText: { color: theme.colors.textMuted, ...theme.font.caption },
  body: { padding: theme.spacing.lg },
  title: { ...theme.font.h2, color: theme.colors.text },
  subtitle: { ...theme.font.caption, color: theme.colors.textMuted, marginTop: theme.spacing.xs },
});

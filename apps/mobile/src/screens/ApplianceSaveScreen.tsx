import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, SafeAreaView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { RouteProp } from '@react-navigation/native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { api } from '../api/client';
import { theme } from '../theme';
import type { RootStackParamList } from '../navigation/AppShell';
import type { ApplianceType } from '@fixit/shared';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Route = RouteProp<RootStackParamList, 'ApplianceSave'>;

export function ApplianceSaveScreen() {
  const nav = useNavigation<Nav>();
  const route = useRoute<Route>();
  const { roomId, imageUrl, typeOptions, suggested } = route.params;

  const options = useMemo(
    () =>
      (typeOptions ?? [])
        .map((o) => ({ type: o.type as ApplianceType, confidence: o.confidence }))
        .slice(0, 3),
    [typeOptions],
  );

  const [type, setType] = useState<ApplianceType>((suggested.type as ApplianceType) ?? (options[0]?.type ?? 'OTHER'));
  const [brand, setBrand] = useState(suggested.brand ?? '');
  const [model, setModel] = useState(suggested.model ?? '');
  const [nickname, setNickname] = useState('');
  const [saving, setSaving] = useState(false);

  const onSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const res = await api.createAppliance({
        roomId,
        imageUrl,
        type,
        brand: brand.trim() ? brand.trim() : null,
        model: model.trim() ? model.trim() : null,
        nickname: nickname.trim() ? nickname.trim() : undefined,
      });
      nav.replace('ApplianceDetail', { applianceId: res.appliance.id });
    } catch (e) {
      Alert.alert('Save failed', (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.content}>
        <Text style={styles.title}>Confirm appliance</Text>

        <Text style={styles.label}>Appliance type</Text>
        <View style={styles.typeRow}>
          {options.map((o) => (
            <Pressable
              key={o.type}
              onPress={() => setType(o.type)}
              style={[
                styles.typePill,
                type === o.type && { borderColor: theme.colors.accent, backgroundColor: theme.colors.bgElevated },
              ]}
            >
              <Text style={[styles.typeText, type === o.type && { color: theme.colors.accent }]}>
                {o.type.replaceAll('_', ' ')}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.label}>Brand</Text>
        <TextInput
          value={brand}
          onChangeText={setBrand}
          placeholder="e.g. Whirlpool"
          placeholderTextColor={theme.colors.textMuted}
          style={styles.input}
          autoCapitalize="words"
        />

        <Text style={styles.label}>Model ID</Text>
        <TextInput
          value={model}
          onChangeText={setModel}
          placeholder="e.g. WRS321SDHZ"
          placeholderTextColor={theme.colors.textMuted}
          style={styles.input}
          autoCapitalize="characters"
        />

        <Text style={styles.label}>Nickname (optional)</Text>
        <TextInput
          value={nickname}
          onChangeText={setNickname}
          placeholder="e.g. Garage fridge"
          placeholderTextColor={theme.colors.textMuted}
          style={styles.input}
          autoCapitalize="words"
        />

        <Pressable style={[styles.saveBtn, saving && { opacity: 0.7 }]} onPress={onSave} disabled={saving}>
          {saving ? (
            <ActivityIndicator color={theme.colors.bg} />
          ) : (
            <Text style={styles.saveText}>Save</Text>
          )}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: theme.spacing.lg },
  title: { ...theme.font.title, color: theme.colors.text, marginBottom: theme.spacing.lg },
  label: { ...theme.font.caption, color: theme.colors.textMuted, marginTop: theme.spacing.md, marginBottom: 6 },
  input: {
    backgroundColor: theme.colors.card,
    color: theme.colors.text,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  typeRow: { flexDirection: 'row', gap: theme.spacing.sm, flexWrap: 'wrap' },
  typePill: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.card,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
  },
  typeText: { ...theme.font.caption, color: theme.colors.text },
  saveBtn: {
    marginTop: theme.spacing.xl,
    backgroundColor: theme.colors.accent,
    paddingVertical: 14,
    borderRadius: theme.radius.md,
    alignItems: 'center',
  },
  saveText: { ...theme.font.body, fontWeight: '700', color: theme.colors.bg },
});


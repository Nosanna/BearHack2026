import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { RouteProp } from '@react-navigation/native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../api/client';
import { theme } from '../theme';
import type { RootStackParamList } from '../navigation/AppShell';
import {
  BROAD_CATEGORY_LABELS,
  BroadCategory,
  type ApplianceType,
  type MaintenanceTaskDto,
  type SuggestedMaintenanceTask,
} from '@fixit/shared';
import { TaskCard } from '../components/TaskCard';

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

  /**
   * The AI's "best guess" appliance type — prefers a real category over
   * `OTHER`. Falls back to `OTHER` only if every option is `OTHER`.
   */
  const bestGuess = useMemo<ApplianceType>(() => {
    const fromSuggested = suggested.type as ApplianceType | undefined;
    if (fromSuggested && fromSuggested !== 'OTHER') return fromSuggested;
    const firstNonOther = options.find((o) => o.type !== 'OTHER');
    if (firstNonOther) return firstNonOther.type;
    return fromSuggested ?? options[0]?.type ?? 'OTHER';
  }, [suggested.type, options]);

  const initialNickname =
    suggested.type === 'OTHER' && suggested.categoryGuess
      ? suggested.categoryGuess.trim()
      : '';

  const [type, setType] = useState<ApplianceType>(bestGuess);
  const [brand, setBrand] = useState(suggested.brand ?? '');
  const [model, setModel] = useState(suggested.model ?? '');
  const [nickname, setNickname] = useState(initialNickname);
  const [saving, setSaving] = useState(false);
  const [suggestedTasks, setSuggestedTasks] = useState<SuggestedMaintenanceTask[] | null>(null);
  const [tasksLoading, setTasksLoading] = useState(false);

  const confidencePct = Math.round((suggested?.confidence ?? 0) * 100);
  const aiLowConfidence =
    (suggested?.confidence ?? 0) < 0.45 || (!suggested?.brand && !suggested?.model);

  const broadCategoryLabel = useMemo(() => {
    const raw = suggested.broadCategory;
    if (!raw) return null;
    if (raw in BroadCategory) {
      return BROAD_CATEGORY_LABELS[raw as BroadCategory];
    }
    return null;
  }, [suggested.broadCategory]);

  const categoryGuess = (suggested.categoryGuess ?? '').trim() || null;

  useEffect(() => {
    const b = brand.trim();
    const m = model.trim();
    if (!b) {
      setSuggestedTasks(null);
      return;
    }
    setTasksLoading(true);
    const t = setTimeout(() => {
      api
        .getSuggestedMaintenanceTasks({
          applianceType: type,
          brand: b,
          modelId: m ? m : undefined,
          imageUrl: m ? undefined : imageUrl,
        })
        .then((res) => {
          setSuggestedTasks(res.tasks);
        })
        .catch(() => {
          setSuggestedTasks(null);
        })
        .finally(() => setTasksLoading(false));
    }, 3000);
    return () => {
      clearTimeout(t);
      setTasksLoading(false);
    };
  }, [type, brand, model]);

  const previewTasks: MaintenanceTaskDto[] = useMemo(() => {
    const base = {
      applianceId: 'preview',
      applianceNickname: nickname.trim() ? nickname.trim() : null,
      applianceType: type,
      status: 'PENDING' as const,
    };
    return (suggestedTasks ?? []).map((t, idx) => ({
      id: `suggested-${idx}-${t.cadenceDays}`,
      ...base,
      title: t.title,
      description: t.description,
      category: null,
      focusPart: null,
      dueDate: new Date(Date.now() + t.cadenceDays * 24 * 60 * 60 * 1000).toISOString(),
      estimatedMinutes: t.estimatedMinutes,
      cadenceDays: t.cadenceDays,
      whyItMatters: t.whyItMatters,
      safetyWarnings: t.safetyWarnings,
      source: 'ai',
      createdAt: new Date().toISOString(),
    }));
  }, [suggestedTasks, nickname, type]);

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
        suggestedTasks: suggestedTasks ?? undefined,
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
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>Confirm equipment</Text>
        {aiLowConfidence && (
          <View style={styles.aiBanner}>
            <View style={styles.aiBannerHeader}>
              <View style={styles.aiBannerIcon}>
                <Ionicons name="sparkles" size={16} color={theme.colors.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.aiBannerEyebrow}>AI suggestion</Text>
                <Text style={styles.aiBannerTitle}>
                  {categoryGuess
                    ? `Looks like a ${categoryGuess.toLowerCase()}.`
                    : "I'm not totally sure what this is."}
                </Text>
              </View>
              <View style={styles.aiBannerConf}>
                <Text style={styles.aiBannerConfValue}>{confidencePct}%</Text>
                <Text style={styles.aiBannerConfLabel}>sure</Text>
              </View>
            </View>

            {(broadCategoryLabel || bestGuess === 'OTHER') && (
              <View style={styles.tagRow}>
                {broadCategoryLabel && (
                  <View style={styles.broadTag}>
                    <Ionicons name="pricetag" size={11} color={theme.colors.accent} />
                    <Text style={styles.broadTagText}>{broadCategoryLabel}</Text>
                  </View>
                )}
                {bestGuess === 'OTHER' && (
                  <View style={styles.broadTagMuted}>
                    <Text style={styles.broadTagMutedText}>
                      No exact match in our list
                    </Text>
                  </View>
                )}
              </View>
            )}

            <Text style={styles.aiBannerBody}>
              {bestGuess === 'OTHER'
                ? "I couldn't pin it to a specific category, but the hints above should give you a head start. Adjust the fields below — brand and model are the most useful."
                : 'Pick the closest type below or adjust any field. Brand and model are the most useful.'}
            </Text>
          </View>
        )}

        <View style={styles.labelRow}>
          <Text style={styles.label}>Equipment type</Text>
          {options.length > 1 && (
            <Text style={styles.labelHint}>% = how sure I am of each guess</Text>
          )}
        </View>
        <View style={styles.typeRow}>
          {options.map((o) => {
            const active = type === o.type;
            const pct = Math.round(o.confidence * 100);
            return (
              <Pressable
                key={o.type}
                onPress={() => setType(o.type)}
                style={[styles.typePill, active && styles.typePillActive]}
              >
                <Text style={[styles.typeText, active && { color: theme.colors.accent }]}>
                  {o.type.replaceAll('_', ' ')}
                </Text>
                <View
                  style={[
                    styles.typeConfBadge,
                    active && styles.typeConfBadgeActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.typeConfText,
                      active && { color: theme.colors.accent },
                    ]}
                  >
                    {pct}%
                  </Text>
                </View>
              </Pressable>
            );
          })}
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

        <Text style={styles.label}>User manuals</Text>
        {tasksLoading ? (
          <View style={styles.manualsLoading}>
            <ActivityIndicator color={theme.colors.accent} />
            <Text style={styles.manualsLoadingText}>Finding maintenance tasks…</Text>
          </View>
        ) : previewTasks.length ? (
          <View style={{ gap: theme.spacing.sm }}>
            {previewTasks.map((t) => (
              <TaskCard key={t.id} task={t} />
            ))}
          </View>
        ) : (
          <Text style={styles.manualsEmpty}>
            Enter a brand (and optionally a model). If you don&apos;t provide a model, we&apos;ll search using your photo.
          </Text>
        )}

        <Pressable style={[styles.saveBtn, saving && { opacity: 0.7 }]} onPress={onSave} disabled={saving}>
          {saving ? (
            <ActivityIndicator color={theme.colors.bg} />
          ) : (
            <Text style={styles.saveText}>Save</Text>
          )}
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.bg },
  scroll: { flex: 1 },
  content: { padding: theme.spacing.lg },
  title: { ...theme.font.title, color: theme.colors.text, marginBottom: theme.spacing.lg },
  aiBanner: {
    backgroundColor: 'rgba(249, 115, 22, 0.06)',
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: 'rgba(249, 115, 22, 0.35)',
    padding: theme.spacing.md,
    marginTop: -theme.spacing.sm,
    marginBottom: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  aiBannerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  aiBannerIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(249, 115, 22, 0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  aiBannerEyebrow: {
    ...theme.font.caption,
    color: theme.colors.accent,
    fontWeight: '700',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  aiBannerTitle: {
    ...theme.font.h2,
    color: theme.colors.text,
    marginTop: 2,
  },
  aiBannerConf: {
    alignItems: 'center',
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 4,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.bgElevated,
    borderWidth: 1,
    borderColor: theme.colors.border,
    minWidth: 56,
  },
  aiBannerConfValue: {
    ...theme.font.body,
    fontWeight: '800',
    color: theme.colors.accent,
    fontSize: 16,
  },
  aiBannerConfLabel: {
    fontSize: 9,
    color: theme.colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  aiBannerBody: {
    ...theme.font.caption,
    color: theme.colors.textMuted,
    lineHeight: 18,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  broadTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(249, 115, 22, 0.16)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  broadTagText: {
    ...theme.font.caption,
    fontSize: 12,
    color: theme.colors.accent,
    fontWeight: '600',
  },
  broadTagMuted: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: theme.colors.bgElevated,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  broadTagMutedText: {
    ...theme.font.caption,
    fontSize: 12,
    color: theme.colors.textMuted,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginTop: theme.spacing.md,
    marginBottom: 6,
  },
  labelHint: {
    fontSize: 11,
    color: theme.colors.textMuted,
    fontStyle: 'italic',
  },
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
    paddingLeft: 12,
    paddingRight: 6,
    paddingVertical: 6,
    borderRadius: 999,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  typePillActive: {
    borderColor: theme.colors.accent,
    backgroundColor: theme.colors.bgElevated,
  },
  typeText: { ...theme.font.caption, color: theme.colors.text, fontWeight: '600' },
  typeConfBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: theme.colors.bg,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  typeConfBadgeActive: {
    backgroundColor: 'rgba(249, 115, 22, 0.16)',
    borderColor: 'rgba(249, 115, 22, 0.35)',
  },
  typeConfText: {
    fontSize: 11,
    fontWeight: '700',
    color: theme.colors.textMuted,
  },
  saveBtn: {
    marginTop: theme.spacing.xl,
    backgroundColor: theme.colors.accent,
    paddingVertical: 14,
    borderRadius: theme.radius.md,
    alignItems: 'center',
  },
  saveText: { ...theme.font.body, fontWeight: '700', color: theme.colors.bg },
  manualsLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
  },
  manualsLoadingText: { ...theme.font.caption, color: theme.colors.textMuted },
  manualsEmpty: { ...theme.font.caption, color: theme.colors.textMuted },
});


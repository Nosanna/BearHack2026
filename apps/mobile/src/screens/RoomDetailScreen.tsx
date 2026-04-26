import React from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { api } from '../api/client';
import { theme } from '../theme';
import type { RootStackParamList } from '../navigation/AppShell';
import type { ApplianceDto } from '@fixit/shared';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Route = RouteProp<RootStackParamList, 'RoomDetail'>;

export function RoomDetailScreen() {
  const nav = useNavigation<Nav>();
  const route = useRoute<Route>();
  const qc = useQueryClient();
  const roomId = route.params.roomId;

  const room = useQuery({
    queryKey: ['room', roomId],
    queryFn: () => api.getRoom(roomId),
  });

  const appliances = useQuery({
    queryKey: ['appliances', { roomId }],
    queryFn: () => api.listAppliances(roomId),
  });

  const deleteAppliance = useMutation({
    mutationFn: (id: string) => api.deleteAppliance(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['appliances'] });
      qc.invalidateQueries({ queryKey: ['room', roomId] });
      qc.invalidateQueries({ queryKey: ['rooms'] });
      qc.invalidateQueries({ queryKey: ['dashboard-home'] });
    },
  });

  const deleteRoom = useMutation({
    mutationFn: () => api.deleteRoom(roomId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rooms'] });
      qc.invalidateQueries({ queryKey: ['dashboard-home'] });
      nav.goBack();
    },
  });

  const refresh = () => {
    room.refetch();
    appliances.refetch();
  };

  const confirmDeleteAppliance = (a: ApplianceDto) => {
    Alert.alert(
      'Remove equipment?',
      `This will delete "${displayName(a)}" and all of its photos, repair plans, and tasks. This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () =>
            deleteAppliance.mutate(a.id, {
              onError: (e) =>
                Alert.alert('Could not remove equipment', (e as Error).message),
            }),
        },
      ],
    );
  };

  const confirmDeleteRoom = () => {
    if ((room.data?.applianceCount ?? 0) > 0) {
      Alert.alert(
        'Remove equipment first',
        'Remove every piece of equipment in this space before deleting the space itself.',
      );
      return;
    }
    Alert.alert('Delete space?', `"${room.data?.name}" will be removed.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () =>
          deleteRoom.mutate(undefined, {
            onError: (e) =>
              Alert.alert('Could not delete space', (e as Error).message),
          }),
      },
    ]);
  };

  const isLoading = room.isLoading || appliances.isLoading;
  const isFetching = room.isFetching || appliances.isFetching;

  return (
    <SafeAreaView style={styles.root}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={isFetching}
            onRefresh={refresh}
            tintColor={theme.colors.accent}
          />
        }
      >
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>{room.data?.name ?? 'Space'}</Text>
            <Text style={styles.subtitle}>
              {(appliances.data?.length ?? 0) === 0
                ? 'No equipment yet.'
                : `${appliances.data!.length} item${
                    appliances.data!.length === 1 ? '' : 's'
                  }`}
            </Text>
          </View>
          <Pressable
            onPress={confirmDeleteRoom}
            style={styles.headerAction}
            hitSlop={8}
          >
            <Text style={styles.headerActionText}>Delete space</Text>
          </Pressable>
        </View>

        {isLoading && (
          <View style={{ paddingVertical: theme.spacing.xl }}>
            <ActivityIndicator color={theme.colors.accent} />
          </View>
        )}

        {(appliances.data ?? []).map((a) => (
          <View key={a.id} style={styles.cardWrap}>
            <View style={styles.card}>
              <Pressable
                onPress={() =>
                  nav.navigate('ApplianceDetail', { applianceId: a.id })
                }
                style={styles.cardBody}
              >
                {a.primaryImageUrl ? (
                  <Image
                    source={{ uri: a.primaryImageUrl }}
                    style={styles.thumb}
                  />
                ) : (
                  <View style={[styles.thumb, styles.thumbFallback]}>
                    <Text style={styles.thumbFallbackText}>
                      {firstChar(displayName(a))}
                    </Text>
                  </View>
                )}
                <View style={{ flex: 1, marginLeft: theme.spacing.md }}>
                  <Text style={styles.cardTitle}>{displayName(a)}</Text>
                  <Text style={styles.cardSubtitle}>
                    {[a.brand, a.model].filter(Boolean).join(' · ') ||
                      a.type.replace(/_/g, ' ')}
                  </Text>
                </View>
              </Pressable>

              <View style={styles.cardActions}>
                <Pressable
                  style={[styles.actionButton, styles.actionPrimary]}
                  onPress={() =>
                    nav.navigate('ApplianceDetail', { applianceId: a.id })
                  }
                >
                  <Text style={styles.actionPrimaryText}>Report a problem</Text>
                </Pressable>
                <Pressable
                  style={[styles.actionButton, styles.actionDanger]}
                  onPress={() => confirmDeleteAppliance(a)}
                  disabled={deleteAppliance.isPending}
                >
                  <Text style={styles.actionDangerText}>
                    {deleteAppliance.isPending &&
                    deleteAppliance.variables === a.id
                      ? 'Removing…'
                      : 'Remove'}
                  </Text>
                </Pressable>
              </View>
            </View>

            {(a.openMaintenanceCount ?? 0) > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{a.openMaintenanceCount}</Text>
              </View>
            )}
          </View>
        ))}

        {!isLoading && (appliances.data?.length ?? 0) === 0 && (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No equipment in this space</Text>
            <Text style={styles.emptyBody}>
              Tap the button below to take a photo and we'll identify it for you.
            </Text>
          </View>
        )}

        <Pressable
          style={styles.addButton}
          onPress={() =>
            nav.navigate('Camera', { mode: 'register', roomId })
          }
        >
          <Text style={styles.addButtonText}>+ Add equipment to this space</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function displayName(a: ApplianceDto): string {
  return a.nickname ?? a.type.replace(/_/g, ' ');
}

function firstChar(name: string): string {
  return (name.trim()[0] ?? '?').toUpperCase();
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.bg },
  content: {
    padding: theme.spacing.lg,
    paddingBottom: theme.spacing.xl * 2,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.lg,
  },
  title: { ...theme.font.title, color: theme.colors.text },
  subtitle: {
    ...theme.font.caption,
    color: theme.colors.textMuted,
    marginTop: 2,
  },
  headerAction: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  headerActionText: {
    ...theme.font.caption,
    color: theme.colors.danger,
  },
  cardWrap: { position: 'relative', marginBottom: theme.spacing.md },
  card: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.lg,
    overflow: 'hidden',
  },
  cardBody: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: theme.spacing.lg,
  },
  thumb: {
    width: 64,
    height: 64,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.border,
  },
  thumbFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbFallbackText: {
    ...theme.font.h2,
    color: theme.colors.textMuted,
  },
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
  cardTitle: {
    ...theme.font.h2,
    color: theme.colors.text,
    textTransform: 'capitalize',
  },
  cardSubtitle: {
    ...theme.font.caption,
    color: theme.colors.textMuted,
    marginTop: 2,
  },
  cardActions: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  actionButton: {
    flex: 1,
    paddingVertical: 14,
    alignItems: 'center',
  },
  actionPrimary: {
    borderRightWidth: 1,
    borderRightColor: theme.colors.border,
  },
  actionPrimaryText: {
    ...theme.font.body,
    color: theme.colors.accent,
    fontWeight: '600',
  },
  actionDanger: {},
  actionDangerText: {
    ...theme.font.body,
    color: theme.colors.danger,
    fontWeight: '600',
  },
  emptyCard: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.lg,
    marginBottom: theme.spacing.md,
  },
  emptyTitle: {
    ...theme.font.h2,
    color: theme.colors.text,
    marginBottom: theme.spacing.xs,
  },
  emptyBody: { ...theme.font.body, color: theme.colors.textMuted },
  addButton: {
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radius.md,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: theme.spacing.lg,
  },
  addButtonText: {
    ...theme.font.body,
    color: theme.colors.bg,
    fontWeight: '600',
  },
});

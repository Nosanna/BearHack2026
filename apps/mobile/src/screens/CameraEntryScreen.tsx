import React, { useEffect, useState } from 'react';
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
import { useNavigation } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { api } from '../api/client';
import { theme } from '../theme';
import type { RootStackParamList } from '../navigation/AppShell';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function CameraEntryScreen() {
  const nav = useNavigation<Nav>();
  const rooms = useQuery({ queryKey: ['rooms'], queryFn: () => api.listRooms() });
  const [newRoomName, setNewRoomName] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    rooms.refetch();
  }, []);

  const createRoom = async () => {
    if (!newRoomName.trim()) return;
    setCreating(true);
    try {
      await api.createRoom(newRoomName.trim());
      setNewRoomName('');
      await rooms.refetch();
    } catch (e) {
      Alert.alert('Could not create room', (e as Error).message);
    } finally {
      setCreating(false);
    }
  };

  return (
    <SafeAreaView style={styles.root}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Add an appliance</Text>
        <Text style={styles.subtitle}>
          Pick a room, then take a photo and we'll identify it for you.
        </Text>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Your rooms</Text>
          {rooms.isLoading && <ActivityIndicator color={theme.colors.accent} />}
          {(rooms.data ?? []).map((r) => (
            <Pressable
              key={r.id}
              style={styles.roomRow}
              onPress={() => nav.navigate('Camera', { mode: 'register', roomId: r.id })}
            >
              <Text style={styles.roomName}>{r.name}</Text>
              <Text style={styles.roomCount}>{r.applianceCount} appl.</Text>
            </Pressable>
          ))}
          {rooms.data?.length === 0 && (
            <Text style={styles.empty}>You don't have any rooms yet — create one below.</Text>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>New room</Text>
          <TextInput
            placeholder="e.g. Kitchen"
            placeholderTextColor={theme.colors.textMuted}
            value={newRoomName}
            onChangeText={setNewRoomName}
            style={styles.input}
          />
          <Pressable
            style={[styles.button, (!newRoomName.trim() || creating) && styles.buttonDisabled]}
            disabled={!newRoomName.trim() || creating}
            onPress={createRoom}
          >
            <Text style={styles.buttonText}>{creating ? 'Creating…' : 'Create room'}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: theme.spacing.lg, paddingBottom: theme.spacing.xl * 2 },
  title: { ...theme.font.title, color: theme.colors.text },
  subtitle: { ...theme.font.body, color: theme.colors.textMuted, marginTop: theme.spacing.sm },
  section: { marginTop: theme.spacing.xl },
  sectionTitle: { ...theme.font.h2, color: theme.colors.text, marginBottom: theme.spacing.md },
  empty: { ...theme.font.caption, color: theme.colors.textMuted },
  roomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: theme.colors.card,
    padding: theme.spacing.lg,
    borderRadius: theme.radius.md,
    marginBottom: theme.spacing.sm,
  },
  roomName: { ...theme.font.body, color: theme.colors.text },
  roomCount: { ...theme.font.caption, color: theme.colors.textMuted },
  input: {
    backgroundColor: theme.colors.card,
    color: theme.colors.text,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.radius.md,
    marginBottom: theme.spacing.md,
  },
  button: {
    backgroundColor: theme.colors.accent,
    paddingVertical: 14,
    borderRadius: theme.radius.md,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { ...theme.font.body, fontWeight: '600', color: theme.colors.bg },
});

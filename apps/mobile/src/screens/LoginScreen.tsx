import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useGoogleAuth } from '../auth/googleSignIn';
import { useAuth } from '../auth/AuthProvider';
import { theme } from '../theme';

export function LoginScreen() {
  const { signIn, devSignIn } = useAuth();
  const { request, response, promptAsync } = useGoogleAuth();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (response?.type === 'success') {
      const idToken = response.params.id_token;
      if (!idToken) return;
      setBusy(true);
      signIn(idToken)
        .catch((e) => Alert.alert('Sign-in failed', e.message))
        .finally(() => setBusy(false));
    }
  }, [response, signIn]);

  const onDevLogin = async () => {
    setBusy(true);
    try {
      await devSignIn();
    } catch (e) {
      Alert.alert('Dev sign-in failed', (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.content}>
        <Text style={styles.brand}>Fixit Fred</Text>
        <Text style={styles.tagline}>
          Snap a photo. Get a safe, step-by-step repair plan. Stay on top of maintenance.
        </Text>

        <Pressable
          style={[styles.button, (!request || busy) && styles.buttonDisabled]}
          disabled={!request || busy}
          onPress={() => promptAsync()}
        >
          {busy ? (
            <ActivityIndicator color={theme.colors.bg} />
          ) : (
            <Text style={styles.buttonText}>Continue with Google</Text>
          )}
        </Pressable>

        {__DEV__ && (
          <Pressable
            style={[styles.devButton, busy && styles.buttonDisabled]}
            disabled={busy}
            onPress={onDevLogin}
          >
            <Text style={styles.devButtonText}>
              {busy ? 'Signing in…' : 'Continue as demo user (dev)'}
            </Text>
          </Pressable>
        )}

        <Text style={styles.disclaimer}>
          We only use your Google account to sign you in. Your appliance data stays in your account.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.bg },
  content: {
    flex: 1,
    paddingHorizontal: theme.spacing.xl,
    justifyContent: 'center',
  },
  brand: {
    fontSize: 36,
    fontWeight: '800',
    color: theme.colors.text,
    marginBottom: theme.spacing.md,
  },
  tagline: {
    ...theme.font.body,
    color: theme.colors.textMuted,
    marginBottom: theme.spacing.xl * 2,
    lineHeight: 22,
  },
  button: {
    backgroundColor: theme.colors.accent,
    paddingVertical: 14,
    borderRadius: theme.radius.md,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { ...theme.font.h2, color: theme.colors.bg },
  devButton: {
    marginTop: theme.spacing.md,
    paddingVertical: 12,
    borderRadius: theme.radius.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.textMuted,
    backgroundColor: 'transparent',
  },
  devButtonText: {
    ...theme.font.body,
    color: theme.colors.textMuted,
    fontWeight: '600',
  },
  disclaimer: {
    ...theme.font.caption,
    color: theme.colors.textMuted,
    marginTop: theme.spacing.lg,
    textAlign: 'center',
  },
});

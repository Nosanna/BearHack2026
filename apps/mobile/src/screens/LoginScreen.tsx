import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { useGoogleAuth } from '../auth/googleSignIn';
import { useAuth } from '../auth/AuthProvider';
import { theme } from '../theme';

// Whether Google OAuth client IDs are present in app config. When all three
// are blank the Google button can't actually open a sign-in flow, so we
// surface the demo account button to anyone — including release-build users —
// so the prototype is always usable.
const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, string | undefined>;
const googleConfigured = Boolean(
  extra.googleClientIdIos || extra.googleClientIdAndroid || extra.googleClientIdWeb,
);
const showDemoButton = __DEV__ || !googleConfigured;

type IconName = React.ComponentProps<typeof Ionicons>['name'];

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

  // Subtle bobbing/rotating idle animation on the brand avatar — matches the
  // Dashboard hero so the login → home transition feels visually continuous.
  const idle = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(idle, {
          toValue: 1,
          duration: 2400,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(idle, {
          toValue: 0,
          duration: 2400,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [idle]);

  const avatarTransform = useMemo(
    () => [
      { translateY: idle.interpolate({ inputRange: [0, 1], outputRange: [0, -6] }) },
      { rotate: idle.interpolate({ inputRange: [0, 1], outputRange: ['-2deg', '2deg'] }) },
    ],
    [idle],
  );

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
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Brand strip — same treatment as the Dashboard so it reads as a
            single product across screens. */}
        <View style={styles.brandRow}>
          <View style={styles.brandLogo}>
            <Ionicons name="home" size={16} color={theme.colors.bg} />
            <View style={styles.brandLogoTool}>
              <Ionicons name="construct" size={9} color={theme.colors.accent} />
            </View>
          </View>
          <Text style={styles.brandText}>HOME HERO</Text>
        </View>

        {/* Hero panel: animated avatar + tagline. */}
        <View style={styles.heroCard}>
          <View style={styles.heroGlow} pointerEvents="none" />
          <Animated.View
            style={[styles.heroAvatar, { transform: avatarTransform }]}
          >
            <Ionicons name="home" size={88} color={theme.colors.accent} />
            <View style={styles.heroAvatarBadge}>
              <Ionicons name="construct" size={22} color={theme.colors.bg} />
            </View>
          </Animated.View>
          <Text style={styles.heroTitle}>Your home, handled.</Text>
          <Text style={styles.heroBody}>
            Snap a photo, ask a question, or upload a manual — Home Hero plans
            the repair and stays on top of the maintenance.
          </Text>
        </View>

        {/* Quick feature row to convey scope at a glance. */}
        <View style={styles.featureRow}>
          <Feature icon="camera" label="Snap" />
          <Feature icon="mic" label="Ask" />
          <Feature icon="list" label="Plan" />
        </View>

        {/* Auth actions */}
        <View style={styles.actions}>
          <Pressable
            style={[
              styles.primaryBtn,
              (!request || busy) && styles.btnDisabled,
            ]}
            disabled={!request || busy}
            onPress={() => promptAsync()}
          >
            {busy ? (
              <ActivityIndicator color={theme.colors.bg} />
            ) : (
              <>
                <Ionicons
                  name="logo-google"
                  size={18}
                  color={theme.colors.bg}
                />
                <Text style={styles.primaryBtnText}>Continue with Google</Text>
              </>
            )}
          </Pressable>

          {showDemoButton && (
            <Pressable
              style={[styles.ghostBtn, busy && styles.btnDisabled]}
              disabled={busy}
              onPress={onDevLogin}
            >
              <Ionicons
                name="flash-outline"
                size={16}
                color={theme.colors.textMuted}
              />
              <Text style={styles.ghostBtnText}>
                {busy ? 'Signing in…' : 'Continue as demo user'}
              </Text>
            </Pressable>
          )}
        </View>

        <Text style={styles.disclaimer}>
          {googleConfigured
            ? 'Sign-in only — your equipment, spaces, and history stay tied to your account.'
            : 'Demo build — sign in as the demo user to explore. Wire up Google OAuth before release.'}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function Feature({ icon, label }: { icon: IconName; label: string }) {
  return (
    <View style={styles.feature}>
      <View style={styles.featureIcon}>
        <Ionicons name={icon} size={16} color={theme.colors.accent} />
      </View>
      <Text style={styles.featureLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.bg },
  content: {
    flexGrow: 1,
    paddingHorizontal: theme.spacing.xl,
    paddingTop: theme.spacing.xl,
    paddingBottom: theme.spacing.xl * 2,
    justifyContent: 'space-between',
  },

  // Brand strip
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.xl,
  },
  brandLogo: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: theme.colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandLogoTool: {
    position: 'absolute',
    bottom: -3,
    right: -3,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: theme.colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.colors.accent,
  },
  brandText: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 2,
    color: theme.colors.text,
  },

  // Hero
  heroCard: {
    backgroundColor: theme.colors.bgElevated,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.xl,
    alignItems: 'center',
    overflow: 'hidden',
  },
  heroGlow: {
    position: 'absolute',
    top: -60,
    right: -60,
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: 'rgba(249,115,22,0.18)',
  },
  heroAvatar: {
    width: 132,
    height: 132,
    borderRadius: 66,
    backgroundColor: 'rgba(249,115,22,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.spacing.lg,
    borderWidth: 1,
    borderColor: 'rgba(249,115,22,0.28)',
  },
  heroAvatarBadge: {
    position: 'absolute',
    right: 6,
    bottom: 6,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: theme.colors.bgElevated,
  },
  heroTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: theme.colors.text,
    letterSpacing: -0.5,
    textAlign: 'center',
  },
  heroBody: {
    ...theme.font.body,
    color: theme.colors.textMuted,
    textAlign: 'center',
    lineHeight: 22,
    marginTop: theme.spacing.sm,
  },

  // Features
  featureRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: theme.spacing.xl,
    gap: theme.spacing.md,
  },
  feature: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: theme.spacing.md,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.card,
    gap: 6,
  },
  featureIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(249,115,22,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureLabel: {
    ...theme.font.caption,
    color: theme.colors.text,
    fontWeight: '600',
  },

  // Actions
  actions: {
    marginTop: theme.spacing.xl,
    gap: theme.spacing.md,
  },
  primaryBtn: {
    backgroundColor: theme.colors.accent,
    paddingVertical: 14,
    borderRadius: theme.radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
  },
  primaryBtnText: {
    ...theme.font.h2,
    color: theme.colors.bg,
  },
  ghostBtn: {
    paddingVertical: 12,
    borderRadius: theme.radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: 'transparent',
  },
  ghostBtnText: {
    ...theme.font.body,
    color: theme.colors.textMuted,
    fontWeight: '600',
  },
  btnDisabled: { opacity: 0.55 },

  disclaimer: {
    ...theme.font.caption,
    color: theme.colors.textMuted,
    textAlign: 'center',
    marginTop: theme.spacing.lg,
  },
});

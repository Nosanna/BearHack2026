import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ApplianceType } from '@fixit/shared';
import { theme } from '../theme';
import { DeviceArt } from './DeviceArt';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

type ActionAnim =
  | 'rotate'
  | 'shake'
  | 'pulse'
  | 'arrow-up'
  | 'arrow-down'
  | 'arrow-left'
  | 'arrow-right';

type ActionHint = {
  icon: IconName;
  label: string;
  anim: ActionAnim;
};

// Human-readable label paired with each appliance type. The actual visual is
// produced by <DeviceArt /> — a per-type SVG schematic — so the same icon
// no longer has to do double duty for unrelated devices.
const APPLIANCE_LABEL: Record<ApplianceType, string> = {
  REFRIGERATOR: 'Refrigerator',
  DISHWASHER: 'Dishwasher',
  WASHING_MACHINE: 'Washing machine',
  DRYER: 'Dryer',
  OVEN: 'Oven',
  STOVE: 'Stove',
  MICROWAVE: 'Microwave',
  AIR_CONDITIONER: 'Air conditioner',
  WATER_HEATER: 'Water heater',
  FURNACE: 'Furnace',
  GARBAGE_DISPOSAL: 'Garbage disposal',
  RANGE_HOOD: 'Range hood',
  OTHER: 'Device',
};

// Pattern → action-hint map. First match wins, so order specific patterns
// before broad ones. Keep regexes lenient (case-insensitive, word-boundary)
// because step copy comes from the LLM and varies in phrasing.
const ACTION_PATTERNS: Array<{ pattern: RegExp; action: ActionHint }> = [
  {
    pattern: /\b(flip|upside[-\s]?down|invert|turn over)\b/i,
    action: { icon: 'sync', label: 'Flip the device', anim: 'rotate' },
  },
  {
    pattern: /\b(shake|jiggle|wiggle|rattle)\b/i,
    action: { icon: 'sync', label: 'Shake gently', anim: 'shake' },
  },
  {
    pattern: /\b(unplug|disconnect (?:the )?(?:power|cord)|pull (?:the )?plug|power off|turn off|switch off)\b/i,
    action: { icon: 'power', label: 'Unplug / power off', anim: 'pulse' },
  },
  {
    pattern: /\b(plug in|reconnect|power on|turn on|switch on)\b/i,
    action: { icon: 'flash', label: 'Power on', anim: 'pulse' },
  },
  {
    pattern: /\b(unscrew|loosen|remove (?:the )?screws?)\b/i,
    action: { icon: 'construct', label: 'Loosen screws', anim: 'rotate' },
  },
  {
    pattern: /\b(screw (?:in|down|back)|tighten)\b/i,
    action: { icon: 'construct', label: 'Tighten screws', anim: 'rotate' },
  },
  {
    pattern: /\b(open (?:the )?(?:door|panel|cover|lid|hatch)|lift|remove (?:the )?(?:cover|panel|lid)|take off)\b/i,
    action: { icon: 'arrow-up', label: 'Lift / open', anim: 'arrow-up' },
  },
  {
    pattern: /\b(close (?:the )?(?:door|panel|cover|lid)|put back (?:the )?(?:cover|panel|lid)|press down|push down|lower)\b/i,
    action: { icon: 'arrow-down', label: 'Close / lower', anim: 'arrow-down' },
  },
  {
    pattern: /\b(pull (?:out|forward)|slide out|extract|take out)\b/i,
    action: { icon: 'arrow-back', label: 'Pull out', anim: 'arrow-left' },
  },
  {
    pattern: /\b(slide in|push (?:in|back)|insert|reinstall)\b/i,
    action: { icon: 'arrow-forward', label: 'Push back in', anim: 'arrow-right' },
  },
  {
    pattern: /\b(twist|rotate|turn (?:the )?(?:knob|dial|valve|cap))\b/i,
    action: { icon: 'reload', label: 'Twist / rotate', anim: 'rotate' },
  },
  {
    pattern: /\b(press|hold|tap (?:the )?button)\b/i,
    action: { icon: 'radio-button-on', label: 'Press & hold', anim: 'pulse' },
  },
  {
    pattern: /\b(empty|drain|pour out)\b/i,
    action: { icon: 'water', label: 'Drain / empty', anim: 'arrow-down' },
  },
  {
    pattern: /\b(fill|refill|pour in|add water)\b/i,
    action: { icon: 'water', label: 'Add water', anim: 'arrow-down' },
  },
  {
    pattern: /\b(wipe|clean|wash|rinse|scrub)\b/i,
    action: { icon: 'water', label: 'Clean / wipe', anim: 'pulse' },
  },
  {
    pattern: /\b(replace|install (?:the )?new|swap)\b/i,
    action: { icon: 'swap-horizontal', label: 'Replace part', anim: 'pulse' },
  },
  {
    pattern: /\b(check|inspect|look (?:for|at)|examine|see if)\b/i,
    action: { icon: 'eye', label: 'Inspect carefully', anim: 'pulse' },
  },
  {
    pattern: /\b(listen|hear|sound)\b/i,
    action: { icon: 'volume-high', label: 'Listen', anim: 'pulse' },
  },
  {
    pattern: /\b(measure|temperature|temp\b)/i,
    action: { icon: 'thermometer', label: 'Measure', anim: 'pulse' },
  },
  {
    pattern: /\b(wait|leave (?:it )?for|let (?:it )?(?:sit|rest)|allow)\b/i,
    action: { icon: 'time', label: 'Wait', anim: 'pulse' },
  },
  {
    pattern: /\b(vacuum|brush off|sweep)\b/i,
    action: { icon: 'aperture', label: 'Vacuum / brush', anim: 'pulse' },
  },
];

const FALLBACK: ActionHint = {
  icon: 'sparkles',
  label: 'Follow the step',
  anim: 'pulse',
};

function detectAction(text: string): ActionHint {
  for (const { pattern, action } of ACTION_PATTERNS) {
    if (pattern.test(text)) return action;
  }
  return FALLBACK;
}

interface StepDiagramProps {
  applianceType?: ApplianceType | null;
  stepText: string;
}

/**
 * Renders a small "schematic" card under a guided-maintenance step. The card
 * shows a stylized representation of the appliance and an animated action
 * icon (rotate, flip, arrow, pulse, etc.) that's keyed off keywords in the
 * step text. Intentionally lightweight — uses Animated transforms and
 * Ionicons so we don't pay the cost of full per-step animation assets.
 */
export function StepDiagram({ applianceType, stepText }: StepDiagramProps) {
  const deviceLabel =
    APPLIANCE_LABEL[applianceType ?? 'OTHER'] ?? APPLIANCE_LABEL.OTHER;
  const action = useMemo(() => detectAction(stepText), [stepText]);

  // Two drivers so the device can rotate/shake while the overlay stays put,
  // or vice versa.
  const deviceAnim = useRef(new Animated.Value(0)).current;
  const overlayAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    deviceAnim.setValue(0);
    overlayAnim.setValue(0);

    const isDeviceAnim = action.anim === 'rotate' || action.anim === 'shake';
    const target = isDeviceAnim ? deviceAnim : overlayAnim;

    const dur =
      action.anim === 'shake' ? 320 : action.anim === 'rotate' ? 2400 : 900;

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(target, {
          toValue: 1,
          duration: dur,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(target, {
          toValue: 0,
          duration: dur,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [action.anim, deviceAnim, overlayAnim]);

  const deviceTransform = (() => {
    if (action.anim === 'rotate') {
      return [
        {
          rotate: deviceAnim.interpolate({
            inputRange: [0, 1],
            outputRange: ['0deg', '180deg'],
          }),
        },
      ];
    }
    if (action.anim === 'shake') {
      return [
        {
          translateX: deviceAnim.interpolate({
            inputRange: [0, 0.5, 1],
            outputRange: [-4, 4, -4],
          }),
        },
      ];
    }
    return [];
  })();

  const overlayStyle: any = (() => {
    switch (action.anim) {
      case 'arrow-up':
        return {
          transform: [
            {
              translateY: overlayAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [4, -8],
              }),
            },
          ],
        };
      case 'arrow-down':
        return {
          transform: [
            {
              translateY: overlayAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [-4, 8],
              }),
            },
          ],
        };
      case 'arrow-left':
        return {
          transform: [
            {
              translateX: overlayAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [4, -8],
              }),
            },
          ],
        };
      case 'arrow-right':
        return {
          transform: [
            {
              translateX: overlayAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [-4, 8],
              }),
            },
          ],
        };
      case 'pulse':
        return {
          transform: [
            {
              scale: overlayAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [1, 1.12],
              }),
            },
          ],
          opacity: overlayAnim.interpolate({
            inputRange: [0, 1],
            outputRange: [0.7, 1],
          }),
        };
      default:
        return {};
    }
  })();

  return (
    <View style={styles.stage}>
      <Text style={styles.eyebrow}>Diagram</Text>
      <View style={styles.body}>
        <Animated.View
          style={[styles.deviceWrap, { transform: deviceTransform }]}
        >
          <DeviceArt type={applianceType} size={104} />
          <Text style={styles.deviceLabel}>{deviceLabel}</Text>
        </Animated.View>

        <View style={styles.actionRow}>
          <Animated.View style={[styles.actionIconBox, overlayStyle]}>
            <Ionicons name={action.icon} size={20} color={theme.colors.accent} />
          </Animated.View>
          <Text style={styles.actionLabel}>{action.label}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stage: {
    backgroundColor: theme.colors.bg,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
    marginTop: theme.spacing.md,
  },
  eyebrow: {
    ...theme.font.caption,
    color: theme.colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: theme.spacing.sm,
  },
  body: {
    alignItems: 'center',
    paddingVertical: theme.spacing.sm,
  },
  deviceWrap: {
    alignItems: 'center',
  },
  deviceLabel: {
    ...theme.font.caption,
    color: theme.colors.text,
    marginTop: theme.spacing.sm,
  },
  actionRow: {
    marginTop: theme.spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  actionIconBox: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(249,115,22,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLabel: {
    ...theme.font.body,
    color: theme.colors.text,
    fontWeight: '500',
  },
});

import React from 'react';
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';
import type { ApplianceType } from '@fixit/shared';

interface DeviceArtProps {
  type: ApplianceType | null | undefined;
  size?: number;
  /** Outline / accent color (defaults to theme.accent). */
  color?: string;
  /** Soft fill color used for the body. */
  fill?: string;
}

/**
 * Tiny SVG schematics for each appliance type. All shapes share a 96x96
 * viewBox so they scale uniformly. Designed to read at a glance — silhouette
 * first, plus 1–2 distinguishing details (knobs, drum, vents, etc.).
 *
 * Intentionally line-art only so it sits well on the dark theme and animates
 * cheaply when the parent rotates / shakes.
 */
export function DeviceArt({
  type,
  size = 96,
  color = '#f97316',
  fill = 'rgba(249,115,22,0.08)',
}: DeviceArtProps) {
  const C = color;
  const F = fill;
  const W = 1.8;

  const t = type ?? 'OTHER';

  return (
    <Svg width={size} height={size} viewBox="0 0 96 96">
      {renderShape(t, C, F, W)}
    </Svg>
  );
}

function renderShape(
  type: ApplianceType,
  C: string,
  F: string,
  W: number,
): React.ReactNode {
  switch (type) {
    case 'REFRIGERATOR':
      // Tall two-door unit with handles on the right edge of each door.
      return (
        <>
          <Rect x={24} y={6} width={48} height={84} rx={6} stroke={C} strokeWidth={W} fill={F} />
          <Line x1={24} y1={30} x2={72} y2={30} stroke={C} strokeWidth={W} />
          <Rect x={62} y={14} width={3} height={10} rx={1} fill={C} />
          <Rect x={62} y={40} width={3} height={20} rx={1} fill={C} />
        </>
      );

    case 'DISHWASHER':
      // Square front panel with control strip on top + handle bar.
      return (
        <>
          <Rect x={12} y={12} width={72} height={72} rx={6} stroke={C} strokeWidth={W} fill={F} />
          <Line x1={12} y1={26} x2={84} y2={26} stroke={C} strokeWidth={W} />
          <Circle cx={22} cy={19} r={1.5} fill={C} />
          <Circle cx={32} cy={19} r={1.5} fill={C} />
          <Circle cx={42} cy={19} r={1.5} fill={C} />
          <Line x1={20} y1={44} x2={76} y2={44} stroke={C} strokeWidth={1} opacity={0.6} />
          <Line x1={20} y1={60} x2={76} y2={60} stroke={C} strokeWidth={1} opacity={0.6} />
          <Rect x={36} y={70} width={24} height={3} rx={1.5} fill={C} />
        </>
      );

    case 'WASHING_MACHINE':
      // Square unit, control strip on top, prominent door + porthole window.
      return (
        <>
          <Rect x={12} y={12} width={72} height={72} rx={6} stroke={C} strokeWidth={W} fill={F} />
          <Line x1={12} y1={24} x2={84} y2={24} stroke={C} strokeWidth={W} />
          <Rect x={18} y={17} width={20} height={3} rx={1} fill={C} opacity={0.7} />
          <Circle cx={66} cy={18} r={2} fill={C} />
          <Circle cx={76} cy={18} r={2} fill={C} />
          <Circle cx={48} cy={54} r={22} stroke={C} strokeWidth={W} fill="none" />
          <Circle cx={48} cy={54} r={14} stroke={C} strokeWidth={W} fill={F} />
        </>
      );

    case 'DRYER':
      // Like washer but with vent perforations instead of a porthole.
      return (
        <>
          <Rect x={12} y={12} width={72} height={72} rx={6} stroke={C} strokeWidth={W} fill={F} />
          <Line x1={12} y1={24} x2={84} y2={24} stroke={C} strokeWidth={W} />
          <Rect x={18} y={17} width={20} height={3} rx={1} fill={C} opacity={0.7} />
          <Circle cx={70} cy={18} r={2} fill={C} />
          <Circle cx={48} cy={54} r={22} stroke={C} strokeWidth={W} fill="none" />
          <Circle cx={40} cy={48} r={1.5} fill={C} />
          <Circle cx={56} cy={48} r={1.5} fill={C} />
          <Circle cx={40} cy={60} r={1.5} fill={C} />
          <Circle cx={56} cy={60} r={1.5} fill={C} />
          <Circle cx={48} cy={54} r={1.5} fill={C} />
        </>
      );

    case 'OVEN':
      // Tall front-loading oven: knob bar on top, large door with handle.
      return (
        <>
          <Rect x={10} y={10} width={76} height={80} rx={4} stroke={C} strokeWidth={W} fill={F} />
          <Line x1={10} y1={26} x2={86} y2={26} stroke={C} strokeWidth={W} />
          <Circle cx={22} cy={18} r={2.5} stroke={C} strokeWidth={1.2} fill="none" />
          <Circle cx={36} cy={18} r={2.5} stroke={C} strokeWidth={1.2} fill="none" />
          <Circle cx={70} cy={18} r={1.5} fill={C} />
          <Rect x={20} y={32} width={56} height={2.5} rx={1} fill={C} />
          <Rect x={18} y={40} width={60} height={42} rx={2} stroke={C} strokeWidth={1} fill="none" opacity={0.7} />
        </>
      );

    case 'STOVE':
      // Cooktop with raised back panel, four burners in 2x2 grid.
      return (
        <>
          <Rect x={10} y={14} width={76} height={14} rx={2} stroke={C} strokeWidth={W} fill={F} />
          <Circle cx={22} cy={21} r={2} fill={C} />
          <Circle cx={34} cy={21} r={2} fill={C} />
          <Circle cx={62} cy={21} r={2} fill={C} />
          <Circle cx={74} cy={21} r={2} fill={C} />
          <Rect x={10} y={28} width={76} height={62} rx={4} stroke={C} strokeWidth={W} fill={F} />
          <Circle cx={32} cy={46} r={7} stroke={C} strokeWidth={W} fill="none" />
          <Circle cx={64} cy={46} r={7} stroke={C} strokeWidth={W} fill="none" />
          <Circle cx={32} cy={72} r={7} stroke={C} strokeWidth={W} fill="none" />
          <Circle cx={64} cy={72} r={7} stroke={C} strokeWidth={W} fill="none" />
        </>
      );

    case 'MICROWAVE':
      // Wide low unit: dark window on the left, control panel on the right.
      return (
        <>
          <Rect x={4} y={22} width={88} height={52} rx={4} stroke={C} strokeWidth={W} fill={F} />
          <Rect x={10} y={28} width={54} height={40} rx={2} stroke={C} strokeWidth={1.2} fill="none" opacity={0.7} />
          <Rect x={61} y={46} width={2} height={10} rx={1} fill={C} />
          <Rect x={70} y={28} width={18} height={4} rx={1} fill={C} opacity={0.6} />
          <Circle cx={74} cy={42} r={1.5} fill={C} />
          <Circle cx={80} cy={42} r={1.5} fill={C} />
          <Circle cx={86} cy={42} r={1.5} fill={C} />
          <Circle cx={74} cy={50} r={1.5} fill={C} />
          <Circle cx={80} cy={50} r={1.5} fill={C} />
          <Circle cx={86} cy={50} r={1.5} fill={C} />
          <Circle cx={74} cy={58} r={1.5} fill={C} />
          <Circle cx={80} cy={58} r={1.5} fill={C} />
          <Circle cx={86} cy={58} r={1.5} fill={C} />
        </>
      );

    case 'AIR_CONDITIONER':
      // Wide wall/window unit: top bezel + horizontal vent slats below.
      return (
        <>
          <Rect x={4} y={26} width={88} height={48} rx={4} stroke={C} strokeWidth={W} fill={F} />
          <Rect x={4} y={26} width={88} height={10} rx={2} stroke={C} strokeWidth={1.2} fill="none" opacity={0.7} />
          <Rect x={66} y={29} width={12} height={3} rx={1} fill={C} opacity={0.7} />
          <Line x1={12} y1={44} x2={84} y2={44} stroke={C} strokeWidth={W} />
          <Line x1={12} y1={52} x2={84} y2={52} stroke={C} strokeWidth={W} />
          <Line x1={12} y1={60} x2={84} y2={60} stroke={C} strokeWidth={W} />
          <Line x1={12} y1={68} x2={84} y2={68} stroke={C} strokeWidth={W} />
        </>
      );

    case 'WATER_HEATER':
      // Tall vertical cylinder with a top fitting and a side access panel.
      return (
        <>
          <Rect x={42} y={4} width={12} height={8} rx={1} stroke={C} strokeWidth={W} fill={F} />
          <Rect x={32} y={12} width={32} height={72} rx={16} stroke={C} strokeWidth={W} fill={F} />
          <Circle cx={48} cy={40} r={4} stroke={C} strokeWidth={1.2} fill="none" />
          <Line x1={48} y1={40} x2={51} y2={37} stroke={C} strokeWidth={1.2} />
          <Rect x={40} y={56} width={16} height={10} rx={1} stroke={C} strokeWidth={1} fill="none" opacity={0.7} />
          <Rect x={44} y={84} width={8} height={4} rx={1} fill={C} />
        </>
      );

    case 'FURNACE':
      // Boxy unit with intake pipe, vent slots, and a lower access panel.
      return (
        <>
          <Rect x={28} y={2} width={40} height={6} rx={1} stroke={C} strokeWidth={W} fill={F} />
          <Rect x={16} y={8} width={64} height={82} rx={4} stroke={C} strokeWidth={W} fill={F} />
          <Line x1={26} y1={32} x2={70} y2={32} stroke={C} strokeWidth={W} />
          <Line x1={26} y1={40} x2={70} y2={40} stroke={C} strokeWidth={W} />
          <Line x1={26} y1={48} x2={70} y2={48} stroke={C} strokeWidth={W} />
          <Rect x={24} y={60} width={48} height={22} rx={2} stroke={C} strokeWidth={1.2} fill="none" opacity={0.7} />
          <Circle cx={66} cy={71} r={1.5} fill={C} />
        </>
      );

    case 'GARBAGE_DISPOSAL':
      // Hopper funnel narrowing into a cylindrical motor housing.
      return (
        <>
          <Path d="M 18 8 L 78 8 L 66 36 L 30 36 Z" stroke={C} strokeWidth={W} fill={F} />
          <Line x1={24} y1={16} x2={72} y2={16} stroke={C} strokeWidth={1} opacity={0.6} />
          <Rect x={30} y={36} width={36} height={48} rx={3} stroke={C} strokeWidth={W} fill={F} />
          <Line x1={30} y1={48} x2={66} y2={48} stroke={C} strokeWidth={1} opacity={0.6} />
          <Rect x={26} y={84} width={44} height={4} rx={2} fill={C} />
        </>
      );

    case 'RANGE_HOOD':
      // Wide angled hood with vent strip and three downlight bulbs.
      return (
        <>
          <Path d="M 6 26 L 90 26 L 80 58 L 16 58 Z" stroke={C} strokeWidth={W} fill={F} />
          <Line x1={14} y1={36} x2={82} y2={36} stroke={C} strokeWidth={1} opacity={0.6} />
          <Line x1={12} y1={46} x2={84} y2={46} stroke={C} strokeWidth={1} opacity={0.6} />
          <Rect x={16} y={58} width={64} height={6} rx={1} stroke={C} strokeWidth={W} fill={F} />
          <Circle cx={28} cy={72} r={2.5} stroke={C} strokeWidth={1.2} fill={F} />
          <Circle cx={48} cy={72} r={2.5} stroke={C} strokeWidth={1.2} fill={F} />
          <Circle cx={68} cy={72} r={2.5} stroke={C} strokeWidth={1.2} fill={F} />
        </>
      );

    case 'OTHER':
    default:
      // Generic boxy device with a small screen + LED accent.
      return (
        <>
          <Rect x={14} y={20} width={68} height={56} rx={6} stroke={C} strokeWidth={W} fill={F} />
          <Rect x={22} y={28} width={52} height={28} rx={2} stroke={C} strokeWidth={1.2} fill="none" opacity={0.7} />
          <Circle cx={68} cy={68} r={2} fill={C} />
          <Rect x={26} y={66} width={20} height={3} rx={1} fill={C} opacity={0.6} />
        </>
      );
  }
}

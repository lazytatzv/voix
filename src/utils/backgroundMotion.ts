import type { BackgroundMotion } from '../types';

export interface BackgroundMotionPreset {
  id: BackgroundMotion;
  name: string;
  description: string;
}

export const DEFAULT_BACKGROUND_MOTION_AMOUNT = 0.12;
export const MIN_BACKGROUND_MOTION_AMOUNT = 0.02;
export const MAX_BACKGROUND_MOTION_AMOUNT = 0.5;

/** One-click camera moves for the background video. */
export const BACKGROUND_MOTION_PRESETS: BackgroundMotionPreset[] = [
  { id: 'none', name: 'None', description: 'Keep the video still.' },
  { id: 'zoom-in', name: 'Zoom in', description: 'Slowly push in toward the centre.' },
  { id: 'zoom-out', name: 'Zoom out', description: 'Start close and slowly pull back.' },
  { id: 'pan-left', name: 'Pan left', description: 'Drift the camera toward the left edge.' },
  { id: 'pan-right', name: 'Pan right', description: 'Drift the camera toward the right edge.' },
  { id: 'pan-up', name: 'Pan up', description: 'Drift the camera toward the top edge.' },
  { id: 'pan-down', name: 'Pan down', description: 'Drift the camera toward the bottom edge.' },
];

export function normalizeBackgroundMotion(value: unknown): BackgroundMotion {
  return BACKGROUND_MOTION_PRESETS.some((preset) => preset.id === value)
    ? (value as BackgroundMotion)
    : 'none';
}

export function normalizeBackgroundMotionAmount(value: unknown): number {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return DEFAULT_BACKGROUND_MOTION_AMOUNT;
  return Math.max(
    MIN_BACKGROUND_MOTION_AMOUNT,
    Math.min(MAX_BACKGROUND_MOTION_AMOUNT, amount)
  );
}

export interface BackgroundMotionState {
  /** Multiplier applied to the cover-fitted video. */
  scale: number;
  /** Horizontal pan in the range -1 (shifted left) to 0 (centred). */
  shiftX: number;
  /** Vertical pan in the range -1 (shifted up) to 0 (centred). */
  shiftY: number;
}

const IDENTITY: BackgroundMotionState = { scale: 1, shiftX: 0, shiftY: 0 };

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/**
 * Resolve the camera move at a timeline position. Motion is paced across the
 * whole project so preview and export see the same framing at the same time.
 */
export function resolveBackgroundMotion(
  motion: BackgroundMotion | undefined,
  amount: number,
  time: number,
  duration: number
): BackgroundMotionState {
  if (!motion || motion === 'none') return IDENTITY;
  const strength = normalizeBackgroundMotionAmount(amount);
  const progress = clamp01(duration > 0 ? time / duration : 0);
  const zoomedScale = 1 + strength;

  switch (motion) {
    case 'zoom-in':
      return { scale: 1 + strength * progress, shiftX: 0, shiftY: 0 };
    case 'zoom-out':
      return { scale: 1 + strength * (1 - progress), shiftX: 0, shiftY: 0 };
    case 'pan-left':
      return { scale: zoomedScale, shiftX: -(1 - progress), shiftY: 0 };
    case 'pan-right':
      return { scale: zoomedScale, shiftX: -progress, shiftY: 0 };
    case 'pan-up':
      return { scale: zoomedScale, shiftX: 0, shiftY: -(1 - progress) };
    case 'pan-down':
      return { scale: zoomedScale, shiftX: 0, shiftY: -progress };
    default:
      return IDENTITY;
  }
}

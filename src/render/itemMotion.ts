import type { ItemAnimation, TimelineItem } from '../types';

/** Transform applied to a visual item at a given point in time. */
export interface ItemMotion {
  /** Multiplier for the item's own opacity (0 - 1). */
  alpha: number;
  /** Horizontal offset in project pixels. */
  offsetX: number;
  /** Vertical offset in project pixels. */
  offsetY: number;
  /** Uniform scale multiplier. */
  scale: number;
}

const SLIDE_DISTANCE = 64;
const IDENTITY: ItemMotion = { alpha: 1, offsetX: 0, offsetY: 0, scale: 1 };

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function easeOutCubic(value: number): number {
  return 1 - Math.pow(1 - value, 3);
}

/**
 * Applies an enter animation. `progress` is 0 at the item start and 1 when
 * the animation has settled, so transforms use `1 - eased` toward zero.
 */
function applyEnter(motion: ItemMotion, animation: ItemAnimation | undefined, progress: number) {
  if (!animation || animation === 'none' || animation === 'fade') return;
  const eased = easeOutCubic(clamp01(progress));
  const remaining = 1 - eased;
  switch (animation) {
    case 'slide-up':
      motion.offsetY += remaining * SLIDE_DISTANCE;
      break;
    case 'slide-down':
      motion.offsetY -= remaining * SLIDE_DISTANCE;
      break;
    case 'slide-left':
      motion.offsetX += remaining * SLIDE_DISTANCE;
      break;
    case 'slide-right':
      motion.offsetX -= remaining * SLIDE_DISTANCE;
      break;
    case 'zoom':
      motion.scale *= 0.8 + eased * 0.2;
      break;
    case 'pop':
      motion.scale *= 0.7 + progress * 0.3 + Math.sin(progress * Math.PI) * 0.14;
      break;
  }
}

/**
 * Applies an exit animation. `progress` is 1 at the beginning of the exit and
 * 0 at the item end, so the transform grows with `1 - eased`.
 */
function applyExit(motion: ItemMotion, animation: ItemAnimation | undefined, progress: number) {
  if (!animation || animation === 'none' || animation === 'fade') return;
  const eased = easeOutCubic(clamp01(progress));
  const remaining = 1 - eased;
  switch (animation) {
    case 'slide-up':
      motion.offsetY -= remaining * SLIDE_DISTANCE;
      break;
    case 'slide-down':
      motion.offsetY += remaining * SLIDE_DISTANCE;
      break;
    case 'slide-left':
      motion.offsetX -= remaining * SLIDE_DISTANCE;
      break;
    case 'slide-right':
      motion.offsetX += remaining * SLIDE_DISTANCE;
      break;
    case 'zoom':
      motion.scale *= 1 - remaining * 0.2;
      break;
    case 'pop':
      motion.scale *= 1 - remaining * 0.25;
      break;
  }
}

/**
 * Computes fade and enter/exit motion for a timeline item. Preview and export
 * both call this so transitions are frame-identical.
 */
export function computeItemMotion(item: TimelineItem, time: number): ItemMotion {
  const fadeIn = Math.max(0, item.fadeIn ?? 0);
  const fadeOut = Math.max(0, item.fadeOut ?? 0);
  if (fadeIn === 0 && fadeOut === 0) return { ...IDENTITY };

  const motion: ItemMotion = { ...IDENTITY };
  const elapsed = time - item.startTime;
  const remaining = item.startTime + item.duration - time;

  if (fadeIn > 0 && elapsed < fadeIn) {
    const progress = clamp01(elapsed / fadeIn);
    motion.alpha *= progress;
    applyEnter(motion, item.animIn, progress);
  }
  if (fadeOut > 0 && remaining < fadeOut) {
    const progress = clamp01(remaining / fadeOut);
    motion.alpha *= progress;
    applyExit(motion, item.animOut, progress);
  }
  return motion;
}

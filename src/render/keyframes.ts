import {
  ImageItem,
  KeyframeEasing,
  ShapeItem,
  TextItem,
  TransformKeyframe,
} from '../types';

export interface ItemTransform {
  /** Canvas percent for text, project pixels for images. */
  x: number;
  y: number;
  scale: number;
  rotation: number;
  opacity: number;
}

const EASINGS: KeyframeEasing[] = ['linear', 'ease-in', 'ease-out', 'ease-in-out', 'hold'];

export function isKeyframeEasing(value: unknown): value is KeyframeEasing {
  return typeof value === 'string' && EASINGS.includes(value as KeyframeEasing);
}

export function getItemBaseTransform(item: TextItem | ImageItem | ShapeItem): ItemTransform {
  if (item.type === 'text') {
    return {
      x: Number.isFinite(item.xPercent) ? (item.xPercent as number) : 50,
      y: Number.isFinite(item.yPercent) ? (item.yPercent as number) : 50,
      scale: 1,
      rotation: Number.isFinite(item.rotation) ? (item.rotation as number) : 0,
      opacity: Number.isFinite(item.opacity) ? (item.opacity as number) : 1,
    };
  }
  return {
    x: Number.isFinite(item.x) ? item.x : 0,
    y: Number.isFinite(item.y) ? item.y : 0,
    scale: 1,
    rotation: Number.isFinite(item.rotation) ? (item.rotation as number) : 0,
    opacity: Number.isFinite(item.opacity) ? (item.opacity as number) : 1,
  };
}

function ease(progress: number, easing: KeyframeEasing): number {
  const t = Math.max(0, Math.min(1, progress));
  switch (easing) {
    case 'ease-in':
      return t * t;
    case 'ease-out':
      return 1 - (1 - t) * (1 - t);
    case 'ease-in-out':
      return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    case 'hold':
      return 0;
    case 'linear':
    default:
      return t;
  }
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

interface ResolvedKey {
  time: number;
  easing: KeyframeEasing;
  value: ItemTransform;
}

/**
 * Fill sparse keyframes so each one carries a complete transform, then
 * interpolate the pair surrounding `localTime`. This mirrors YMM4's behaviour
 * where an untouched property simply keeps its previous value.
 */
export function sampleKeyframes(
  keyframes: TransformKeyframe[] | undefined,
  localTime: number,
  base: ItemTransform
): ItemTransform {
  if (!keyframes || keyframes.length === 0) return base;

  const sorted = [...keyframes].sort((a, b) => a.time - b.time);
  const resolved: ResolvedKey[] = [];
  let previous = base;
  for (const keyframe of sorted) {
    const value: ItemTransform = {
      x: Number.isFinite(keyframe.x as number) ? (keyframe.x as number) : previous.x,
      y: Number.isFinite(keyframe.y as number) ? (keyframe.y as number) : previous.y,
      scale:
        Number.isFinite(keyframe.scale as number) && (keyframe.scale as number) > 0.001
          ? (keyframe.scale as number)
          : previous.scale,
      rotation: Number.isFinite(keyframe.rotation as number)
        ? (keyframe.rotation as number)
        : previous.rotation,
      opacity: Number.isFinite(keyframe.opacity as number)
        ? Math.max(0, Math.min(1, keyframe.opacity as number))
        : previous.opacity,
    };
    resolved.push({
      time: Math.max(0, keyframe.time),
      easing: isKeyframeEasing(keyframe.easing) ? keyframe.easing : 'linear',
      value,
    });
    previous = value;
  }

  if (resolved.length === 1 || localTime <= resolved[0].time) {
    return resolved[0].value;
  }
  const last = resolved[resolved.length - 1];
  if (localTime >= last.time) return last.value;

  for (let i = 0; i < resolved.length - 1; i += 1) {
    const current = resolved[i];
    const next = resolved[i + 1];
    if (localTime < current.time || localTime >= next.time) continue;
    const span = Math.max(0.0001, next.time - current.time);
    const progress = ease((localTime - current.time) / span, current.easing);
    return {
      x: lerp(current.value.x, next.value.x, progress),
      y: lerp(current.value.y, next.value.y, progress),
      scale: lerp(current.value.scale, next.value.scale, progress),
      rotation: lerp(current.value.rotation, next.value.rotation, progress),
      opacity: lerp(current.value.opacity, next.value.opacity, progress),
    };
  }
  return last.value;
}

/** Resolve the base plus animated transform for text, image and shape items. */
export function resolveItemTransform(
  item: TextItem | ImageItem | ShapeItem,
  time: number
): ItemTransform {
  const localTime = Math.max(0, Math.min(item.duration, time - item.startTime));
  return sampleKeyframes(item.keyframes, localTime, getItemBaseTransform(item));
}

let keyframeCounter = 0;

function nextKeyframeId(): string {
  keyframeCounter += 1;
  return `kf_${Date.now().toString(36)}_${keyframeCounter.toString(36)}`;
}

export interface SnapshotKeyframeResult {
  keyframe: TransformKeyframe;
  keyframes: TransformKeyframe[];
  /** True when a key already existed at that time (the playhead snaps to it). */
  existed: boolean;
}

/**
 * Create a keyframe at `absoluteTime` that captures the currently resolved
 * transform. Used by the inspector button and the `K` shortcut so both paths
 * produce identical keys.
 */
export function addSnapshotKeyframe(
  item: TextItem | ImageItem | ShapeItem,
  absoluteTime: number
): SnapshotKeyframeResult {
  const localTime = Math.max(0, Math.min(item.duration, absoluteTime - item.startTime));
  const time = Number(localTime.toFixed(2));
  const existingKeys = item.keyframes ?? [];
  const existing = existingKeys.find((key) => Math.abs(key.time - time) < 0.02);
  if (existing) {
    return { keyframe: existing, keyframes: existingKeys, existed: true };
  }

  const snapshot = sampleKeyframes(existingKeys, localTime, getItemBaseTransform(item));
  const keyframe: TransformKeyframe = {
    id: nextKeyframeId(),
    time,
    x: Number(snapshot.x.toFixed(2)),
    y: Number(snapshot.y.toFixed(2)),
    scale: Number(snapshot.scale.toFixed(3)),
    rotation: Number(snapshot.rotation.toFixed(2)),
    opacity: Number(snapshot.opacity.toFixed(3)),
    easing: 'linear',
  };
  const keyframes = [...existingKeys, keyframe].sort((a, b) => a.time - b.time);
  return { keyframe, keyframes, existed: false };
}

function finiteNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/** Normalize YAML/user keyframe arrays without throwing on partial data. */
export function normalizeKeyframes(
  raw: unknown,
  itemIndex = 0
): TransformKeyframe[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const result: TransformKeyframe[] = [];
  raw.forEach((entry, index) => {
    if (!entry || typeof entry !== 'object') return;
    const record = entry as Record<string, unknown>;
    const time = finiteNumber(record.time);
    if (time === undefined) return;
    const keyframe: TransformKeyframe = {
      id: String(record.id ?? `kf_${itemIndex}_${index}`),
      time: Math.max(0, time),
    };
    const x = finiteNumber(record.x);
    const y = finiteNumber(record.y);
    const scale = finiteNumber(record.scale);
    const rotation = finiteNumber(record.rotation);
    const opacity = finiteNumber(record.opacity);
    if (x !== undefined) keyframe.x = x;
    if (y !== undefined) keyframe.y = y;
    if (scale !== undefined) keyframe.scale = Math.max(0.01, scale);
    if (rotation !== undefined) keyframe.rotation = rotation;
    if (opacity !== undefined) keyframe.opacity = Math.max(0, Math.min(1, opacity));
    if (isKeyframeEasing(record.easing)) keyframe.easing = record.easing;
    result.push(keyframe);
  });
  if (result.length === 0) return undefined;
  result.sort((a, b) => a.time - b.time);
  return result;
}

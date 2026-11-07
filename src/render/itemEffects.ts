import { ItemEffects } from '../types';

/**
 * Normalisation and Canvas serialisation for per-item visual effects.
 *
 * Keeping the defaults out of the persisted object makes YAML readable and
 * lets projects that never touch effects stay byte-identical on save.
 */

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function numberIn(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

/** Return a compact effects object, or undefined when every value is neutral. */
export function normalizeItemEffects(raw: unknown): ItemEffects | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const rec = asRecord(raw);

  const blur = numberIn(rec.blur, 0, 0, 50);
  const brightness = numberIn(rec.brightness, 1, 0, 3);
  const contrast = numberIn(rec.contrast, 1, 0, 3);
  const saturation = numberIn(rec.saturation, 1, 0, 3);
  const hueRotate = numberIn(rec.hueRotate, 0, -360, 360);
  const grayscale = numberIn(rec.grayscale, 0, 0, 1);
  const sepia = numberIn(rec.sepia, 0, 0, 1);
  const invert = numberIn(rec.invert, 0, 0, 1);

  const effects: ItemEffects = {};
  if (blur > 0) effects.blur = Number(blur.toFixed(2));
  if (brightness !== 1) effects.brightness = Number(brightness.toFixed(3));
  if (contrast !== 1) effects.contrast = Number(contrast.toFixed(3));
  if (saturation !== 1) effects.saturation = Number(saturation.toFixed(3));
  if (hueRotate !== 0) effects.hueRotate = Number(hueRotate.toFixed(1));
  if (grayscale > 0) effects.grayscale = Number(grayscale.toFixed(3));
  if (sepia > 0) effects.sepia = Number(sepia.toFixed(3));
  if (invert > 0) effects.invert = Number(invert.toFixed(3));

  return Object.keys(effects).length > 0 ? effects : undefined;
}

export function hasVisibleEffects(effects?: ItemEffects): boolean {
  if (!effects) return false;
  return (
    (effects.blur ?? 0) > 0 ||
    (effects.brightness ?? 1) !== 1 ||
    (effects.contrast ?? 1) !== 1 ||
    (effects.saturation ?? 1) !== 1 ||
    (effects.hueRotate ?? 0) !== 0 ||
    (effects.grayscale ?? 0) > 0 ||
    (effects.sepia ?? 0) > 0 ||
    (effects.invert ?? 0) > 0
  );
}

/** Build a CSS/Canvas `filter` string in a stable, readable order. */
export function buildCanvasFilter(effects?: ItemEffects): string {
  if (!hasVisibleEffects(effects)) return 'none';
  const parts: string[] = [];
  const blur = effects?.blur ?? 0;
  if (blur > 0) parts.push(`blur(${Number(blur.toFixed(2))}px)`);
  const brightness = effects?.brightness ?? 1;
  if (brightness !== 1) parts.push(`brightness(${Number(brightness.toFixed(3))})`);
  const contrast = effects?.contrast ?? 1;
  if (contrast !== 1) parts.push(`contrast(${Number(contrast.toFixed(3))})`);
  const saturation = effects?.saturation ?? 1;
  if (saturation !== 1) parts.push(`saturate(${Number(saturation.toFixed(3))})`);
  const hueRotate = effects?.hueRotate ?? 0;
  if (hueRotate !== 0) parts.push(`hue-rotate(${Number(hueRotate.toFixed(1))}deg)`);
  const grayscale = effects?.grayscale ?? 0;
  if (grayscale > 0) parts.push(`grayscale(${Number(grayscale.toFixed(3))})`);
  const sepia = effects?.sepia ?? 0;
  if (sepia > 0) parts.push(`sepia(${Number(sepia.toFixed(3))})`);
  const invert = effects?.invert ?? 0;
  if (invert > 0) parts.push(`invert(${Number(invert.toFixed(3))})`);
  return parts.length > 0 ? parts.join(' ') : 'none';
}

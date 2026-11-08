import type { BlendMode } from '../types';

/** Blend modes offered in the inspector, matching YMM4's common set. */
export const BLEND_MODES: BlendMode[] = [
  'normal',
  'multiply',
  'screen',
  'overlay',
  'darken',
  'lighten',
  'color-dodge',
  'color-burn',
  'hard-light',
  'soft-light',
  'difference',
  'exclusion',
  'hue',
  'saturation',
  'color',
  'luminosity',
  'add',
];

const CANVAS_BLEND: Record<BlendMode, GlobalCompositeOperation> = {
  normal: 'source-over',
  multiply: 'multiply',
  screen: 'screen',
  overlay: 'overlay',
  darken: 'darken',
  lighten: 'lighten',
  'color-dodge': 'color-dodge',
  'color-burn': 'color-burn',
  'hard-light': 'hard-light',
  'soft-light': 'soft-light',
  difference: 'difference',
  exclusion: 'exclusion',
  hue: 'hue',
  saturation: 'saturation',
  color: 'color',
  luminosity: 'luminosity',
  add: 'lighter',
};

export function canvasBlendMode(mode: BlendMode | undefined): GlobalCompositeOperation {
  return mode ? CANVAS_BLEND[mode] ?? 'source-over' : 'source-over';
}

export function normalizeBlendMode(value: unknown): BlendMode | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toLowerCase();
  return (BLEND_MODES as string[]).includes(normalized)
    ? (normalized as BlendMode)
    : undefined;
}

const YMMP_BLEND: Record<string, BlendMode> = {
  normal: 'normal',
  multiply: 'multiply',
  screen: 'screen',
  overlay: 'overlay',
  darken: 'darken',
  lighten: 'lighten',
  colordodge: 'color-dodge',
  colorburn: 'color-burn',
  hardlight: 'hard-light',
  softlight: 'soft-light',
  difference: 'difference',
  exclusion: 'exclusion',
  hue: 'hue',
  saturation: 'saturation',
  color: 'color',
  luminosity: 'luminosity',
  add: 'add',
  addition: 'add',
  plus: 'add',
};

/** Converts YMM4's PascalCase blend names to the normalized mode ids. */
export function normalizeYmmpBlend(value: unknown): BlendMode | undefined {
  if (typeof value !== 'string') return undefined;
  const key = value.toLowerCase().replace(/[^a-z0-9]+/g, '');
  return YMMP_BLEND[key];
}

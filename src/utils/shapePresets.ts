import { ShapeItem, ShapeKind } from '../types';

export interface ShapePreset {
  id: string;
  name: string;
  shape: ShapeKind;
  fillColor?: string;
  strokeColor?: string;
  strokeWidth?: number;
  cornerRadius?: number;
  rotation?: number;
  opacity?: number;
  /** Width as a fraction of the project width (ignored when squareRatio is set). */
  widthRatio?: number;
  /** Height as a fraction of the project height (ignored when squareRatio is set). */
  heightRatio?: number;
  /** Square size as a fraction of the project's smaller dimension. */
  squareRatio?: number;
}

/**
 * One-click annotation styles for the shape lane. Ratios keep the presets
 * usable on both 1080p and 4K projects.
 */
export const SHAPE_PRESETS: ShapePreset[] = [
  {
    id: 'red-arrow',
    name: 'Red Arrow',
    shape: 'arrow',
    fillColor: '#ef4444',
    strokeColor: '#ffffff',
    strokeWidth: 6,
    widthRatio: 0.22,
    heightRatio: 0.1,
  },
  {
    id: 'yellow-highlight',
    name: 'Highlight',
    shape: 'rectangle',
    fillColor: 'rgba(250, 204, 21, 0.45)',
    strokeColor: 'transparent',
    strokeWidth: 0,
    cornerRadius: 10,
    widthRatio: 0.36,
    heightRatio: 0.08,
  },
  {
    id: 'white-speech',
    name: 'Speech Bubble',
    shape: 'speech',
    fillColor: '#ffffff',
    strokeColor: '#111827',
    strokeWidth: 6,
    cornerRadius: 24,
    widthRatio: 0.3,
    heightRatio: 0.16,
  },
  {
    id: 'focus-burst',
    name: 'Focus Burst',
    shape: 'burst',
    fillColor: 'transparent',
    strokeColor: '#ffffff',
    strokeWidth: 10,
    squareRatio: 0.52,
    opacity: 0.9,
  },
  {
    id: 'yellow-underline',
    name: 'Underline',
    shape: 'line',
    fillColor: 'transparent',
    strokeColor: '#facc15',
    strokeWidth: 16,
    widthRatio: 0.3,
    heightRatio: 0.02,
  },
  {
    id: 'star',
    name: 'Star',
    shape: 'star',
    fillColor: '#facc15',
    strokeColor: '#111827',
    strokeWidth: 6,
    squareRatio: 0.14,
  },
];

type ShapeBounds = Pick<ShapeItem, 'x' | 'y' | 'width' | 'height'>;

/** Resize a shape to a preset while keeping its current centre. */
export function shapePresetPatch(
  item: ShapeBounds,
  preset: ShapePreset,
  projectWidth: number,
  projectHeight: number
): Partial<ShapeItem> {
  const squareSize = preset.squareRatio
    ? Math.round(Math.min(projectWidth, projectHeight) * preset.squareRatio)
    : null;
  const width = Math.max(
    1,
    squareSize ?? Math.round(projectWidth * (preset.widthRatio ?? 0.25))
  );
  const height = Math.max(
    1,
    squareSize ?? Math.round(projectHeight * (preset.heightRatio ?? 0.1))
  );
  const centerX = item.x + item.width / 2;
  const centerY = item.y + item.height / 2;

  return {
    shape: preset.shape,
    x: Math.round(centerX - width / 2),
    y: Math.round(centerY - height / 2),
    width,
    height,
    fillColor: preset.fillColor,
    strokeColor: preset.strokeColor,
    strokeWidth: preset.strokeWidth,
    cornerRadius: preset.cornerRadius ?? 0,
    rotation: preset.rotation ?? 0,
    opacity: preset.opacity ?? 1,
  };
}

import { ImageItem, ShapeItem, TextItem } from '../types';

/** Items that share the composited layer space in the preview/export pass. */
export type VisualLayerItem = ImageItem | ShapeItem | TextItem;

export type VisualLayerStep =
  | { kind: 'item'; item: VisualLayerItem }
  | { kind: 'characters' };

/**
 * Characters are not timeline items in Voix, but they still need a stable z
 * position. Place them between the default image (3) and text (4) layers, and
 * let explicit item layers move above or below them.
 */
export const CHARACTER_LAYER = 3.5;

/** Plan the back-to-front draw order for a set of visual items. */
export function planVisualLayers(items: VisualLayerItem[]): VisualLayerStep[] {
  const steps: VisualLayerStep[] = [];
  let charactersPlaced = false;
  const sorted = [...items].sort((a, b) => a.layer - b.layer);
  for (const item of sorted) {
    if (!charactersPlaced && item.layer > CHARACTER_LAYER) {
      steps.push({ kind: 'characters' });
      charactersPlaced = true;
    }
    steps.push({ kind: 'item', item });
  }
  if (!charactersPlaced) steps.push({ kind: 'characters' });
  return steps;
}

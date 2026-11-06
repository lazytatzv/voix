import { resolveImageToDataUrl, clearResolvedImageCache } from '../utils/imageUtils';

const cache = new Map<string, HTMLImageElement>();
const loading = new Map<string, Promise<HTMLImageElement | null>>();

export interface ImageContentBounds {
  /** Normalized coordinates of the visible (non-transparent) pixels. */
  left: number;
  top: number;
  right: number;
  bottom: number;
}

const FULL_CONTENT_BOUNDS: ImageContentBounds = { left: 0, top: 0, right: 1, bottom: 1 };
const contentBoundsCache = new WeakMap<HTMLImageElement, ImageContentBounds>();

function measureImageContentBounds(img: HTMLImageElement): ImageContentBounds {
  const width = img.naturalWidth;
  const height = img.naturalHeight;
  if (!width || !height) return FULL_CONTENT_BOUNDS;

  try {
    // Scanning at a capped resolution keeps this cheap for 4K avatars while
    // still trimming the large transparent margins left behind by background
    // removal. On failure (e.g. a tainted cross-origin image) keep full bounds.
    const maxScan = 1024;
    const scale = Math.min(1, maxScan / Math.max(width, height));
    const scanWidth = Math.max(1, Math.round(width * scale));
    const scanHeight = Math.max(1, Math.round(height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = scanWidth;
    canvas.height = scanHeight;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return FULL_CONTENT_BOUNDS;

    ctx.drawImage(img, 0, 0, scanWidth, scanHeight);
    const data = ctx.getImageData(0, 0, scanWidth, scanHeight).data;
    let minX = scanWidth;
    let minY = scanHeight;
    let maxX = -1;
    let maxY = -1;
    const alphaThreshold = 12;

    for (let y = 0; y < scanHeight; y += 1) {
      const row = y * scanWidth * 4;
      for (let x = 0; x < scanWidth; x += 1) {
        if (data[row + x * 4 + 3] > alphaThreshold) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }

    if (maxX < minX || maxY < minY) return FULL_CONTENT_BOUNDS;
    return {
      left: minX / scanWidth,
      top: minY / scanHeight,
      right: (maxX + 1) / scanWidth,
      bottom: (maxY + 1) / scanHeight,
    };
  } catch {
    return FULL_CONTENT_BOUNDS;
  }
}

/**
 * Visible pixel bounds of an avatar, normalized to 0..1. Tachie PNGs often
 * carry transparent margins (especially after background removal); using this
 * rectangle for layout keeps outlines, hit testing and scaling tight around the
 * character instead of the raw image canvas.
 */
export function getImageContentBounds(
  img?: HTMLImageElement | null
): ImageContentBounds {
  if (!img || !img.naturalWidth || !img.naturalHeight) return FULL_CONTENT_BOUNDS;
  const cached = contentBoundsCache.get(img);
  if (cached) return cached;
  const bounds = measureImageContentBounds(img);
  contentBoundsCache.set(img, bounds);
  return bounds;
}

export function getCachedImage(src?: string | null): HTMLImageElement | null {
  if (!src) return null;
  const img = cache.get(src);
  return img && img.complete && img.naturalWidth > 0 ? img : null;
}

export async function loadImage(src?: string | null): Promise<HTMLImageElement | null> {
  if (!src) return null;
  const cached = getCachedImage(src);
  if (cached) return cached;
  const pending = loading.get(src);
  if (pending) return pending;

  const promise = (async () => {
    try {
      const resolved = await resolveImageToDataUrl(src);
      return await new Promise<HTMLImageElement | null>((resolve) => {
        const img = new Image();
        img.onload = () => {
          if (img.naturalWidth > 0) {
            cache.set(src, img);
            resolve(img);
          } else {
            resolve(null);
          }
        };
        img.onerror = () => resolve(null);
        // キャッシュバスティング: /characters/ 等のローカルアセットを常に最新取得
        const sep = resolved.includes('?') ? '&' : '?';
        img.src = resolved.startsWith('data:') ? resolved : `${resolved}${sep}t=${Date.now()}`;
      });
    } catch {
      return null;
    } finally {
      loading.delete(src);
    }
  })();

  loading.set(src, promise);
  return promise;
}

export function collectCharacterImageSources(characters: {
  avatar: {
    idle?: string;
    speaking?: string;
    blinking?: string;
    expressions?: Record<string, string>;
  };
}[]): string[] {
  const sources = new Set<string>();
  characters.forEach((char) => {
    if (char.avatar.idle) sources.add(char.avatar.idle);
    if (char.avatar.speaking) sources.add(char.avatar.speaking);
    if (char.avatar.blinking) sources.add(char.avatar.blinking);
    Object.values(char.avatar.expressions || {}).forEach((src) => src && sources.add(src));
  });
  return Array.from(sources);
}

export function clearImageCache(): void {
  cache.clear();
  loading.clear();
  clearResolvedImageCache();
}

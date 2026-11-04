import { resolveImageToDataUrl } from '../utils/imageUtils';

const cache = new Map<string, HTMLImageElement>();
const loading = new Map<string, Promise<HTMLImageElement | null>>();

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
        img.src = resolved;
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
}

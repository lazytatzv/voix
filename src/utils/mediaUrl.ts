import { convertFileSrc } from '@tauri-apps/api/core';
import { isTauriRuntime } from '../services/audioCache';

// WebKitGTK's media player cannot stream Tauri's custom `asset:` scheme, so
// <video>/<audio> elements fail with MEDIA_ERR_SRC_NOT_SUPPORTED. Fetching the
// asset through the webview and handing the element a blob: URL works. Cache
// one blob URL per source to avoid re-downloading on every re-render.
const cache = new Map<string, Promise<string>>();

export function mediaUrlFor(src: string): Promise<string> {
  if (!src) return Promise.resolve('');
  const cached = cache.get(src);
  if (cached) return cached;

  const promise = (async () => {
    if (!isTauriRuntime()) return src;
    if (src.startsWith('blob:') || src.startsWith('data:')) return src;

    const assetUrl =
      src.startsWith('asset://') || src.startsWith('http://') || src.startsWith('https://')
        ? src
        : convertFileSrc(src);

    try {
      const response = await fetch(assetUrl);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      if (blob.size === 0) throw new Error('empty media file');
      return URL.createObjectURL(blob);
    } catch (err) {
      console.warn('[mediaUrl] failed to load media, using asset URL:', err);
      return assetUrl;
    }
  })();

  cache.set(src, promise);
  return promise;
}

import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import { isTauriRuntime } from '../services/audioCache';
import { soundEffectManager } from './soundEffects';

// WebKitGTK cannot stream Tauri's custom `asset:` scheme, so <video>/<audio>
// elements fail with MEDIA_ERR_SRC_NOT_SUPPORTED. Previously we downloaded the
// whole file into a Blob, which kept entire videos in memory and made large
// projects unresponsive. Local files are now served by a loopback HTTP server
// on the Rust side that supports Range requests, so the media engine streams
// only what it needs. One URL per source; the Rust side keeps the mapping, so
// these entries stay tiny for the lifetime of the app.
const cache = new Map<string, Promise<string>>();

function pathFromLocalUrl(src: string): string | null {
  if (src.startsWith('file://')) {
    try {
      const decoded = decodeURIComponent(new URL(src).pathname);
      // file:///C:/... becomes /C:/...; Windows paths must lose the slash.
      return /^\/[A-Za-z]:[\\/]/.test(decoded) ? decoded.slice(1) : decoded;
    } catch {
      return src.slice('file://'.length);
    }
  }

  if (src.startsWith('asset://') || /^https?:\/\/asset\.localhost\//i.test(src)) {
    try {
      const url = new URL(src);
      const decoded = decodeURIComponent(url.pathname);
      if (!decoded) return null;
      if (/^[A-Za-z]:[\\/]/.test(decoded)) return decoded;
      return `/${decoded.replace(/^\/+/, '')}`;
    } catch {
      return null;
    }
  }

  if (/^(https?:|blob:|data:)/i.test(src)) return null;
  return src;
}

async function resolveMediaUrl(src: string): Promise<string> {
  if (src.startsWith('se:')) {
    const blob = await soundEffectManager.renderWavBlob(src.slice(3));
    if (blob) {
      return URL.createObjectURL(blob);
    }
  }
  if (!isTauriRuntime()) return src;
  if (/^(blob:|data:)/i.test(src)) return src;
  if (/^https?:\/\//i.test(src) && !/^https?:\/\/asset\.localhost\//i.test(src)) {
    return src;
  }

  const path = pathFromLocalUrl(src);
  if (path) {
    try {
      const url = await invoke<string>('media_stream_url', { path });
      if (url) return url;
    } catch (err) {
      console.warn('[mediaUrl] streaming server unavailable:', err);
    }
    // Do not fall back to a whole-file Blob: that defeats streaming and can
    // pin gigabytes of video in the web process. The asset URL may fail to
    // play in WebKitGTK, but it cannot exhaust memory.
    return convertFileSrc(path);
  }

  return src;
}

export function mediaUrlFor(src: string): Promise<string> {
  if (!src) return Promise.resolve('');
  const cached = cache.get(src);
  if (cached) return cached;

  const promise = resolveMediaUrl(src).catch((err) => {
    cache.delete(src);
    throw err;
  });
  cache.set(src, promise);
  return promise;
}

/** Drop a cached URL, e.g. after a decode error or a reload request. */
export function forgetMediaUrl(src: string): void {
  cache.delete(src);
}

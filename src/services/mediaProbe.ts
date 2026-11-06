import { invoke } from '@tauri-apps/api/core';
import { isTauriRuntime } from './audioCache';

/** Metadata resolved by ffprobe before WebKitGTK opens the media file. */
export interface MediaInfo {
  duration: number;
  width: number;
  height: number;
  fps: number;
  hasAudio: boolean;
  videoCodec: string;
  audioCodec: string;
  sizeBytes: number;
  formatName: string;
}

const cache = new Map<string, Promise<MediaInfo | null>>();

/**
 * Probe a local video/audio file. The result is cached per canonical path so
 * seeking, autosave restoration and the export dialog all share one ffprobe
 * call. Failures resolve to `null`: the webview may still decode the file.
 */
export function probeMedia(path: string): Promise<MediaInfo | null> {
  if (!path || !isTauriRuntime()) return Promise.resolve(null);
  const cached = cache.get(path);
  if (cached) return cached;

  const promise = invoke<MediaInfo>('probe_media', { path })
    .then((info) => {
      if (!info || !Number.isFinite(info.duration)) return null;
      return info;
    })
    .catch((err) => {
      console.warn('[mediaProbe] probe failed:', path, err);
      return null;
    });
  cache.set(path, promise);
  return promise;
}

export function clearMediaProbeCache(): void {
  cache.clear();
}

/** Forget a single failed probe so the Retry button can run ffprobe again. */
export function forgetMediaProbe(path: string): void {
  cache.delete(path);
}

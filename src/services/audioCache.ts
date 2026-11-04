import { invoke } from '@tauri-apps/api/core';

/**
 * Persistent WAV cache under $XDG_CACHE_HOME/voix/audio.
 * Keeping synthesized audio on disk makes project reload instant and
 * lets the export pipeline use the exact same PCM data as preview.
 */

const memoryCache = new Map<string, { blob: Blob; url: string; duration: number }>();

export function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result || ''));
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export async function base64ToBlob(base64: string, mime = 'audio/wav'): Promise<Blob> {
  const clean = base64.includes('base64,') ? base64.split('base64,')[1] : base64;
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

export async function measureAudioDuration(blob: Blob): Promise<number> {
  try {
    const arrayBuffer = await blob.arrayBuffer();
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioCtx();
    const decoded = await ctx.decodeAudioData(arrayBuffer.slice(0));
    const duration = decoded.duration;
    await ctx.close();
    return duration;
  } catch {
    return 0;
  }
}

export async function saveCachedAudio(key: string, blob: Blob): Promise<void> {
  if (!isTauriRuntime() || !key || blob.size === 0) return;
  try {
    const base64 = await blobToBase64(blob);
    await invoke('save_audio_cache', { key, dataBase64: base64 });
  } catch (err) {
    console.warn('[audioCache] save failed:', err);
  }
}

export async function loadCachedAudio(
  key: string
): Promise<{ blob: Blob; url: string; duration: number } | null> {
  if (!key) return null;
  const inMemory = memoryCache.get(key);
  if (inMemory) return inMemory;
  if (!isTauriRuntime()) return null;

  try {
    const base64 = await invoke<string | null>('load_audio_cache', { key });
    if (!base64) return null;
    const blob = await base64ToBlob(base64);
    const duration = await measureAudioDuration(blob);
    const url = URL.createObjectURL(blob);
    const entry = { blob, url, duration };
    memoryCache.set(key, entry);
    return entry;
  } catch (err) {
    console.warn('[audioCache] load failed:', err);
    return null;
  }
}

export function rememberCachedAudio(
  key: string,
  entry: { blob: Blob; url: string; duration: number }
): void {
  if (key) memoryCache.set(key, entry);
}

export async function clearAudioCache(): Promise<void> {
  memoryCache.clear();
  if (!isTauriRuntime()) return;
  try {
    await invoke('clear_audio_cache');
  } catch (err) {
    console.warn('[audioCache] clear failed:', err);
  }
}

export async function loadAudioFileAsBlob(path: string): Promise<{ blob: Blob; url: string } | null> {
  if (!isTauriRuntime()) return null;
  try {
    const base64 = await invoke<string>('read_binary_base64', { path });
    const ext = path.split('.').pop()?.toLowerCase() || 'wav';
    const mime =
      ext === 'mp3' ? 'audio/mpeg' : ext === 'ogg' ? 'audio/ogg' : ext === 'flac' ? 'audio/flac' : 'audio/wav';
    const blob = await base64ToBlob(base64, mime);
    return { blob, url: URL.createObjectURL(blob) };
  } catch (err) {
    console.warn('[audioCache] read audio file failed:', err);
    return null;
  }
}

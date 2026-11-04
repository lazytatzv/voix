import { isTauriRuntime, loadAudioFileAsBlob } from './audioCache';
import { toAssetUrl } from '../utils/imageUtils';

/**
 * Lightweight peak extraction for timeline clips. Decoding is intentionally
 * lazy: only clips that are actually rendered in the timeline request a
 * waveform, and the result is cached by the stable audio key.
 */

const DEFAULT_BUCKETS = 220;
const peakCache = new Map<string, number[]>();
const inFlight = new Map<string, Promise<number[]>>();
let sharedContext: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!sharedContext) {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    sharedContext = new AudioCtx();
  }
  return sharedContext;
}

async function readAudioBlob(src: string, blob?: Blob): Promise<Blob | null> {
  if (blob && blob.size > 0) return blob;
  if (!src) return null;

  if (src.startsWith('data:') || src.startsWith('blob:')) {
    try {
      return await (await fetch(src)).blob();
    } catch {
      return null;
    }
  }

  if (isTauriRuntime()) {
    const loaded = await loadAudioFileAsBlob(src);
    if (loaded) return loaded.blob;
  }

  try {
    return await (await fetch(toAssetUrl(src))).blob();
  } catch {
    return null;
  }
}

async function extractPeaks(blob: Blob, buckets: number): Promise<number[]> {
  const ctx = getAudioContext();
  const arrayBuffer = await blob.arrayBuffer();
  const decoded = await ctx.decodeAudioData(arrayBuffer.slice(0));
  const channelCount = Math.max(1, decoded.numberOfChannels);
  const length = decoded.length;
  if (length === 0) return [];

  const channels: Float32Array[] = [];
  for (let channel = 0; channel < channelCount; channel++) {
    channels.push(decoded.getChannelData(channel));
  }

  const peaks: number[] = [];
  let maxPeak = 0;
  const samplesPerBucket = Math.max(1, Math.floor(length / buckets));
  for (let bucket = 0; bucket < buckets; bucket++) {
    const start = bucket * samplesPerBucket;
    const end = bucket === buckets - 1 ? length : Math.min(length, start + samplesPerBucket);
    let peak = 0;
    for (let i = start; i < end; i += 2) {
      for (let channel = 0; channel < channelCount; channel++) {
        const value = Math.abs(channels[channel][i] || 0);
        if (value > peak) peak = value;
      }
    }
    peaks.push(peak);
    if (peak > maxPeak) maxPeak = peak;
  }

  if (maxPeak > 0) {
    for (let i = 0; i < peaks.length; i++) {
      peaks[i] = Math.min(1, peaks[i] / maxPeak);
    }
  }
  return peaks;
}

export async function getWaveformPeaks(
  cacheKey: string,
  src: string,
  blob?: Blob,
  buckets = DEFAULT_BUCKETS
): Promise<number[]> {
  const key = `${cacheKey}:${buckets}`;
  const cached = peakCache.get(key);
  if (cached) return cached;
  const pending = inFlight.get(key);
  if (pending) return pending;

  const task = (async () => {
    const audio = await readAudioBlob(src, blob);
    if (!audio) return [];
    try {
      const peaks = await extractPeaks(audio, buckets);
      peakCache.set(key, peaks);
      return peaks;
    } catch (err) {
      console.warn('[waveform] decode failed:', err);
      peakCache.set(key, []);
      return [];
    } finally {
      inFlight.delete(key);
    }
  })();

  inFlight.set(key, task);
  return task;
}

export function clearWaveformCache(): void {
  peakCache.clear();
  inFlight.clear();
}

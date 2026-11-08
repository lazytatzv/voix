import { invoke } from '@tauri-apps/api/core';
import {
  AudioItem,
  Character,
  ExportSettings,
  TimelineItem,
  VoiceItem,
  VoixProject,
} from '../types';
import { drawOverlayFrame } from '../render/overlayRenderer';
import { collectCharacterImageSources, loadImage } from '../render/imageCache';
import { ttsManager } from './tts/TTSManager';
import {
  blobToBase64,
  base64ToBlob,
  isTauriRuntime,
  loadAudioFileAsBlob,
  loadCachedAudio,
  measureAudioDuration,
} from './audioCache';
import { makeCacheKey } from '../utils/hash';
import { getSubtitleDisplayText } from '../utils/pronunciation';
import { collectVoiceIntervals } from '../utils/audioDucking';
import { buildVoiceTtsOptions } from './tts/voiceParams';
import { isTrackMuted, isTrackVisible } from '../utils/tracks';

export { blobToBase64 };

export interface ExportProgressEvent {
  phase: 'preparing' | 'rendering' | 'encoding' | 'done' | 'error' | 'cancelled';
  percent: number;
  message: string;
}

export interface ExecuteExportOptions {
  project: VoixProject;
  settings: ExportSettings;
  outputPath: string;
  backgroundPath?: string | null;
  /** Optional background audio; uses the project video volume by default. */
  backgroundVolume?: number;
  /** Render terminal-style overlay boxes for voice items with terminal data. */
  showTerminal?: boolean;
  /** Export only this portion of the timeline, in seconds. */
  startTime?: number;
  endTime?: number;
  /** Abort long frame renders. The Rust export job is cleaned up via cancelActiveExport. */
  signal?: AbortSignal;
  onProgress?: (event: ExportProgressEvent) => void;
}

interface DuckingPayload {
  level: number;
  attack: number;
  release: number;
  /** Voice spans in seconds, relative to the start of this audio clip. */
  intervals: Array<[number, number]>;
}

interface AudioClipPayload {
  path: string;
  start: number;
  duration: number;
  volume: number;
  /** Seconds trimmed from the source before the clip is placed. */
  offset: number;
  /** Playback rate applied to the source before mixing. */
  speed: number;
  loop_audio: boolean;
  fade_in: number;
  fade_out: number;
  /** Applied only to BGM clips while voice lines are audible. */
  ducking?: DuckingPayload;
}

interface StreamExportPayload {
  job_dir: string;
  output_path: string;
  background_path: string | null;
  background_color: string;
  width: number;
  height: number;
  fps: number;
  overlay_fps: number;
  duration: number;
  start_time: number;
  crf: number;
  preset: string;
  background_volume: number;
  video_offset: number;
  video_speed: number;
  video_fit: string;
  audio_clips: AudioClipPayload[];
}

function canvasToPngBytes(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Could not encode overlay frame as PNG.'));
        return;
      }
      blob
        .arrayBuffer()
        .then((buffer) => resolve(new Uint8Array(buffer)))
        .catch(reject);
    }, 'image/png');
  });
}

/** Rust-side temporary directory for the export currently in flight. */
let activeJobDir: string | null = null;
let activeOutputPath: string | null = null;

/**
 * Cancel the in-flight export. Safe to call from a UI cancel button: the
 * Rust command also stops FFmpeg and removes the partially written output.
 */
export async function cancelActiveExport(): Promise<void> {
  const jobDir = activeJobDir;
  const outputPath = activeOutputPath;
  if (!jobDir) return;
  activeJobDir = null;
  activeOutputPath = null;
  try {
    await invoke('cancel_export_job', { jobDir, outputPath });
  } catch (err) {
    console.warn('[export] cancel failed:', err);
  }
}

async function writeJobAudio(jobDir: string, name: string, base64: string): Promise<string> {
  const safeName = name.replace(/[^a-zA-Z0-9_.-]+/g, '_');
  const path = `${jobDir}/${safeName}`;
  await invoke('write_binary_file', { path, dataBase64: base64 });
  return path;
}

async function sourceToWavPath(
  jobDir: string,
  src: string,
  index: number,
  audioBlob?: Blob
): Promise<string | null> {
  if (audioBlob && audioBlob.size > 0) {
    return writeJobAudio(jobDir, `clip_${index}.wav`, await blobToBase64(audioBlob));
  }
  if (!src) return null;

  if (src.startsWith('data:')) {
    const mime = src.slice(5, src.indexOf(';')) || 'audio/wav';
    const ext = mime.includes('mpeg') ? 'mp3' : mime.includes('ogg') ? 'ogg' : mime.includes('flac') ? 'flac' : 'wav';
    return writeJobAudio(jobDir, `clip_${index}.${ext}`, src);
  }
  if (src.startsWith('blob:') || src.startsWith('http://') || src.startsWith('https://')) {
    const response = await fetch(src);
    const blob = await response.blob();
    const ext = blob.type.includes('mpeg') ? 'mp3' : blob.type.includes('ogg') ? 'ogg' : 'wav';
    return writeJobAudio(jobDir, `clip_${index}.${ext}`, await blobToBase64(blob));
  }
  // Local path: FFmpeg reads it directly.
  return src;
}

async function ensureVoiceWavPath(
  item: VoiceItem,
  characters: Character[],
  index: number
): Promise<string | null> {
  let blob = item.audioBlob;
  let key = item.audioKey;
  const character = characters.find((c) => c.id === item.characterId) || characters[0];

  // Ignore cache entries synthesized with different tuning parameters. Older
  // projects in particular could have the voice volume baked into the WAV.
  if (key && character) {
    const expectedKey = ttsManager.getCacheKey(
      character.ttsProviderId,
      character.speakerId,
      item.text,
      buildVoiceTtsOptions(item)
    );
    if (key !== expectedKey) key = undefined;
  }

  if (!blob && key) {
    const cached = await loadCachedAudio(key);
    if (cached) blob = cached.blob;
  }

  if (!blob) {
    if (!character) return null;
    const result = await ttsManager.synthesize(
      character.ttsProviderId,
      character.speakerId,
      item.text,
      buildVoiceTtsOptions(item)
    );
    blob = result.audioBlob;
    key = result.audioKey;
  }

  if (!blob) return null;
  key = key || makeCacheKey(['export', item.characterId, item.text, item.startTime, index]);
  return await invoke<string>('save_audio_cache', {
    key,
    dataBase64: await blobToBase64(blob),
  });
}

function audioItemsOf(items: TimelineItem[]): AudioItem[] {
  return items.filter(
    (item): item is AudioItem => item.type === 'audio' && !item.hidden && Boolean(item.src)
  );
}

export async function executeExportVideo(options: ExecuteExportOptions): Promise<string> {
  if (!isTauriRuntime()) {
    throw new Error('Video export requires the Tauri desktop app (FFmpeg backend).');
  }

  const { project, settings, outputPath } = options;
  const timelineDuration = Math.max(0.5, project.timeline.duration);
  const exportStart = Math.max(0, Math.min(timelineDuration - 0.5, options.startTime ?? 0));
  const exportEnd = Math.max(
    exportStart + 0.5,
    Math.min(timelineDuration, options.endTime ?? timelineDuration)
  );
  const duration = exportEnd - exportStart;
  const width = Math.max(2, settings.width);
  const height = Math.max(2, settings.height);
  const fps = settings.fps;
  const overlayFps = Math.max(1, Math.min(settings.overlayFps || 15, 60));
  const report = (event: ExportProgressEvent) => options.onProgress?.(event);

  report({ phase: 'preparing', percent: 0, message: 'Preparing assets...' });

  const throwIfAborted = () => {
    if (options.signal?.aborted) {
      const error = new Error('Export cancelled');
      error.name = 'AbortError';
      throw error;
    }
  };

  throwIfAborted();
  const jobDir = await invoke<string>('begin_export_job');
  activeJobDir = jobDir;
  activeOutputPath = outputPath;
  try {
    // 1. Preload all images used by the compositor.
    const imageSources = collectCharacterImageSources(project.characters);
    project.items.forEach((item) => {
      if (item.type === 'image' && item.src) imageSources.push(item.src);
    });
    await Promise.all(imageSources.map((src) => loadImage(src)));

    // 2. Collect audio clips (voice + BGM/SE).
    const audioClips: AudioClipPayload[] = [];
    const voiceMuted = isTrackMuted(project.tracks, 'voice');
    const musicMuted = isTrackMuted(project.tracks, 'audio');
    const videoMuted = isTrackMuted(project.tracks, 'video');
    const videoHidden = !isTrackVisible(project.tracks, 'video');
    const duckingSettings = project.timeline.ducking;
    const voiceIntervals =
      duckingSettings?.enabled && !voiceMuted
        ? collectVoiceIntervals(project.items, {
            start: exportStart,
            end: exportEnd,
            minGap: duckingSettings.release,
            voiceMuted,
          })
        : [];

    if (!voiceMuted) {
      const voices = project.items.filter(
        (item): item is VoiceItem => item.type === 'voice' && !item.hidden && item.text.trim().length > 0
      );
      for (let i = 0; i < voices.length; i++) {
        throwIfAborted();
        const item = voices[i];
        report({
          phase: 'preparing',
          percent: Math.min(20, (i / Math.max(1, voices.length)) * 20),
          message: `Preparing voice ${i + 1}/${voices.length}`,
        });
        try {
          const path = await ensureVoiceWavPath(item, project.characters, i);
          if (!path) continue;
          const clipStart = Math.max(item.startTime, exportStart);
          const clipEnd = Math.min(item.startTime + item.duration, exportEnd);
          if (clipEnd - clipStart < 0.02) continue;
          const clipDuration = clipEnd - clipStart;
          audioClips.push({
            path,
            start: clipStart - exportStart,
            duration: clipDuration,
            volume: Math.max(0, item.volumeScale ?? 1),
            offset: Math.max(0, clipStart - item.startTime),
            speed: 1,
            loop_audio: false,
            fade_in:
              item.startTime >= exportStart
                ? Math.min(clipDuration, Math.max(0, item.fadeIn ?? 0))
                : 0,
            fade_out:
              item.startTime + item.duration <= exportEnd
                ? Math.min(clipDuration, Math.max(0, item.fadeOut ?? 0))
                : 0,
          });
        } catch (err) {
          console.warn('[export] voice preparation failed:', item.text, err);
        }
      }
    }

    if (!musicMuted) {
      const audios = audioItemsOf(project.items);
      for (let i = 0; i < audios.length; i++) {
        throwIfAborted();
        const item = audios[i];
        try {
          const path = await sourceToWavPath(jobDir, item.src, 1000 + i, item.audioBlob);
          if (!path) continue;
          const clipStart = Math.max(item.startTime, exportStart);
          const clipEnd = Math.min(item.startTime + item.duration, exportEnd);
          if (clipEnd - clipStart < 0.02) continue;
          const itemEnd = item.startTime + item.duration;
          const clipDuration = clipEnd - clipStart;
          const ducking =
            item.isBgm && duckingSettings?.enabled && voiceIntervals.length > 0
              ? {
                  level: duckingSettings.level,
                  attack: duckingSettings.attack,
                  release: duckingSettings.release,
                  intervals: voiceIntervals
                    .map(
                      (interval) =>
                        [
                          Math.max(0, interval.start - clipStart),
                          Math.max(0, interval.end - clipStart),
                        ] as [number, number]
                    )
                    .filter(([intervalStart, intervalEnd]) => intervalEnd > intervalStart)
                    .filter(([intervalStart]) => intervalStart < clipDuration),
                }
              : undefined;
          audioClips.push({
            path,
            start: clipStart - exportStart,
            duration: clipDuration,
            volume: Math.max(0, item.volume ?? 1),
            offset:
              Math.max(0, item.offset ?? 0) +
              (clipStart - item.startTime) * Math.max(0.25, Math.min(4, item.speed ?? 1)),
            speed: Math.max(0.25, Math.min(4, item.speed ?? 1)),
            loop_audio: Boolean(item.loop),
            fade_in: item.startTime >= exportStart ? Math.max(0, item.fadeIn ?? 0) : 0,
            fade_out: itemEnd <= exportEnd ? Math.max(0, item.fadeOut ?? 0) : 0,
            ...(ducking && ducking.intervals.length > 0 ? { ducking } : {}),
          });
        } catch (err) {
          console.warn('[export] audio preparation failed:', item.src, err);
        }
      }
    }

    // 3. Start FFmpeg first, then stream transparent overlay frames into its
    // stdin. This avoids keeping thousands of PNG files in the temp directory
    // and lets long exports start encoding immediately.
    const payload: StreamExportPayload = {
      job_dir: jobDir,
      output_path: outputPath,
      background_path: videoHidden ? null : options.backgroundPath || null,
      background_color: project.timeline.backgroundColor || '#0f0f11',
      width,
      height,
      fps,
      overlay_fps: overlayFps,
      duration,
      start_time: exportStart,
      crf: settings.crf,
      preset: settings.preset,
      background_volume: videoMuted || videoHidden
        ? 0
        : options.backgroundVolume ?? project.timeline.videoVolume ?? 1,
      video_offset: Math.max(0, project.timeline.videoOffset ?? 0),
      video_speed: Math.max(0.25, Math.min(4, project.timeline.videoSpeed ?? 1)),
      video_fit: project.timeline.videoFit ?? 'contain',
      audio_clips: audioClips,
    };
    await invoke('begin_stream_export', { payload });

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) throw new Error('Could not create an offscreen canvas context.');

    const totalFrames = Math.max(1, Math.ceil(duration * overlayFps));
    for (let frame = 0; frame < totalFrames; frame++) {
      throwIfAborted();
      const time = Math.min(exportEnd - 0.0001, exportStart + frame / overlayFps);
      drawOverlayFrame(ctx, {
        width,
        height,
        time,
        characters: project.characters,
        items: project.items,
        tracks: project.tracks,
        isPlaying: true,
        showTerminal: options.showTerminal !== false,
        showSafeArea: false,
      });
      const png = await canvasToPngBytes(canvas);
      await invoke('write_export_frame_raw', png);
      if (frame % 4 === 0 || frame === totalFrames - 1) {
        report({
          phase: 'rendering',
          percent: 20 + ((frame + 1) / totalFrames) * 45,
          message: `Rendering overlay ${frame + 1}/${totalFrames}`,
        });
      }
    }

    report({ phase: 'encoding', percent: 65, message: 'Finalizing FFmpeg encode...' });
    throwIfAborted();

    const result = await invoke<string>('finish_stream_export', {
      jobDir,
      outputPath,
    });
    activeJobDir = null;
    activeOutputPath = null;
    report({ phase: 'done', percent: 100, message: 'Export complete' });
    return result;
  } catch (err) {
    const aborted = options.signal?.aborted || (err instanceof Error && err.name === 'AbortError');
    if (activeJobDir) {
      await cancelActiveExport();
    } else {
      activeOutputPath = null;
    }
    if (aborted) {
      report({ phase: 'cancelled', percent: 0, message: 'Export cancelled' });
    } else {
      report({ phase: 'error', percent: 0, message: String(err) });
    }
    throw err;
  }
}

/**
 * Legacy export entry point kept for scripts that still call it.
 * New code should use executeExportVideo with a full VoixProject.
 */
export async function executeLegacyExportVideo(_params: {
  videoPath?: string;
  outputPath: string;
  clips: VoiceItem[];
  totalDuration: number;
}): Promise<string> {
  throw new Error(
    'executeLegacyExportVideo is no longer supported. Use ExportModal / executeExportVideo instead.'
  );
}

export async function detectSpeechFromVideo(videoPath: string): Promise<{ start: number; end: number }[]> {
  try {
    return await invoke<{ start: number; end: number }[]>('detect_speech_segments', {
      videoPath,
    });
  } catch (err) {
    console.warn('Speech detection fallback:', err);
    return [
      { start: 0.5, end: 3.5 },
      { start: 4.2, end: 7.0 },
    ];
  }
}

/** Helper used by the media pickers to determine an imported clip's length. */
export async function measureImportedAudio(path: string): Promise<number> {
  const loaded = await loadAudioFileAsBlob(path);
  if (loaded) {
    const duration = await measureAudioDuration(loaded.blob);
    if (duration > 0) return duration;
  }
  // Fallback: decode a raw data URL if the path is already a blob.
  if (path.startsWith('data:')) {
    const blob = await base64ToBlob(path);
    return await measureAudioDuration(blob);
  }
  return 3;
}

export function subtitleOf(item: VoiceItem): string {
  return getSubtitleDisplayText(item.subtitleText || item.text);
}

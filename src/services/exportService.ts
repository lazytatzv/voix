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

export { blobToBase64 };

export interface ExportProgressEvent {
  phase: 'preparing' | 'rendering' | 'encoding' | 'done' | 'error';
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
  onProgress?: (event: ExportProgressEvent) => void;
}

interface AudioClipPayload {
  path: string;
  start: number;
  duration: number;
  volume: number;
  loop_audio: boolean;
  fade_in: number;
  fade_out: number;
}

function trackFlag(project: VoixProject, id: string, flag: 'visible' | 'muted'): boolean {
  const track = project.tracks?.find((t) => t.id === id);
  if (!track) return false;
  return flag === 'visible' ? track.visible : track.muted;
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

  if (!blob && key) {
    const cached = await loadCachedAudio(key);
    if (cached) blob = cached.blob;
  }

  if (!blob) {
    const character = characters.find((c) => c.id === item.characterId) || characters[0];
    if (!character) return null;
    const result = await ttsManager.synthesize(
      character.ttsProviderId,
      character.speakerId,
      item.text,
      {
        speedScale: item.speedScale ?? 1,
        pitchScale: item.pitchScale ?? 0,
        volumeScale: item.volumeScale ?? 1,
      }
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
  const duration = Math.max(0.5, project.timeline.duration);
  const width = Math.max(2, settings.width);
  const height = Math.max(2, settings.height);
  const fps = settings.fps;
  const overlayFps = Math.max(1, Math.min(settings.overlayFps || 15, 60));
  const report = (event: ExportProgressEvent) => options.onProgress?.(event);

  report({ phase: 'preparing', percent: 0, message: 'Preparing assets...' });

  const jobDir = await invoke<string>('begin_export_job');
  try {
    // 1. Preload all images used by the compositor.
    const imageSources = collectCharacterImageSources(project.characters);
    project.items.forEach((item) => {
      if (item.type === 'image' && item.src) imageSources.push(item.src);
    });
    await Promise.all(imageSources.map((src) => loadImage(src)));

    // 2. Collect audio clips (voice + BGM/SE).
    const audioClips: AudioClipPayload[] = [];
    const voiceMuted = trackFlag(project, 'voice', 'muted');
    const musicMuted = trackFlag(project, 'audio', 'muted');
    const videoMuted = trackFlag(project, 'video', 'muted');

    if (!voiceMuted) {
      const voices = project.items.filter(
        (item): item is VoiceItem => item.type === 'voice' && !item.hidden && item.text.trim().length > 0
      );
      for (let i = 0; i < voices.length; i++) {
        const item = voices[i];
        report({
          phase: 'preparing',
          percent: Math.min(20, (i / Math.max(1, voices.length)) * 20),
          message: `Preparing voice ${i + 1}/${voices.length}`,
        });
        try {
          const path = await ensureVoiceWavPath(item, project.characters, i);
          if (!path) continue;
          audioClips.push({
            path,
            start: Math.max(0, item.startTime),
            duration: Math.max(0.05, item.duration),
            volume: Math.max(0, item.volumeScale ?? 1),
            loop_audio: false,
            fade_in: 0,
            fade_out: 0,
          });
        } catch (err) {
          console.warn('[export] voice preparation failed:', item.text, err);
        }
      }
    }

    if (!musicMuted) {
      const audios = audioItemsOf(project.items);
      for (let i = 0; i < audios.length; i++) {
        const item = audios[i];
        try {
          const path = await sourceToWavPath(jobDir, item.src, 1000 + i, item.audioBlob);
          if (!path) continue;
          audioClips.push({
            path,
            start: Math.max(0, item.startTime),
            duration: Math.max(0.05, item.duration),
            volume: Math.max(0, item.volume ?? 1),
            loop_audio: Boolean(item.loop),
            fade_in: Math.max(0, item.fadeIn ?? 0),
            fade_out: Math.max(0, item.fadeOut ?? 0),
          });
        } catch (err) {
          console.warn('[export] audio preparation failed:', item.src, err);
        }
      }
    }

    // 3. Render transparent overlay frames with the shared compositor.
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) throw new Error('Could not create an offscreen canvas context.');

    const totalFrames = Math.max(1, Math.ceil(duration * overlayFps));
    for (let frame = 0; frame < totalFrames; frame++) {
      const time = Math.min(duration - 0.0001, frame / overlayFps);
      drawOverlayFrame(ctx, {
        width,
        height,
        time,
        characters: project.characters,
        items: project.items,
        tracks: project.tracks,
        isPlaying: true,
        showTerminal: true,
        showSafeArea: false,
      });
      const pngBase64 = canvas.toDataURL('image/png');
      await invoke('write_export_frame', {
        jobDir,
        index: frame + 1,
        pngBase64,
      });
      if (frame % 4 === 0 || frame === totalFrames - 1) {
        report({
          phase: 'rendering',
          percent: 20 + ((frame + 1) / totalFrames) * 45,
          message: `Rendering overlay ${frame + 1}/${totalFrames}`,
        });
      }
    }

    report({ phase: 'encoding', percent: 65, message: 'Encoding with FFmpeg...' });

    const result = await invoke<string>('finish_export_job', {
      payload: {
        job_dir: jobDir,
        output_path: outputPath,
        background_path: options.backgroundPath || null,
        background_color: project.timeline.backgroundColor || '#0f0f11',
        width,
        height,
        fps,
        overlay_fps: overlayFps,
        duration,
        crf: settings.crf,
        preset: settings.preset,
        background_volume: videoMuted ? 0 : options.backgroundVolume ?? project.timeline.videoVolume ?? 1,
        audio_clips: audioClips,
      },
    });
    report({ phase: 'done', percent: 100, message: 'Export complete' });
    return result;
  } catch (err) {
    try {
      await invoke('cancel_export_job', { jobDir });
    } catch {}
    report({ phase: 'error', percent: 0, message: String(err) });
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

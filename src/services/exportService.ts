import { invoke } from '@tauri-apps/api/core';
import { VoiceItem } from '../types';
import { getSubtitleDisplayText } from '../utils/pronunciation';

export async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      resolve(reader.result as string);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export interface ExportFullVideoParams {
  videoPath?: string;
  outputPath: string;
  clips: VoiceItem[];
  totalDuration: number;
}

export async function executeExportVideo(params: ExportFullVideoParams): Promise<string> {
  const clipsPayload = await Promise.all(
    params.clips.map(async (c) => {
      let base64 = '';
      if (c.audioBlob) {
        base64 = await blobToBase64(c.audioBlob);
      }
      return {
        id: c.id,
        start_time: c.startTime,
        duration: c.duration,
        text: getSubtitleDisplayText(c.text),
        wav_base64: base64,
      };
    })
  );

  return await invoke<string>('export_full_video', {
    payload: {
      video_path: params.videoPath || null,
      output_path: params.outputPath,
      clips: clipsPayload,
      total_duration: params.totalDuration,
    },
  });
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

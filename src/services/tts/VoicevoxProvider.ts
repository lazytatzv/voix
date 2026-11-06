import { Speaker, PhonemeTiming } from '../../types';
import { containsEnglish, convertEnglishToVoicevox } from '../../utils/englishToVoicevox';
import { getTtsSpokenText } from '../../utils/pronunciation';
import { parseSpeakerList } from './speakerUtils';

export interface TTSProvider {
  id: string;
  name: string;
  endpoint: string;
  isAvailable(): Promise<boolean>;
  getSpeakers(): Promise<Speaker[]>;
  synthesize(
    speakerId: number,
    text: string,
    options?: { speedScale?: number; pitchScale?: number }
  ): Promise<{
    audioBlob: Blob;
    duration: number;
    phonemes: PhonemeTiming[];
  }>;
}

interface VoicevoxMora {
  text: string;
  consonant?: string | null;
  consonant_length?: number | null;
  vowel: string;
  vowel_length: number;
  pitch: number;
}

interface VoicevoxAccentPhrase {
  moras: VoicevoxMora[];
  accent: number;
  pause_mora?: VoicevoxMora | null;
  is_interrogative?: boolean;
}

interface VoicevoxAudioQuery {
  accent_phrases: VoicevoxAccentPhrase[];
  speedScale: number;
  pitchScale: number;
  intonationScale: number;
  volumeScale: number;
  prePhonemeLength: number;
  postPhonemeLength: number;
  outputSamplingRate: number;
  outputStereo: boolean;
  [key: string]: unknown;
}

export class VoicevoxProvider implements TTSProvider {
  id: string;
  name: string;
  endpoint: string;

  constructor(id = 'voicevox', name = 'VOICEVOX', endpoint = 'http://localhost:50021') {
    this.id = id;
    this.name = name;
    this.endpoint = endpoint;
  }

  async isAvailable(): Promise<boolean> {
    try {
      const res = await fetch(`${this.endpoint}/version`, { signal: AbortSignal.timeout(1500) });
      return res.ok;
    } catch {
      return false;
    }
  }

  async getSpeakers(): Promise<Speaker[]> {
    try {
      const res = await fetch(`${this.endpoint}/speakers`, {
        signal: AbortSignal.timeout(4000),
      });
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      const data = await res.json();
      return parseSpeakerList(data);
    } catch (e) {
      console.warn('Failed to fetch VOICEVOX speakers:', e);
      return [];
    }
  }

  async synthesize(
    speakerId: number,
    text: string,
    options?: { speedScale?: number; pitchScale?: number }
  ): Promise<{
    audioBlob: Blob;
    duration: number;
    phonemes: PhonemeTiming[];
  }> {
    if (!text.trim()) {
      return {
        audioBlob: new Blob([], { type: 'audio/wav' }),
        duration: 0.5,
        phonemes: [],
      };
    }

    // 1. Audio Queryの作成
    // (a) 読み仮名アノテーション (例: France(フランス) -> フランス) を展開
    const spokenAnnotated = getTtsSpokenText(text);
    // (b) 英文が含まれる場合は自動で発音カタカナに変換してVOICEVOXに渡す
    const speechText = containsEnglish(spokenAnnotated) ? convertEnglishToVoicevox(spokenAnnotated) : spokenAnnotated;
    const queryUrl = new URL(`${this.endpoint}/audio_query`);
    queryUrl.searchParams.set('speaker', speakerId.toString());
    queryUrl.searchParams.set('text', speechText);

    const queryRes = await fetch(queryUrl.toString(), {
      method: 'POST',
    });
    if (!queryRes.ok) {
      throw new Error(`Audio query failed: ${queryRes.status} ${await queryRes.text()}`);
    }

    const audioQuery = (await queryRes.json()) as VoicevoxAudioQuery;

    if (options?.speedScale) audioQuery.speedScale = options.speedScale;
    if (options?.pitchScale) audioQuery.pitchScale = options.pitchScale;

    // 語尾の母音・息の減衰がプツッと切れないように十分な余韻（最低0.20s）を確保
    audioQuery.postPhonemeLength = Math.max(audioQuery.postPhonemeLength ?? 0, 0.2);
    audioQuery.prePhonemeLength = Math.max(audioQuery.prePhonemeLength ?? 0, 0.1);

    // 音素タイミング・尺を計算 (speedScale反映)
    const phonemes: PhonemeTiming[] = [];
    const speed = audioQuery.speedScale || 1.0;
    let currentTime = (audioQuery.prePhonemeLength || 0.1) / speed;

    for (const phrase of audioQuery.accent_phrases) {
      for (const mora of phrase.moras) {
        if (mora.consonant_length) {
          currentTime += mora.consonant_length / speed;
        }
        phonemes.push({
          time: currentTime,
          vowel: mora.vowel.toLowerCase(),
        });
        currentTime += mora.vowel_length / speed;
      }
      if (phrase.pause_mora) {
        currentTime += (phrase.pause_mora.vowel_length || 0) / speed;
      }
    }
    const totalEstimatedDuration = currentTime + (audioQuery.postPhonemeLength || 0.1) / speed;

    // 2. 音声合成 (WAVデータ取得)
    const synthUrl = new URL(`${this.endpoint}/synthesis`);
    synthUrl.searchParams.set('speaker', speakerId.toString());

    const synthRes = await fetch(synthUrl.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(audioQuery),
    });

    if (!synthRes.ok) {
      throw new Error(`Synthesis failed: ${synthRes.status} ${await synthRes.text()}`);
    }

    const audioBlob = await synthRes.blob();

    // 実際の音声尺を AudioContext で取得（可能なら）
    let actualDuration = totalEstimatedDuration;
    try {
      const arrayBuffer = await audioBlob.slice(0).arrayBuffer();
      const audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      const decoded = await audioCtx.decodeAudioData(arrayBuffer);
      actualDuration = decoded.duration;
      await audioCtx.close();
    } catch {
      // フォールバック
    }

    return {
      audioBlob,
      duration: Math.max(actualDuration, 0.3),
      phonemes,
    };
  }
}

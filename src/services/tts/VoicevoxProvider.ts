import { Speaker, PhonemeTiming } from '../../types';
import { containsEnglish, convertEnglishToVoicevox } from '../../utils/englishToVoicevox';
import { getTtsSpokenText } from '../../utils/pronunciation';
import { parseSpeakerList } from './speakerUtils';
import { VOICEVOX_CATALOG_SPEAKERS } from '../../utils/voicevoxCatalog';
import { COEIROINK_CATALOG_SPEAKERS } from '../../utils/coeiroinkCatalog';

export interface TTSOptions {
  speedScale?: number;
  pitchScale?: number;
  volumeScale?: number;
  intonationScale?: number;
  prePhonemeLength?: number;
  postPhonemeLength?: number;
  pauseLengthScale?: number;
}

export interface TTSProvider {
  id: string;
  name: string;
  endpoint: string;
  isAvailable(): Promise<boolean>;
  getSpeakers(): Promise<Speaker[]>;
  synthesize(
    speakerId: number,
    text: string,
    options?: TTSOptions
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
  pauseLengthScale?: number;
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
    // Probe common endpoints for VOICEVOX (/version) and COEIROINK (/v1/speakers, /docs, /version)
    const checkUrls = [
      `${this.endpoint}/version`,
      `${this.endpoint}/v1/speakers`,
      `${this.endpoint}/speakers`,
      `${this.endpoint}/docs`,
    ];
    for (const url of checkUrls) {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(1200) });
        if (res.ok) return true;
      } catch {
        // try next
      }
    }
    return false;
  }

  async getSpeakers(): Promise<Speaker[]> {
    // Support both /v1/speakers (COEIROINK v2) and /speakers (VOICEVOX / COEIROINK v1)
    const endpoints = [`${this.endpoint}/v1/speakers`, `${this.endpoint}/speakers`];
    for (const url of endpoints) {
      try {
        const res = await fetch(url, {
          signal: AbortSignal.timeout(3500),
        });
        if (res.ok) {
          const data = await res.json();
          const list = parseSpeakerList(data);
          if (list.length > 0) return list;
        }
      } catch (e) {
        // try next
      }
    }

    if (this.id === 'voicevox') {
      return VOICEVOX_CATALOG_SPEAKERS;
    }
    if (this.id === 'coeiroink') {
      return COEIROINK_CATALOG_SPEAKERS;
    }
    return [];
  }

  async synthesize(
    speakerId: number,
    text: string,
    options?: TTSOptions
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

    let audioQuery: VoicevoxAudioQuery | null = null;
    const queryUrls = [
      `${this.endpoint}/audio_query`,
      `${this.endpoint}/v1/audio_query`,
    ];

    for (const qBase of queryUrls) {
      try {
        const queryUrl = new URL(qBase);
        queryUrl.searchParams.set('speaker', speakerId.toString());
        queryUrl.searchParams.set('text', speechText);

        const queryRes = await fetch(queryUrl.toString(), {
          method: 'POST',
        });
        if (queryRes.ok) {
          audioQuery = (await queryRes.json()) as VoicevoxAudioQuery;
          break;
        }
      } catch {
        // try next
      }
    }

    if (!audioQuery) {
      throw new Error(`Audio query failed for speaker ${speakerId} on ${this.name} (${this.endpoint})`);
    }

    if (options?.speedScale !== undefined) {
      audioQuery.speedScale = Math.max(0.1, options.speedScale);
    }
    if (options?.pitchScale !== undefined) audioQuery.pitchScale = options.pitchScale;
    if (options?.intonationScale !== undefined) {
      audioQuery.intonationScale = Math.max(0, Math.min(2, options.intonationScale));
    }
    if (options?.prePhonemeLength !== undefined) {
      audioQuery.prePhonemeLength = Math.max(0, options.prePhonemeLength);
    }
    if (options?.postPhonemeLength !== undefined) {
      audioQuery.postPhonemeLength = Math.max(0, options.postPhonemeLength);
    }
    if (options?.pauseLengthScale !== undefined) {
      audioQuery.pauseLengthScale = Math.max(0.1, Math.min(3, options.pauseLengthScale));
    }

    // 語尾の母音・息の減衰がプツッと切れないように十分な余韻（最低0.20s）を確保。
    // ただしユーザーが明示的に無音区間を指定した場合はその値を尊重する。
    if (options?.postPhonemeLength === undefined) {
      audioQuery.postPhonemeLength = Math.max(audioQuery.postPhonemeLength ?? 0, 0.2);
    }
    if (options?.prePhonemeLength === undefined) {
      audioQuery.prePhonemeLength = Math.max(audioQuery.prePhonemeLength ?? 0, 0.1);
    }
    audioQuery.postPhonemeLength = Math.max(audioQuery.postPhonemeLength ?? 0, 0.01);
    audioQuery.prePhonemeLength = Math.max(audioQuery.prePhonemeLength ?? 0, 0.01);

    // 音素タイミング・尺を計算 (speedScale反映)
    const phonemes: PhonemeTiming[] = [];
    const speed = audioQuery.speedScale || 1.0;
    const pauseScale = audioQuery.pauseLengthScale ?? 1;
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
        currentTime += ((phrase.pause_mora.vowel_length || 0) * pauseScale) / speed;
      }
    }
    const totalEstimatedDuration = currentTime + (audioQuery.postPhonemeLength || 0.1) / speed;

    // 2. 音声合成 (WAVデータ取得)
    let synthRes: Response | null = null;
    const synthUrls = [
      `${this.endpoint}/synthesis`,
      `${this.endpoint}/v1/synthesis`,
    ];

    for (const sBase of synthUrls) {
      try {
        const synthUrl = new URL(sBase);
        synthUrl.searchParams.set('speaker', speakerId.toString());

        const res = await fetch(synthUrl.toString(), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(audioQuery),
        });
        if (res.ok) {
          synthRes = res;
          break;
        }
      } catch {
        // try next
      }
    }

    if (!synthRes) {
      throw new Error(`Synthesis failed for speaker ${speakerId} on ${this.name} (${this.endpoint})`);
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

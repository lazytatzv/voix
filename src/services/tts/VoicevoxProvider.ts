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
    // Probe common endpoints for VOICEVOX (/docs, /version) and COEIROINK (/docs, /v1/speakers)
    const checkUrls = [
      `${this.endpoint}/docs`,
      `${this.endpoint}/version`,
      `${this.endpoint}/v1/speakers`,
      `${this.endpoint}/speakers`,
    ];
    for (const url of checkUrls) {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(2500) });
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

    if (this.id === 'coeiroink') {
      return this.synthesizeCoeiroink(speakerId, speechText, options);
    }

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

  /**
   * COEIROINK v2 synthesis handler.
   * COEIROINK v2 does not use /audio_query; instead it accepts a direct
   * POST /v1/synthesis request with SynthesisParam (speakerUuid, styleId, text, etc.).
   */
  private async synthesizeCoeiroink(
    speakerId: number,
    text: string,
    options?: TTSOptions
  ): Promise<{
    audioBlob: Blob;
    duration: number;
    phonemes: PhonemeTiming[];
  }> {
    // 1. Resolve speakerUuid from styleId
    let speakerUuid: string | undefined;
    try {
      const metaRes = await fetch(
        `${this.endpoint}/v1/style_id_to_speaker_meta?styleId=${speakerId}`,
        {
          method: 'POST',
          signal: AbortSignal.timeout(2000),
        }
      );
      if (metaRes.ok) {
        const meta = (await metaRes.json()) as { speakerUuid?: string };
        if (meta.speakerUuid) {
          speakerUuid = meta.speakerUuid;
        }
      }
    } catch {
      // ignore
    }

    if (!speakerUuid) {
      for (const cat of COEIROINK_CATALOG_SPEAKERS) {
        if (cat.styles.some((s) => s.id === speakerId)) {
          speakerUuid = cat.id;
          break;
        }
      }
    }

    if (!speakerUuid) {
      speakerUuid = '3c37646f-3881-5374-2a83-149267990abc'; // Default Tsukuyomi-chan UUID
    }

    const payload = {
      speakerUuid,
      styleId: speakerId,
      text,
      speedScale: Math.max(0.1, options?.speedScale ?? 1.0),
      volumeScale: Math.max(0.0, options?.volumeScale ?? 1.0),
      pitchScale: options?.pitchScale ?? 0.0,
      intonationScale: Math.max(0.0, options?.intonationScale ?? 1.0),
      prePhonemeLength: Math.max(0.0, options?.prePhonemeLength ?? 0.1),
      postPhonemeLength: Math.max(0.01, options?.postPhonemeLength ?? 0.2),
      outputSamplingRate: 24000,
    };

    const synthRes = await fetch(`${this.endpoint}/v1/synthesis`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!synthRes.ok) {
      throw new Error(
        `COEIROINK synthesis failed with status ${synthRes.status} for style ${speakerId}`
      );
    }

    const audioBlob = await synthRes.blob();
    let actualDuration = 1.0;

    try {
      const arrayBuffer = await audioBlob.slice(0).arrayBuffer();
      if (arrayBuffer.byteLength >= 44) {
        const view = new DataView(arrayBuffer);
        const byteRate = view.getUint32(28, true);
        const dataSize = view.getUint32(40, true);
        if (byteRate > 0 && dataSize > 0) {
          actualDuration = dataSize / byteRate;
        }
      }
      if (
        typeof window !== 'undefined' &&
        (window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext })
            .webkitAudioContext)
      ) {
        const audioCtx = new (window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext })
            .webkitAudioContext)();
        const decoded = await audioCtx.decodeAudioData(arrayBuffer.slice(0));
        actualDuration = decoded.duration;
        await audioCtx.close();
      }
    } catch {
      // fallback
    }

    // Generate basic mouth flap timing across the duration
    const phonemes: PhonemeTiming[] = [];
    const charCount = Math.max(1, text.length);
    const step = actualDuration / (charCount + 1);
    for (let i = 0; i < charCount; i++) {
      phonemes.push({
        time: (i + 1) * step,
        vowel: 'a',
      });
    }

    return {
      audioBlob,
      duration: Math.max(actualDuration, 0.3),
      phonemes,
    };
  }
}

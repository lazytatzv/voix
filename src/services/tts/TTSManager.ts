import { TTSOptions, TTSProvider, VoicevoxProvider } from './VoicevoxProvider';
import { Speaker, PhonemeTiming } from '../../types';
import { makeCacheKey } from '../../utils/hash';
import {
  loadCachedAudio,
  rememberCachedAudio,
  saveCachedAudio,
} from '../audioCache';

export interface TTSResult {
  audioBlob: Blob;
  duration: number;
  phonemes: PhonemeTiming[];
  /** Stable disk-cache key; persisted into project YAML. */
  audioKey: string;
}

export class TTSManager {
  private providers: Map<string, TTSProvider> = new Map();
  private cache: Map<string, TTSResult> = new Map();

  constructor() {
    // デフォルトでローカルVOICEVOXを登録
    const defaultVoicevox = new VoicevoxProvider('voicevox', 'VOICEVOX (localhost:50021)', 'http://localhost:50021');
    this.providers.set(defaultVoicevox.id, defaultVoicevox);

    // COEIROINK v2 (デフォルトポート: 50032)
    const coeiroink = new VoicevoxProvider('coeiroink', 'COEIROINK (localhost:50032)', 'http://localhost:50032');
    this.providers.set(coeiroink.id, coeiroink);

    const aivis = new VoicevoxProvider('aivis', 'AivisSpeech (localhost:10101)', 'http://localhost:10101');
    this.providers.set(aivis.id, aivis);
  }

  registerProvider(provider: TTSProvider) {
    this.providers.set(provider.id, provider);
  }

  unregisterProvider(id: string) {
    if (['voicevox', 'coeiroink', 'aivis'].includes(id)) return;
    this.providers.delete(id);
  }

  getProviders(): TTSProvider[] {
    return Array.from(this.providers.values());
  }

  getProvider(id: string): TTSProvider | undefined {
    return this.providers.get(id);
  }

  async getAllSpeakers(): Promise<{ providerId: string; providerName: string; speakers: Speaker[] }[]> {
    // Probe every engine in parallel; offline providers simply drop out.
    const results = await Promise.all(
      Array.from(this.providers.values()).map(async (provider) => {
        try {
          const available = await provider.isAvailable();
          // For primary providers (voicevox and coeiroink), provide catalog speakers even if engine is offline
          if (!available && provider.id !== 'voicevox' && provider.id !== 'coeiroink') return null;
          const speakers = await provider.getSpeakers();
          if (speakers.length === 0) return null;
          return {
            providerId: provider.id,
            providerName: available ? provider.name : `${provider.name} (offline catalog)`,
            speakers,
          };
        } catch (err) {
          console.warn(`Provider ${provider.name} unavailable`, err);
          return null;
        }
      })
    );
    return results.filter(
      (entry): entry is { providerId: string; providerName: string; speakers: Speaker[] } =>
        entry !== null
    );
  }

  getCacheKey(
    providerId: string,
    speakerId: number,
    text: string,
    options?: TTSOptions
  ): string {
    return makeCacheKey([
      providerId,
      speakerId,
      text.trim(),
      (options?.speedScale ?? 1).toFixed(3),
      (options?.pitchScale ?? 0).toFixed(3),
      (options?.volumeScale ?? 1).toFixed(3),
      (options?.intonationScale ?? 1).toFixed(3),
      (options?.prePhonemeLength ?? 0.1).toFixed(3),
      (options?.postPhonemeLength ?? 0.2).toFixed(3),
      (options?.pauseLengthScale ?? 1).toFixed(3),
    ]);
  }

  async synthesize(
    providerId: string,
    speakerId: number,
    text: string,
    options?: TTSOptions,
    useCache = true
  ): Promise<TTSResult> {
    const key = this.getCacheKey(providerId, speakerId, text, options);
    if (useCache && this.cache.has(key)) {
      return this.cache.get(key)!;
    }

    // Disk cache survives app restarts and makes project reload instant.
    if (useCache) {
      const disk = await loadCachedAudio(key);
      if (disk) {
        const result: TTSResult = {
          audioBlob: disk.blob,
          duration: disk.duration,
          phonemes: [],
          audioKey: key,
        };
        this.cache.set(key, result);
        return result;
      }
    }

    const provider = this.providers.get(providerId);
    if (!provider) {
      throw new Error(`TTS Provider "${providerId}" not found`);
    }

    const result = await provider.synthesize(speakerId, text, options);
    const complete: TTSResult = { ...result, audioKey: key };
    this.cache.set(key, complete);
    rememberCachedAudio(key, {
      blob: result.audioBlob,
      url: URL.createObjectURL(result.audioBlob),
      duration: result.duration,
    });
    // Fire-and-forget disk persistence.
    void saveCachedAudio(key, result.audioBlob);
    return complete;
  }

  async synthesizeWithKey(
    key: string,
    providerId: string,
    speakerId: number,
    text: string,
    options?: TTSOptions
  ): Promise<TTSResult> {
    if (this.cache.has(key)) return this.cache.get(key)!;
    const disk = await loadCachedAudio(key);
    if (disk) {
      const result: TTSResult = {
        audioBlob: disk.blob,
        duration: disk.duration,
        phonemes: [],
        audioKey: key,
      };
      this.cache.set(key, result);
      return result;
    }
    return this.synthesize(providerId, speakerId, text, options, true);
  }
}

// シングルトンインスタンス
export const ttsManager = new TTSManager();

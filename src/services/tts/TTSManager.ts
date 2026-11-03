import { TTSProvider, VoicevoxProvider } from './VoicevoxProvider';
import { Speaker, PhonemeTiming } from '../../types';

export class TTSManager {
  private providers: Map<string, TTSProvider> = new Map();
  private cache: Map<string, { audioBlob: Blob; duration: number; phonemes: PhonemeTiming[] }> = new Map();

  constructor() {
    // デフォルトでローカルVOICEVOXを登録
    const defaultVoicevox = new VoicevoxProvider('voicevox', 'VOICEVOX (localhost:50021)', 'http://localhost:50021');
    this.providers.set(defaultVoicevox.id, defaultVoicevox);

    // COEIROINK等の互換エンジンもワンクリックで足せるようにプリセット登録可能
    const coeiroink = new VoicevoxProvider('coeiroink', 'COEIROINK (localhost:50031)', 'http://localhost:50031');
    this.providers.set(coeiroink.id, coeiroink);

    const aivis = new VoicevoxProvider('aivis', 'AivisSpeech (localhost:10101)', 'http://localhost:10101');
    this.providers.set(aivis.id, aivis);
  }

  registerProvider(provider: TTSProvider) {
    this.providers.set(provider.id, provider);
  }

  getProviders(): TTSProvider[] {
    return Array.from(this.providers.values());
  }

  getProvider(id: string): TTSProvider | undefined {
    return this.providers.get(id);
  }

  async getAllSpeakers(): Promise<{ providerId: string; providerName: string; speakers: Speaker[] }[]> {
    const results = [];
    for (const provider of this.providers.values()) {
      try {
        const available = await provider.isAvailable();
        if (available) {
          const speakers = await provider.getSpeakers();
          results.push({
            providerId: provider.id,
            providerName: provider.name,
            speakers,
          });
        }
      } catch (err) {
        console.warn(`Provider ${provider.name} unavailable`, err);
      }
    }
    return results;
  }

  private getCacheKey(
    providerId: string,
    speakerId: number,
    text: string,
    options?: { speedScale?: number; pitchScale?: number }
  ): string {
    const optStr = options ? `${options.speedScale || 1}_${options.pitchScale || 0}` : '';
    return `${providerId}_${speakerId}_${text.trim()}_${optStr}`;
  }

  async synthesize(
    providerId: string,
    speakerId: number,
    text: string,
    options?: { speedScale?: number; pitchScale?: number },
    useCache = true
  ): Promise<{
    audioBlob: Blob;
    duration: number;
    phonemes: PhonemeTiming[];
  }> {
    const key = this.getCacheKey(providerId, speakerId, text, options);
    if (useCache && this.cache.has(key)) {
      return this.cache.get(key)!;
    }

    const provider = this.providers.get(providerId);
    if (!provider) {
      throw new Error(`TTS Provider "${providerId}" not found`);
    }

    const result = await provider.synthesize(speakerId, text, options);
    this.cache.set(key, result);
    return result;
  }
}

// シングルトンインスタンス
export const ttsManager = new TTSManager();

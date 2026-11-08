import { describe, it, expect, vi, beforeEach } from 'vitest';
import { VoicevoxProvider } from '../VoicevoxProvider';

describe('VoicevoxProvider', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('checks availability via endpoints', async () => {
    const provider = new VoicevoxProvider('coeiroink', 'COEIROINK', 'http://localhost:50032');
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      if (String(url).endsWith('/docs')) {
        return new Response('OK', { status: 200 });
      }
      return new Response('Not Found', { status: 404 });
    });

    const available = await provider.isAvailable();
    expect(available).toBe(true);
  });

  it('synthesizes via COEIROINK v2 direct synthesis endpoint', async () => {
    const provider = new VoicevoxProvider('coeiroink', 'COEIROINK', 'http://localhost:50032');
    
    // Create a mock 44-byte WAV header
    const wavBuffer = new ArrayBuffer(44);
    const view = new DataView(wavBuffer);
    view.setUint32(28, 48000, true); // byteRate = 48000
    view.setUint32(40, 96000, true); // subchunk2Size = 96000 -> duration = 2.0s
    const mockWavBlob = new Blob([wavBuffer], { type: 'audio/wav' });

    let sentUrl = '';
    let sentBody: any = null;

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
      const urlStr = String(url);
      if (urlStr.includes('/v1/style_id_to_speaker_meta')) {
        return new Response(
          JSON.stringify({
            speakerUuid: '3c37646f-3881-5374-2a83-149267990abc',
            styleId: 0,
            speakerName: 'つくよみちゃん',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (urlStr.includes('/v1/synthesis')) {
        sentUrl = urlStr;
        sentBody = JSON.parse(init?.body as string);
        return new Response(mockWavBlob, {
          status: 200,
          headers: { 'Content-Type': 'audio/wav' },
        });
      }
      return new Response('Not Found', { status: 404 });
    });

    const result = await provider.synthesize(0, 'こんにちは');
    expect(sentUrl).toContain('/v1/synthesis');
    expect(sentBody.speakerUuid).toBe('3c37646f-3881-5374-2a83-149267990abc');
    expect(sentBody.styleId).toBe(0);
    expect(sentBody.text).toBe('こんにちは');
    expect(result.duration).toBeCloseTo(2.0, 1);
    expect(result.phonemes.length).toBeGreaterThan(0);
  });

  it('synthesizes via VOICEVOX audio_query + synthesis endpoints', async () => {
    const provider = new VoicevoxProvider('voicevox', 'VOICEVOX', 'http://localhost:50021');
    
    const mockAudioQuery = {
      accent_phrases: [
        {
          moras: [
            { text: 'コ', vowel: 'o', vowel_length: 0.1, consonant_length: 0.05, pitch: 5.5 },
            { text: 'ン', vowel: 'N', vowel_length: 0.1, pitch: 5.5 },
          ],
          accent: 1,
        },
      ],
      speedScale: 1.0,
      pitchScale: 0.0,
      intonationScale: 1.0,
      volumeScale: 1.0,
      prePhonemeLength: 0.1,
      postPhonemeLength: 0.2,
      outputSamplingRate: 24000,
      outputStereo: false,
    };

    const mockWavBlob = new Blob([new ArrayBuffer(100)], { type: 'audio/wav' });

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      const urlStr = String(url);
      if (urlStr.includes('/audio_query')) {
        return new Response(JSON.stringify(mockAudioQuery), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (urlStr.includes('/synthesis')) {
        return new Response(mockWavBlob, {
          status: 200,
          headers: { 'Content-Type': 'audio/wav' },
        });
      }
      return new Response('Not Found', { status: 404 });
    });

    const result = await provider.synthesize(1, 'コン');
    expect(result.phonemes.length).toBe(2);
    expect(result.duration).toBeGreaterThan(0.3);
  });
});

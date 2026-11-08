import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VoiceAudioPlayer } from '../voicePlayer';

class FakeAudioParam {
  value = 0;
  setValueAtTime(value: number) {
    this.value = value;
    return this;
  }
  linearRampToValueAtTime(value: number) {
    this.value = value;
    return this;
  }
}

class FakeGainNode {
  gain = new FakeAudioParam();
  connect() {}
}

class FakeSourceNode {
  buffer: AudioBuffer | null = null;
  onended: (() => void) | null = null;
  start = vi.fn();
  stop = vi.fn();
  connect() {}
}

class FakeAudioContext {
  static latest: FakeAudioContext | null = null;
  state: 'running' | 'suspended' | 'closed' = 'running';
  currentTime = 0;
  destination = {};
  gains: FakeGainNode[] = [];
  sources: FakeSourceNode[] = [];
  resume = vi.fn(async () => {});
  createGain() {
    const gain = new FakeGainNode();
    this.gains.push(gain);
    return gain;
  }
  createBufferSource() {
    const source = new FakeSourceNode();
    this.sources.push(source);
    return source;
  }
  constructor() {
    FakeAudioContext.latest = this;
  }
}

function installFakeAudioContext() {
  (globalThis as unknown as { window: unknown }).window = {
    AudioContext: FakeAudioContext,
  };
}

describe('VoiceAudioPlayer mute handling', () => {
  let originalWindow: unknown;

  beforeEach(() => {
    originalWindow = (globalThis as unknown as { window?: unknown }).window;
    installFakeAudioContext();
    FakeAudioContext.latest = null;
  });

  afterEach(() => {
    (globalThis as unknown as { window?: unknown }).window = originalWindow;
  });

  it('restores the per-line volume when unmuting during playback', async () => {
    const player = new VoiceAudioPlayer();
    vi.spyOn(player, 'getAudioBuffer').mockResolvedValue({ duration: 2 } as AudioBuffer);

    await player.playVoice('line-1', 'blob:test', 0.4);
    const context = FakeAudioContext.latest!;
    expect(context.gains[0].gain.value).toBeCloseTo(0.4);

    player.setMuted(true);
    expect(context.gains[0].gain.value).toBe(0);

    player.setMuted(false);
    expect(context.gains[0].gain.value).toBeCloseTo(0.4);
  });

  it('keeps the requested volume when a line starts muted', async () => {
    const player = new VoiceAudioPlayer();
    vi.spyOn(player, 'getAudioBuffer').mockResolvedValue({ duration: 2 } as AudioBuffer);

    player.setMuted(true);
    await player.playVoice('line-2', 'blob:test', 0.75);
    const context = FakeAudioContext.latest!;
    expect(context.gains[0].gain.value).toBe(0);

    player.setMuted(false);
    expect(context.gains[0].gain.value).toBeCloseTo(0.75);
  });

  it('clamps the restored volume to the safe 0-1 range', async () => {
    const player = new VoiceAudioPlayer();
    vi.spyOn(player, 'getAudioBuffer').mockResolvedValue({ duration: 2 } as AudioBuffer);

    await player.playVoice('line-3', 'blob:test', 1.8);
    const context = FakeAudioContext.latest!;
    expect(context.gains[0].gain.value).toBe(1);

    player.setMuted(true);
    player.setMuted(false);
    expect(context.gains[0].gain.value).toBe(1);
  });
});

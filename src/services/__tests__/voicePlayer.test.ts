import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VoiceAudioPlayer } from '../voicePlayer';

interface GainEvent {
  type: 'set' | 'ramp' | 'cancel';
  value: number;
  time: number;
}

class FakeAudioParam {
  value = 0;
  events: GainEvent[] = [];
  setValueAtTime(value: number, time = 0) {
    this.value = value;
    this.events.push({ type: 'set', value, time });
    return this;
  }
  linearRampToValueAtTime(value: number, time = 0) {
    this.value = value;
    this.events.push({ type: 'ramp', value, time });
    return this;
  }
  cancelScheduledValues(time = 0) {
    this.events.push({ type: 'cancel', value: 0, time });
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

  it('clamps the restored volume to the safe 0-2 range', async () => {
    const player = new VoiceAudioPlayer();
    vi.spyOn(player, 'getAudioBuffer').mockResolvedValue({ duration: 2 } as AudioBuffer);

    await player.playVoice('line-3', 'blob:test', 2.8);
    const context = FakeAudioContext.latest!;
    expect(context.gains[0].gain.value).toBe(2);

    player.setMuted(true);
    player.setMuted(false);
    expect(context.gains[0].gain.value).toBe(2);
  });

  it('cancels scheduled fades when muting so silence sticks', async () => {
    const player = new VoiceAudioPlayer();
    vi.spyOn(player, 'getAudioBuffer').mockResolvedValue({ duration: 3 } as AudioBuffer);

    await player.playVoice('line-4', 'blob:test', 1, 0, undefined, {
      duration: 2,
      fadeOut: 0.5,
    });
    const gain = FakeAudioContext.latest!.gains[0].gain;
    gain.events.length = 0;

    player.setMuted(true);
    expect(gain.events[0]).toMatchObject({ type: 'cancel', time: 0 });
    expect(gain.events[1]).toMatchObject({ type: 'set', value: 0, time: 0 });
    expect(gain.value).toBe(0);
  });

  it('resumes a fade-out envelope when unmuting late in the clip', async () => {
    const player = new VoiceAudioPlayer();
    vi.spyOn(player, 'getAudioBuffer').mockResolvedValue({ duration: 3 } as AudioBuffer);

    await player.playVoice('line-5', 'blob:test', 1, 0, undefined, {
      duration: 2,
      fadeOut: 1,
    });
    const context = FakeAudioContext.latest!;
    const gain = context.gains[0].gain;

    player.setMuted(true);
    context.currentTime = 1.5;
    gain.events.length = 0;
    player.setMuted(false);

    expect(gain.events[0]).toMatchObject({ type: 'cancel', time: 1.5 });
    expect(gain.events[1]).toMatchObject({ type: 'set', time: 1.5 });
    expect(gain.events[1].value).toBeCloseTo(0.5);
    expect(gain.events[2]).toMatchObject({ type: 'ramp', value: 0.0001, time: 2 });
  });
});

describe('VoiceAudioPlayer clip envelope', () => {
  let originalWindow: unknown;

  beforeEach(() => {
    originalWindow = (globalThis as unknown as { window?: unknown }).window;
    installFakeAudioContext();
    FakeAudioContext.latest = null;
  });

  afterEach(() => {
    (globalThis as unknown as { window?: unknown }).window = originalWindow;
  });

  it('stops the source at the timeline clip end', async () => {
    const player = new VoiceAudioPlayer();
    vi.spyOn(player, 'getAudioBuffer').mockResolvedValue({ duration: 3 } as AudioBuffer);

    await player.playVoice('clip-1', 'blob:test', 1, 0, undefined, { duration: 1.25 });

    const source = FakeAudioContext.latest!.sources[0];
    expect(source.start).toHaveBeenCalledWith(0, 0);
    expect(source.stop).toHaveBeenCalledWith(1.25);
  });

  it('does not stop the source when the clip covers the rest of the buffer', async () => {
    const player = new VoiceAudioPlayer();
    vi.spyOn(player, 'getAudioBuffer').mockResolvedValue({ duration: 2 } as AudioBuffer);

    await player.playVoice('clip-2', 'blob:test', 1, 0.5, undefined, { duration: 5 });

    const source = FakeAudioContext.latest!.sources[0];
    expect(source.stop).not.toHaveBeenCalled();
  });

  it('fades in from silence and out before the clip end', async () => {
    const player = new VoiceAudioPlayer();
    vi.spyOn(player, 'getAudioBuffer').mockResolvedValue({ duration: 3 } as AudioBuffer);

    await player.playVoice('clip-3', 'blob:test', 0.8, 0, undefined, {
      duration: 2,
      fadeIn: 0.4,
      fadeOut: 0.5,
    });

    const events = FakeAudioContext.latest!.gains[0].gain.events;
    expect(events[0]).toMatchObject({ type: 'set', value: 0, time: 0 });
    expect(events[1]).toMatchObject({ type: 'ramp', value: 0.8, time: 0.4 });
    expect(events[2]).toMatchObject({ type: 'set', value: 0.8, time: 1.5 });
    expect(events[3]).toMatchObject({ type: 'ramp', value: 0.0001, time: 2 });
  });

  it('fits both fades into a clip that is shorter than their sum', async () => {
    const player = new VoiceAudioPlayer();
    vi.spyOn(player, 'getAudioBuffer').mockResolvedValue({ duration: 3 } as AudioBuffer);

    await player.playVoice('clip-4', 'blob:test', 1, 0, undefined, {
      duration: 1,
      fadeIn: 0.8,
      fadeOut: 0.8,
    });

    const events = FakeAudioContext.latest!.gains[0].gain.events;
    expect(events[1]).toMatchObject({ type: 'ramp', value: 1, time: 0.5 });
    expect(events[3]).toMatchObject({ type: 'ramp', value: 0.0001, time: 1 });
  });

  it('skips the fade-in when playback resumes mid-clip', async () => {
    const player = new VoiceAudioPlayer();
    vi.spyOn(player, 'getAudioBuffer').mockResolvedValue({ duration: 3 } as AudioBuffer);

    await player.playVoice('clip-5', 'blob:test', 1, 0.5, undefined, {
      duration: 2.5,
      fadeIn: 0.4,
    });

    const events = FakeAudioContext.latest!.gains[0].gain.events;
    expect(events[0]).toMatchObject({ type: 'set', value: 1, time: 0 });
    expect(events.some((event) => event.type === 'ramp')).toBe(false);
  });

  it('ignores a clip that has already ended', async () => {
    const player = new VoiceAudioPlayer();
    vi.spyOn(player, 'getAudioBuffer').mockResolvedValue({ duration: 2 } as AudioBuffer);

    const started = await player.playVoice('clip-6', 'blob:test', 1, 0, undefined, {
      duration: 0.01,
    });

    expect(started).toBe(false);
    expect(FakeAudioContext.latest!.sources).toHaveLength(0);
  });
});

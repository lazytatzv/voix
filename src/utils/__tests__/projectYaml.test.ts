import { describe, expect, it } from 'vitest';
import {
  computeProjectDuration,
  createEmptyProject,
  DEFAULT_SUBTITLE_STYLE,
  normalizeProject,
  projectFromYaml,
  projectToYaml,
  sanitizeProject,
} from '../projectYaml';
import { AudioItem, VoiceItem, VoixProject } from '../../types';

function makeProject(): VoixProject {
  const project = createEmptyProject('Roundtrip');
  project.timeline = {
    ...project.timeline,
    width: 1280,
    height: 720,
    fps: 60,
    overlayFps: 30,
    duration: 23.5,
    backgroundColor: '#101114',
    videoPath: '/tmp/background.mp4',
    videoVolume: 0.35,
    videoOffset: 12.5,
    videoFit: 'cover',
    ducking: { enabled: true, level: 0.3, attack: 0.1, release: 0.8 },
  };
  project.notes = 'Asset links and credits';
  project.markers = [
    { id: 'marker_cue_b', time: 8.5, label: 'Cue B', color: '#f97316' },
    { id: 'marker_cue_a', time: 2, label: 'Cue A' },
  ];
  project.tracks = project.tracks?.map((track) =>
    track.id === 'voice' ? { ...track, muted: true } : track.id === 'audio' ? { ...track, locked: true } : track
  );
  project.items = [
    {
      id: 'voice_1',
      type: 'voice',
      layer: 2,
      startTime: 0.5,
      duration: 2.75,
      name: 'Zundamon line',
      characterId: 'zundamon',
      text: 'YAMLはいいぞ。',
      subtitleText: 'YAML is nice.',
      expression: 'smile',
      audioKey: 'abc123',
      speedScale: 1.1,
      pitchScale: -0.05,
      volumeScale: 0.8,
      terminal: { cmd: 'echo yaml', output: 'yaml' },
      se: 'pop',
      anim: 'bounce',
    },
    {
      id: 'text_1',
      type: 'text',
      layer: 4,
      startTime: 4,
      duration: 3,
      name: 'Caption',
      text: 'YAML → timeline',
      effects: { blur: 3, brightness: 1.1, hueRotate: -15 },
      style: { ...DEFAULT_SUBTITLE_STYLE, fontSize: 64, bgStyle: 'pill', lineHeight: 1.5, letterSpacing: 2, vertical: true, italic: true, underline: true, strikethrough: true, wordWrap: false },
      xPercent: 42,
      yPercent: 30,
      widthPercent: 75,
      align: 'left',
      rotation: 3,
      opacity: 0.9,
      displayInterval: 0.04,
      displayDirection: 'from-last',
      hideInterval: 0.06,
      hideDirection: 'from-first',
      keyframes: [
        { id: 'kf_text_a', time: 0, x: 42, y: 30, opacity: 0, easing: 'ease-out' },
        { id: 'kf_text_b', time: 2.5, x: 60, y: 20, scale: 1.2 },
      ],
    },
    {
      id: 'audio_1',
      type: 'audio',
      layer: 1,
      startTime: 0,
      duration: 20,
      name: 'BGM',
      src: '/tmp/bgm.mp3',
      volume: 0.3,
      offset: 1.25,
      isBgm: true,
      loop: true,
      fadeIn: 1.5,
      fadeOut: 2,
      audioKey: 'bgm-key',
    },
    {
      id: 'image_1',
      type: 'image',
      layer: 3,
      startTime: 2,
      duration: 5,
      name: 'Logo',
      src: '/tmp/logo.png',
      x: 100,
      y: 120,
      width: 300,
      height: 180,
      opacity: 0.8,
      rotation: -4,
      flipH: true,
    },
  ];
  return project;
}

describe('project YAML roundtrip', () => {
  it('preserves timeline, tracks, notes, and item fields', () => {
    const source = makeProject();
    const restored = projectFromYaml(projectToYaml(source));

    expect(restored.name).toBe('Roundtrip');
    expect(restored.timeline).toMatchObject({
      width: 1280,
      height: 720,
      fps: 60,
      overlayFps: 30,
      duration: 23.5,
      backgroundColor: '#101114',
      videoPath: '/tmp/background.mp4',
      videoVolume: 0.35,
      videoOffset: 12.5,
      videoFit: 'cover',
      ducking: { enabled: true, level: 0.3, attack: 0.1, release: 0.8 },
    });
    expect(restored.notes).toBe('Asset links and credits');
    expect(restored.markers).toEqual([
      { id: 'marker_cue_a', time: 2, label: 'Cue A', color: undefined },
      { id: 'marker_cue_b', time: 8.5, label: 'Cue B', color: '#f97316' },
    ]);
    expect(restored.tracks?.find((track) => track.id === 'voice')?.muted).toBe(true);
    expect(restored.tracks?.find((track) => track.id === 'audio')?.locked).toBe(true);

    const voice = restored.items.find((item) => item.id === 'voice_1') as VoiceItem;
    expect(voice).toMatchObject({
      type: 'voice',
      text: 'YAMLはいいぞ。',
      subtitleText: 'YAML is nice.',
      audioKey: 'abc123',
      speedScale: 1.1,
      pitchScale: -0.05,
      volumeScale: 0.8,
      se: 'pop',
      anim: 'bounce',
    });
    expect(voice.terminal).toEqual({ cmd: 'echo yaml', output: 'yaml' });

    const text = restored.items.find((item) => item.id === 'text_1');
    expect(text?.type === 'text' && text.style.fontSize).toBe(64);
    expect(text?.type === 'text' && text.style.lineHeight).toBe(1.5);
    expect(text?.type === 'text' && text.style.letterSpacing).toBe(2);
    expect(text?.type === 'text' && text.style.italic).toBe(true);
    expect(text?.type === 'text' && text.style.underline).toBe(true);
    expect(text?.type === 'text' && text.style.strikethrough).toBe(true);
    expect(text?.type === 'text' && text.style.wordWrap).toBe(false);
    expect(text?.type === 'text' && text.style.vertical).toBe(true);
    expect(text?.type === 'text' && text.displayInterval).toBe(0.04);
    expect(text?.type === 'text' && text.displayDirection).toBe('from-last');
    expect(text?.type === 'text' && text.hideInterval).toBe(0.06);
    expect(text?.type === 'text' && text.hideDirection).toBe('from-first');
    expect(text?.type === 'text' && text.align).toBe('left');
    expect(text?.effects).toEqual({ blur: 3, brightness: 1.1, hueRotate: -15 });
    expect(text?.keyframes).toEqual([
      { id: 'kf_text_a', time: 0, x: 42, y: 30, opacity: 0, easing: 'ease-out' },
      { id: 'kf_text_b', time: 2.5, x: 60, y: 20, scale: 1.2 },
    ]);

    const audio = restored.items.find((item) => item.id === 'audio_1') as AudioItem;
    expect(audio).toMatchObject({ loop: true, isBgm: true, volume: 0.3, offset: 1.25, audioKey: 'bgm-key' });
  });

  it('strips volatile blobs before serializing', () => {
    const project = makeProject();
    (project.items[0] as VoiceItem).audioBlob = new Blob(['voice']);
    (project.items[0] as VoiceItem).audioBlobUrl = 'blob:voice';
    (project.items[0] as VoiceItem).isSynthesizing = true;
    (project.items[2] as AudioItem).audioBlob = new Blob(['bgm']);

    const yaml = projectToYaml(project);
    expect(yaml).not.toContain('blob:voice');
    expect(yaml).not.toContain('isSynthesizing');

    const clean = sanitizeProject(project);
    const cleanVoice = clean.items[0] as VoiceItem;
    const cleanAudio = clean.items[2] as AudioItem;
    expect(cleanVoice.audioBlob).toBeUndefined();
    expect(cleanVoice.audioBlobUrl).toBeUndefined();
    expect(cleanVoice.isSynthesizing).toBeUndefined();
    expect(cleanAudio.audioBlob).toBeUndefined();
    // The cache reference survives so reloads do not hit the TTS engine.
    expect(cleanVoice.audioKey).toBe('abc123');
    expect(cleanAudio.audioKey).toBe('bgm-key');
  });
});

describe('normalization and legacy import', () => {
  it('accepts legacy JSON projects and fills defaults', () => {
    const legacy = JSON.stringify({
      name: 'Legacy',
      timeline: { width: 640, height: 360 },
      characters: [{ id: 'zundamon', name: 'ずんだもん', speakerId: 3 }],
      items: [{ type: 'voice', text: 'hello', startTime: 1 }],
    });
    const restored = projectFromYaml(legacy);
    expect(restored.name).toBe('Legacy');
    expect(restored.timeline.fps).toBe(30);
    expect(restored.timeline.overlayFps).toBe(15);
    expect(restored.tracks).toHaveLength(6);
    expect(restored.items[0]).toMatchObject({ type: 'voice', text: 'hello', startTime: 1 });
  });

  it('ignores unknown item types and supplies stable track defaults', () => {
    const restored = normalizeProject({
      name: 'Odd',
      items: [{ type: 'hologram', text: 'nope' }, { type: 'text', text: 'kept' }],
    });
    expect(restored.items).toHaveLength(1);
    expect(restored.items[0].type).toBe('text');
    expect(restored.tracks?.map((track) => track.id)).toEqual([
      'video',
      'character',
      'voice',
      'text',
      'image',
      'audio',
    ]);
  });

  it('normalizes and sorts markers while dropping invalid entries', () => {
    const restored = normalizeProject({
      name: 'Markers',
      items: [],
      markers: [
        { id: 'late', time: 12.5, label: 'Late' },
        { id: 'bad', time: 'nope' },
        { time: 3 },
      ],
    });
    expect(restored.markers).toEqual([
      { id: 'marker_2', time: 3, label: undefined, color: undefined },
      { id: 'late', time: 12.5, label: 'Late', color: undefined },
    ]);
  });

  it('rejects files that are not projects', () => {
    expect(() => projectFromYaml('just a string')).toThrow(/does not look like a Voix project/);
    expect(() => projectFromYaml('')).toThrow(/Empty project file/);
  });
});

describe('duration helpers', () => {
  it('keeps a ten second floor and adds a small tail', () => {
    expect(computeProjectDuration([])).toBe(10);
    expect(computeProjectDuration([], 4)).toBe(10);
    expect(computeProjectDuration([], 12.345)).toBe(12.35);
  });

  it('uses the last timeline item when it extends past the video', () => {
    const project = createEmptyProject();
    project.items = [
      {
        id: 'text',
        type: 'text',
        layer: 4,
        startTime: 3,
        duration: 2,
        name: 'text',
        text: 'x',
        style: DEFAULT_SUBTITLE_STYLE,
      },
    ];
    expect(computeProjectDuration(project.items, 4)).toBe(10);
    project.items[0].startTime = 9;
    expect(computeProjectDuration(project.items, 4)).toBe(11.4);
  });
});

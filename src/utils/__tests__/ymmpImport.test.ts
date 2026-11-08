import { describe, expect, it } from 'vitest';
import { parseYmmpProject, parseYmmpTime } from '../ymmp';
import { Character } from '../../types';

const character: Character = {
  id: 'zundamon',
  name: 'ずんだもん',
  ttsProviderId: 'voicevox',
  speakerId: 3,
  position: 'left',
  avatar: { idle: '/characters/zundamon.png' },
  subtitleStyle: {
    textColor: '#ffffff',
    fontSize: 42,
    fontFamily: 'sans-serif',
    fontWeight: '900',
    strokeColor: '#0a0a0c',
    strokeWidth: 8,
    bgStyle: 'none',
    yOffsetPercent: 12,
  },
};

function makeYmmp() {
  return {
    Timeline: undefined,
    Timelines: [
      {
        Name: 'YMM4 Demo',
        Length: 900,
        VideoInfo: { FPS: 60, Width: 1920, Height: 1080 },
        Items: [
          {
            $type: 'YukkuriMovieMaker.Project.Items.VoiceItem, YukkuriMovieMaker',
            Frame: 60,
            Length: 240,
            Layer: 1,
            Serif: 'こんにちはなのだ！\r\n今日も元気？',
            CharacterName: 'ずんだもん（あまあま）',
            Volume: { Values: [{ Value: 50 }] },
            VoiceFadeIn: 0.2,
            VoiceFadeOut: 0.35,
            VoiceParameter: {
              Speed: 120,
              Pitch: 5,
              Intonation: 80,
              PrePhonemeLength: 0.15,
              PostPhonemeLength: 0.25,
              PauseLengthScale: 1.5,
            },
          },
          {
            $type: 'YukkuriMovieMaker.Project.Items.TextItem, YukkuriMovieMaker',
            Frame: 0,
            Length: 120,
            Text: 'テロップ',
            X: -960,
            Y: -538.5,
            BasePoint: 'LeftTop',
            FontSize: { Values: [{ Value: 64 }], Span: 0, AnimationType: 'None' },
            LineHeight2: { Values: [{ Value: 150 }] },
            LetterSpacing2: { Values: [{ Value: 100 }] },
            WordWrap: 'NoWrap',
            MaxWidth: { Values: [{ Value: 1200 }] },
            Font: 'Yu Gothic UI',
            FontColor: '#FF112233',
            StyleColor: '#FF000000',
            Style: 'Outline',
            Bold: true,
            Italic: true,
            Underline: true,
            Strikethrough: true,
            DisplayInterval: 0.05,
            DisplayDirection: 'FromLast',
            HideInterval: 0.08,
            HideDirection: 'FromFirst',
            Layer: 5,
            FadeIn: 0.2,
            FadeOut: 0.3,
            Blend: 'Screen',
          },
          {
            $type: 'YukkuriMovieMaker.Project.Items.AudioItem, YukkuriMovieMaker',
            Frame: 0,
            Length: 600,
            FilePath: 'audio\\bgm.mp3',
            Volume: 50,
            PlaybackRate: 100,
            ContentOffset: '00:00:01.5000000',
            IsLooped: true,
          },
          {
            $type: 'YukkuriMovieMaker.Project.Items.ImageItem, YukkuriMovieMaker',
            Frame: 120,
            Length: 60,
            FilePath: 'images/logo.png',
            X: 100,
            Y: -50,
            Zoom: 150,
            Opacity: 80,
            Blend: 'Multiply',
          },
          {
            $type: 'YukkuriMovieMaker.Project.Items.VideoItem, YukkuriMovieMaker',
            Frame: 0,
            Length: 60,
            FilePath: 'video/background.mp4',
            Volume: 40,
            PlaybackRate: 150,
            ContentOffset: '00:00:02.5000000',
          },
          {
            $type: 'YukkuriMovieMaker.Project.Items.TachieItem, YukkuriMovieMaker',
            Frame: 0,
            Length: 60,
          },
          {
            $type: 'YukkuriMovieMaker.Project.Items.ShapeItem, YukkuriMovieMaker',
            Frame: 0,
            Length: 60,
          },
          {
            $type: 'YukkuriMovieMaker.Project.Items.GroupItem, YukkuriMovieMaker',
            Frame: 0,
            Length: 60,
          },
        ],
      },
    ],
    Characters: [{ Name: 'ずんだもん', Color: '#FF00FF00' }],
  };
}

describe('parseYmmpProject', () => {
  it('converts YMM4 frames, voice parameters and asset paths', () => {
    const result = parseYmmpProject(JSON.stringify(makeYmmp()), {
      fileName: 'demo.ymmp',
      assetBaseDir: '/projects/demo',
      existingCharacters: [character],
    });

    expect(result.stats).toMatchObject({
      timelineName: 'YMM4 Demo',
      fps: 60,
      width: 1920,
      height: 1080,
      voices: 1,
      texts: 1,
      images: 1,
      shapes: 0,
      audio: 1,
      videos: 1,
      skipped: 3,
      total: 8,
      characters: 1,
    });

    const voice = result.project.items.find((item) => item.type === 'voice');
    expect(voice).toMatchObject({
      type: 'voice',
      startTime: 1,
      duration: 4,
      text: 'こんにちはなのだ！\n今日も元気？',
      characterId: 'zundamon',
      speedScale: 1.2,
      pitchScale: 0.05,
      intonationScale: 0.8,
      prePhonemeLength: 0.15,
      postPhonemeLength: 0.25,
      pauseLengthScale: 1.5,
      volumeScale: 0.5,
      fadeIn: 0.2,
      fadeOut: 0.35,
    });

    const text = result.project.items.find((item) => item.type === 'text');
    expect(text).toMatchObject({
      type: 'text',
      startTime: 0,
      duration: 2,
      text: 'テロップ',
      align: 'left',
      rotation: 0,
      opacity: 1,
    });
    if (text?.type === 'text') {
      expect(text.style.fontSize).toBe(64);
      expect(text.style.fontFamily).toBe('Yu Gothic UI');
      expect(text.style.fontWeight).toBe('700');
      expect(text.style.textColor).toBe('#112233');
      expect(text.style.strokeColor).toBe('#000000');
      expect(text.style.strokeWidth).toBeGreaterThan(0);
      expect(text.style.lineHeight).toBe(1.5);
      expect(text.style.letterSpacing).toBe(64);
      expect(text.style.italic).toBe(true);
      expect(text.style.underline).toBe(true);
      expect(text.style.strikethrough).toBe(true);
      expect(text.style.wordWrap).toBe(false);
      expect(text.blendMode).toBe('screen');
      expect(text.displayInterval).toBe(0.05);
      expect(text.displayDirection).toBe('from-last');
      expect(text.hideInterval).toBe(0.08);
      expect(text.hideDirection).toBe('from-first');
      expect(text.xPercent).toBeGreaterThan(0);
      expect(text.xPercent).toBeLessThan(15);
      expect(text.yPercent).toBeLessThan(10);
    }

    const audio = result.project.items.find((item) => item.type === 'audio');
    expect(audio).toMatchObject({
      type: 'audio',
      startTime: 0,
      duration: 10,
      src: '/projects/demo/audio/bgm.mp3',
      volume: 0.5,
      speed: 1,
      offset: 1.5,
      loop: true,
      isBgm: true,
    });

    const image = result.project.items.find((item) => item.type === 'image');
    expect(image).toMatchObject({
      type: 'image',
      startTime: 2,
      duration: 1,
      src: '/projects/demo/images/logo.png',
      x: 790,
      y: 285,
      opacity: 0.8,
      blendMode: 'multiply',
    });
    expect(result.imagePlacements).toHaveLength(1);
    expect(result.imagePlacements[0]).toMatchObject({
      src: '/projects/demo/images/logo.png',
      zoom: 1.5,
      centerX: 150,
      centerY: -75,
      frameWidth: 1920,
      frameHeight: 1080,
    });

    expect(result.project.timeline.videoPath).toBe('/projects/demo/video/background.mp4');
    expect(result.project.timeline.videoVolume).toBe(0.4);
    expect(result.project.timeline.videoSpeed).toBe(1.5);
    expect(result.project.timeline.videoOffset).toBe(2.5);
    expect(result.project.notes).toContain('3 unsupported item(s) skipped');
    // Voice length (4s) ends before the text (2s) and audio (10s), so the
    // timeline duration follows the longest item.
    expect(result.project.timeline.duration).toBeGreaterThanOrEqual(10);
  });

  it('accepts older singular Timeline files with a BOM', () => {
    const legacy = {
      Timeline: {
        Name: 'Legacy',
        Length: 1,
        VideoInfo: { FPS: 30, Width: 1280, Height: 720 },
        Items: [
          {
            $type: 'YukkuriMovieMaker.Project.Items.VoiceItem, YukkuriMovieMaker',
            Frame: 45,
            Length: 90,
            Serif: 'おはようなのだ',
            CharacterName: 'ずんだもん',
          },
        ],
      },
    };
    const result = parseYmmpProject(`\uFEFF${JSON.stringify(legacy)}`, {
      existingCharacters: [character],
    });
    expect(result.stats.fps).toBe(30);
    expect(result.project.items).toHaveLength(1);
    expect(result.project.items[0]).toMatchObject({
      type: 'voice',
      startTime: 1.5,
      duration: 3,
    });
    // The bogus 1-frame timeline length must not shrink the project.
    expect(result.project.timeline.duration).toBeGreaterThanOrEqual(3.4);
    expect(result.project.timeline.fps).toBe(30);
  });

  it('imports background video volume, speed, offset and span', () => {
    const content = JSON.stringify({
      Timeline: {
        Name: 'Video',
        Length: 0,
        VideoInfo: { FPS: 30, Width: 1920, Height: 1080 },
        Items: [
          {
            $type: 'YukkuriMovieMaker.Project.Items.VideoItem, YukkuriMovieMaker',
            Frame: 0,
            Length: 300,
            FilePath: 'clip.mp4',
            Volume: 25,
            PlaybackRate: 200,
            ContentOffset: '00:00:01.2500000',
          },
        ],
      },
    });
    const result = parseYmmpProject(content, { assetBaseDir: '/videos' });
    expect(result.project.timeline).toMatchObject({
      videoPath: '/videos/clip.mp4',
      videoVolume: 0.25,
      videoSpeed: 2,
      videoOffset: 1.25,
    });
    // The background video is not a timeline item, but its span must still
    // keep the project long enough for the whole recording.
    expect(result.project.timeline.duration).toBeGreaterThanOrEqual(10);
  });

  it('imports shape items with size, aspect, stroke and brush colours', () => {
    const content = JSON.stringify({
      Timeline: {
        Name: 'Shapes',
        VideoInfo: { FPS: 30, Width: 1920, Height: 1080 },
        Items: [
          {
            $type: 'YukkuriMovieMaker.Project.Items.ShapeItem, YukkuriMovieMaker',
            ShapeType: 'Quadrilateral',
            ShapeParameter: {
              $type:
                'YukkuriMovieMaker.Project.Items.RectangleShapeParameter, YukkuriMovieMaker',
              SizeMode: 'SizeAspect',
              Size: { Values: [{ Value: 400 }] },
              AspectRate: { Values: [{ Value: 50 }] },
              StrokeThickness: { Values: [{ Value: 800 }] },
              Stroke: '#FFFFFFFF',
              Brush: {
                Type: 'SolidColorBrush',
                Parameter: { Color: '#FF3366CC' },
              },
            },
            X: { Values: [{ Value: 100 }] },
            Y: { Values: [{ Value: 50 }] },
            Zoom: { Values: [{ Value: 200 }] },
            Opacity: { Values: [{ Value: 80 }] },
            Rotation: { Values: [{ Value: 15 }] },
            FadeIn: 0.2,
            Blend: 'Add',
            Frame: 30,
            Length: 60,
            Layer: 2,
          },
          {
            $type: 'YukkuriMovieMaker.Project.Items.ShapeItem, YukkuriMovieMaker',
            ShapeType: 'Triangle',
            ShapeParameter: {
              $type:
                'YukkuriMovieMaker.Project.Items.TriangleShapeParameter, YukkuriMovieMaker',
              SizeMode: 'SizeAspect',
              Size: { Values: [{ Value: 250 }] },
              AspectRate: { Values: [{ Value: 0 }] },
              StrokeThickness: { Values: [{ Value: 0 }] },
              Stroke: '#00FFFFFF',
            },
            Frame: 0,
            Length: 30,
          },
          {
            $type: 'YukkuriMovieMaker.Project.Items.ShapeItem, YukkuriMovieMaker',
            ShapeType: 'Star',
            ShapeParameter: { Size: { Values: [{ Value: 200 }] } },
            Frame: 0,
            Length: 30,
          },
        ],
      },
    });
    const result = parseYmmpProject(content);

    expect(result.stats).toMatchObject({ shapes: 2, skipped: 1, total: 3 });
    const rectangle = result.project.items.find((item) => item.id === 'ymmp_shape_0');
    expect(rectangle).toMatchObject({
      type: 'shape',
      shape: 'rectangle',
      startTime: 1,
      duration: 2,
      x: 760,
      y: 440,
      width: 800,
      height: 400,
      fillColor: '#3366cc',
      strokeColor: '#ffffff',
      strokeWidth: 8,
      opacity: 0.8,
      rotation: 15,
      fadeIn: 0.2,
      blendMode: 'add',
    });
    const triangle = result.project.items.find((item) => item.id === 'ymmp_shape_1');
    expect(triangle).toMatchObject({
      type: 'shape',
      shape: 'triangle',
      width: 250,
      height: 250,
      fillColor: 'none',
      strokeColor: undefined,
      strokeWidth: 0,
    });
    expect(result.project.items.some((item) => item.type === 'shape')).toBe(true);
    expect(result.project.notes).toContain('2 shape items');
  });

  it('creates characters from YMM4 names and colours', () => {
    const content = JSON.stringify({
      Timelines: [
        {
          Name: 'Cast',
          VideoInfo: { FPS: 30, Width: 1920, Height: 1080 },
          Items: [
            {
              $type: 'YukkuriMovieMaker.Project.Items.VoiceItem, YukkuriMovieMaker',
              Frame: 0,
              Length: 30,
              Serif: 'テスト',
              CharacterName: '四国めたん',
            },
          ],
        },
      ],
      Characters: [{ Name: '四国めたん', Color: '#FFAB12CD', Voice: { API: 'COEIROINK' } }],
    });
    const result = parseYmmpProject(content);
    expect(result.project.characters).toHaveLength(1);
    const created = result.project.characters[0];
    expect(created.name).toBe('四国めたん');
    expect(created.ttsProviderId).toBe('coeiroink');
    expect(created.subtitleStyle.outerStrokeColor).toBe('#ab12cd');
    expect(result.stats.characters).toBe(1);
  });

  it('skips voice items that have no character fallback', () => {
    const content = JSON.stringify({
      Timelines: [
        {
          Name: 'Empty cast',
          Items: [
            {
              $type: 'YukkuriMovieMaker.Project.Items.VoiceItem, YukkuriMovieMaker',
              Frame: 0,
              Length: 30,
              Serif: 'だれ？',
            },
          ],
        },
      ],
    });
    const result = parseYmmpProject(content);
    expect(result.project.items).toHaveLength(0);
    expect(result.stats.skipped).toBe(1);
  });

  it('rejects empty and malformed input', () => {
    expect(() => parseYmmpProject('')).toThrow(/Empty YMM4 project/);
    expect(() => parseYmmpProject('{not json')).toThrow(/Invalid YMM4 JSON/);
  });
});

describe('parseYmmpTime', () => {
  it('parses YMM4 time spans, plain numbers, and fallbacks', () => {
    expect(parseYmmpTime('00:00:01.5000000')).toBe(1.5);
    expect(parseYmmpTime('01:02:03.25')).toBeCloseTo(3723.25);
    expect(parseYmmpTime('2.5')).toBe(2.5);
    expect(parseYmmpTime(4)).toBe(4);
    expect(parseYmmpTime('nope', 7)).toBe(7);
    expect(parseYmmpTime(-5, 7)).toBe(0);
  });
});

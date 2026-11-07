import { describe, expect, it } from 'vitest';
import { Character, VoixProject } from '../../types';
import { createEmptyProject } from '../projectYaml';
import {
  collectProjectAssets,
  isAuditableAssetPath,
  normalizeAssetPath,
  replaceProjectAssetPath,
} from '../projectAssets';

function makeProject(): VoixProject {
  const project = createEmptyProject('Assets');
  project.timeline.videoPath = '/media/background.mp4';
  project.characters = [
    {
      id: 'char_a',
      name: 'A',
      ttsProviderId: 'voicevox',
      speakerId: 3,
      position: 'left',
      subtitleStyle: {
        textColor: '#fff',
        fontSize: 42,
        fontFamily: 'sans-serif',
        fontWeight: '900',
        strokeColor: '#000',
        strokeWidth: 4,
        bgStyle: 'none',
        yOffsetPercent: 12,
      },
      avatar: {
        idle: '/characters/zundamon.png',
        speaking: '/media/a_talk.png',
        expressions: { smile: '/media/a_smile.png' },
      },
    } satisfies Character,
  ];
  project.items = [
    {
      id: 'img_1',
      type: 'image',
      layer: 3,
      startTime: 0,
      duration: 2,
      name: 'logo',
      src: '/media/logo.png',
      x: 0,
      y: 0,
      width: 100,
      height: 100,
    },
    {
      id: 'img_2',
      type: 'image',
      layer: 3,
      startTime: 2,
      duration: 2,
      name: 'logo copy',
      src: 'file:///media/logo.png',
      x: 0,
      y: 0,
      width: 100,
      height: 100,
    },
    {
      id: 'audio_1',
      type: 'audio',
      layer: 1,
      startTime: 0,
      duration: 4,
      name: 'bgm',
      src: '/media/bgm.mp3',
      volume: 1,
    },
    {
      id: 'video_1',
      type: 'video',
      layer: 0,
      startTime: 0,
      duration: 4,
      name: 'clip',
      src: '/media/clip.mp4',
      volume: 1,
      offsetTime: 0,
    },
    {
      id: 'voice_1',
      type: 'voice',
      layer: 2,
      startTime: 0,
      duration: 1,
      name: 'hello',
      characterId: 'char_a',
      text: 'hello',
    },
  ];
  return project;
}

describe('project asset inventory', () => {
  it('normalises paths and skips bundled or remote references', () => {
    expect(normalizeAssetPath('file:///media/logo.png')).toBe('/media/logo.png');
    expect(normalizeAssetPath('C:\\media\\logo.png')).toBe('C:/media/logo.png');
    expect(isAuditableAssetPath('/media/logo.png')).toBe(true);
    expect(isAuditableAssetPath('https://example.com/logo.png')).toBe(false);
    expect(isAuditableAssetPath('data:image/png;base64,abc')).toBe(false);
    expect(isAuditableAssetPath('/characters/zundamon.png')).toBe(false);
    expect(isAuditableAssetPath('')).toBe(false);
  });

  it('collects timeline, background and avatar references once each', () => {
    const assets = collectProjectAssets(makeProject());
    const byPath = new Map(assets.map((asset) => [asset.path, asset]));

    expect(assets).toHaveLength(6);
    expect(byPath.get('/media/logo.png')).toMatchObject({
      kind: 'image',
      itemIds: ['img_1', 'img_2'],
    });
    expect(byPath.get('/media/background.mp4')).toMatchObject({
      kind: 'video',
      background: true,
    });
    expect(byPath.get('/media/clip.mp4')).toMatchObject({
      kind: 'video',
      itemIds: ['video_1'],
      background: false,
    });
    expect(byPath.get('/media/a_talk.png')).toMatchObject({
      kind: 'character',
      characterIds: ['char_a'],
    });
    expect(byPath.get('/media/a_smile.png')).toMatchObject({
      kind: 'character',
      characterIds: ['char_a'],
    });
    // Bundled art is not listed.
    expect(byPath.has('/characters/zundamon.png')).toBe(false);
  });

  it('relinks every item, background and avatar reference', () => {
    const source = makeProject();
    const next = replaceProjectAssetPath(source, '/media/logo.png', '/new/logo.png');

    expect(next).not.toBe(source);
    expect(source.items[0].type === 'image' && source.items[0].src).toBe('/media/logo.png');
    const image1 = next.items.find((item) => item.id === 'img_1');
    const image2 = next.items.find((item) => item.id === 'img_2');
    expect(image1?.type === 'image' && image1.src).toBe('/new/logo.png');
    expect(image2?.type === 'image' && image2.src).toBe('/new/logo.png');
    const audio = next.items.find((item) => item.id === 'audio_1');
    expect(audio?.type === 'audio' && audio.src).toBe('/media/bgm.mp3');

    const avatarNext = replaceProjectAssetPath(next, '/media/a_smile.png', '/new/smile.png');
    const avatar = avatarNext.characters[0].avatar;
    expect(avatar.expressions?.smile).toBe('/new/smile.png');
    expect(avatar.speaking).toBe('/media/a_talk.png');

    const backgroundNext = replaceProjectAssetPath(avatarNext, '/media/background.mp4', '/new/bg.mp4');
    expect(backgroundNext.timeline.videoPath).toBe('/new/bg.mp4');
  });

  it('returns the original project when the path is not referenced', () => {
    const source = makeProject();
    expect(replaceProjectAssetPath(source, '/missing.png', '/new.png')).toBe(source);
  });
});

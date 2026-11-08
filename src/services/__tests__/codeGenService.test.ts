import { describe, it, expect } from 'vitest';
import {
  generateJavaScriptScript,
  generateScreenplayScript,
  generateTypeDefinition,
  generateVoixJsLibrary,
  evaluateJavaScriptScript,
  generateStructuredCodebaseScript,
  openInExternalEditor,
  generateCodeProject,
} from '../codeGenService';
import { createEmptyProject, DEFAULT_SUBTITLE_STYLE } from '../../utils/projectYaml';
import { Character, VoiceItem } from '../../types';

describe('codeGenService', () => {
  const characters: Character[] = [
    {
      id: 'zundamon',
      name: 'ずんだもん',
      speakerId: 3,
      ttsProviderId: 'voicevox',
      position: 'left',
      avatar: { idle: '/zunda.png' },
      subtitleStyle: DEFAULT_SUBTITLE_STYLE,
    },
    {
      id: 'metan',
      name: '四国めたん',
      speakerId: 2,
      ttsProviderId: 'voicevox',
      position: 'right',
      avatar: { idle: '/metan.png' },
      subtitleStyle: DEFAULT_SUBTITLE_STYLE,
    },
  ];

  it('generates structured script for project', () => {
    const project = createEmptyProject('Demo Video');
    const result = generateStructuredCodebaseScript(project);

    expect(result).toContain('VOIX VIDEO STUDIO — CODE GENERATOR OUTPUT');
    expect(result).toContain('title: "Demo Video"');
  });

  it('generates modern fluent JavaScript script with named character calls and no spammy pauses', () => {
    const project = createEmptyProject('Demo Video');
    project.characters = characters;
    const voice1: VoiceItem = {
      id: 'v1',
      name: 'ずんだもん',
      layer: 0,
      type: 'voice',
      characterId: 'zundamon',
      startTime: 0,
      duration: 1.5,
      text: 'こんにちはなのだ！',
      expression: 'smile',
      anim: 'bounce',
    };
    const voice2: VoiceItem = {
      id: 'v2',
      name: '四国めたん',
      layer: 0,
      type: 'voice',
      characterId: 'metan',
      startTime: 2.5, // 1.0s gap
      duration: 1.2,
      text: 'よろしくね。',
    };
    project.items = [voice1, voice2];

    const js = generateJavaScriptScript(project);
    expect(js).toContain('import { config, zundamon, metan');
    expect(js).toContain('title: "Demo Video"');
    expect(js).toContain('zundamon.smile("こんにちはなのだ！", {"anim":"bounce"});');
    expect(js).toContain('wait(1);');
    expect(js).toContain('metan("よろしくね。");');
  });

  it('supports classic script generation style for backwards compatibility', () => {
    const project = createEmptyProject('Demo Video');
    project.characters = characters;
    const voice1: VoiceItem = {
      id: 'v1',
      name: 'ずんだもん',
      layer: 0,
      type: 'voice',
      characterId: 'zundamon',
      startTime: 0,
      duration: 1.5,
      text: 'こんにちはなのだ！',
      expression: 'smile',
      anim: 'bounce',
    };
    const voice2: VoiceItem = {
      id: 'v2',
      name: '四国めたん',
      layer: 0,
      type: 'voice',
      characterId: 'metan',
      startTime: 2.5,
      duration: 1.2,
      text: 'よろしくね。',
    };
    project.items = [voice1, voice2];

    const js = generateJavaScriptScript(project, { style: 'classic' });
    expect(js).toContain('z("こんにちはなのだ！", {"expr":"smile","anim":"bounce"});');
    expect(js).toContain('pause(1);');
    expect(js).toContain('m("よろしくね。");');
  });

  it('generates screenplay tagged template script', () => {
    const project = createEmptyProject('Screenplay Test');
    project.characters = characters;
    const voice1: VoiceItem = {
      id: 'v1',
      name: 'ずんだもん',
      layer: 0,
      type: 'voice',
      characterId: 'zundamon',
      startTime: 0,
      duration: 1.5,
      text: 'こんにちはなのだ！',
      expression: 'smile',
      anim: 'bounce',
    };
    project.items = [voice1];

    const sp = generateScreenplayScript(project);
    expect(sp).toContain('dialogue`');
    expect(sp).toContain('zundamon: こんにちはなのだ！ [smile, anim:bounce]');
  });

  it('generates voix.d.ts with type declarations for characters and options', () => {
    const project = createEmptyProject('Test');
    project.characters = characters;

    const dts = generateTypeDefinition(project);
    expect(dts).toContain('export function z(text: string, options?: VoiceOptions): void;');
    expect(dts).toContain('export function m(text: string, options?: VoiceOptions): void;');
    expect(dts).toContain('export function zundamon(text: string, options?: VoiceOptions): void;');
    expect(dts).toContain('export const zundamon: zundamonSpeaker;');
    expect(dts).toContain('export function dialogue(strings: TemplateStringsArray');
    expect(dts).toContain('export type Emotion =');
    expect(dts).toContain('export type Animation =');
  });

  it('generates voix.js library stub', () => {
    const lib = generateVoixJsLibrary();
    expect(lib).toContain('export const config =');
    expect(lib).toContain('export const pause =');
    expect(lib).toContain('export const wait =');
    expect(lib).toContain('export const dialogue =');
    expect(lib).toContain('export const z =');
    expect(lib).toContain('export const m =');
  });

  it('evaluates modern fluent JavaScript and screenplay tagged templates', () => {
    const jsCode = `
      config({
        title: "Modern Fluent Script",
        fps: 60,
      });

      zundamon.smile("こんにちは！", { anim: "bounce" });
      wait(0.5);
      metan.calm("はじめまして。");

      dialogue\`
        zundamon: 画面収録の解説をするのだ！ [excited, anim:bounce]
        metan: 所有権の基本ですね。 [nod]
      \`;
    `;

    const result = evaluateJavaScriptScript(jsCode, characters);
    expect(result.error).toBeUndefined();
    expect(result.title).toBe('Modern Fluent Script');
    expect(result.config?.fps).toBe(60);
    expect(result.items.length).toBe(4);
    expect((result.items[0] as VoiceItem).text).toBe('こんにちは！');
    expect((result.items[0] as VoiceItem).characterId).toBe('zundamon');
    expect((result.items[0] as VoiceItem).expression).toBe('smile');
    expect((result.items[2] as VoiceItem).text).toBe('画面収録の解説をするのだ！');
    expect((result.items[2] as VoiceItem).characterId).toBe('zundamon');
    expect((result.items[3] as VoiceItem).text).toBe('所有権の基本ですね。');
    expect((result.items[3] as VoiceItem).characterId).toBe('metan');
  });

  it('evaluates JavaScript script with loops and functions', () => {
    const jsCode = `
      config({
        title: "Script Evaluation Test",
        fps: 60,
      });

      const lines = ["Line 1", "Line 2", "Line 3"];
      for (const line of lines) {
        z(line, { expr: "smile" });
        pause(0.5);
      }

      m("Final line!");
    `;

    const result = evaluateJavaScriptScript(jsCode, characters);
    expect(result.error).toBeUndefined();
    expect(result.title).toBe('Script Evaluation Test');
    expect(result.config?.fps).toBe(60);
    expect(result.items.length).toBe(4);
    expect((result.items[0] as VoiceItem).text).toBe('Line 1');
    expect((result.items[0] as VoiceItem).characterId).toBe('zundamon');
    expect((result.items[0] as VoiceItem).expression).toBe('smile');
    expect((result.items[3] as VoiceItem).text).toBe('Final line!');
    expect((result.items[3] as VoiceItem).characterId).toBe('metan');
    expect(result.items[1].startTime).toBeGreaterThan(result.items[0].startTime);
  });

  it('handles syntax errors gracefully in evaluateJavaScriptScript', () => {
    const badCode = `
      z("broken code"
    `;
    const result = evaluateJavaScriptScript(badCode, characters);
    expect(result.error).toBeDefined();
    expect(result.items).toHaveLength(0);
  });

  it('runs mock functions in non-tauri mode', async () => {
    const res = await openInExternalEditor('/path/to/project');
    expect(res).toContain('Mock');

    const gen = await generateCodeProject('/dir', 'test', 'console.log()', 'js');
    expect(gen).toContain('Mock');
  });
});

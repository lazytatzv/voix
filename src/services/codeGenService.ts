import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { Character, TimelineItem, VoiceItem, VoixProject } from '../types';
import { isTauriRuntime } from './audioCache';
import { serializeScriptToYaml } from '../utils/scriptParser';

export interface FileChangeEventPayload {
  path: string;
  content: string;
}

export interface EvaluatedScriptResult {
  items: TimelineItem[];
  title?: string;
  config?: Partial<VoixProject['timeline']>;
  error?: string;
}

/**
 * Generates an idiomatic, clean JavaScript/TypeScript script from a VoixProject.
 * Supports loops, functions, variables, and full VS Code IntelliSense.
 */
export function generateJavaScriptScript(project: VoixProject): string {
  const chars = project.characters;
  const charImports = chars.map((c) => c.id.slice(0, 1).toLowerCase());
  const uniqueImports = Array.from(new Set(charImports));

  const header = `// ==============================================================================
//  VOIX VIDEO STUDIO — JAVASCRIPT / TYPESCRIPT SCRIPT
//  Edit freely in VS Code / Cursor / Neovim. Saves (Ctrl+S) live-reload Voix Studio!
//  Supports loops, functions, variables, and full TypeScript autocompletion.
// ==============================================================================
import { config, ${uniqueImports.join(', ')}, pause, cmd, se } from './voix.js';

config({
  title: ${JSON.stringify(project.name || 'Untitled')},
  resolution: [${project.timeline.width || 1920}, ${project.timeline.height || 1080}],
  fps: ${project.timeline.fps || 30},
  video: ${JSON.stringify(project.timeline.videoPath || '')},
});

`;

  const voiceItems = project.items.filter((it): it is VoiceItem => it.type === 'voice');
  const bodyLines: string[] = [];

  voiceItems.forEach((item, index) => {
    const char = chars.find((c) => c.id === item.characterId) || chars[0];
    const prefix = char.id.slice(0, 1).toLowerCase();

    // Preserve natural pause gap before line if >= 0.3s
    if (index > 0) {
      const prev = voiceItems[index - 1];
      const gap = item.startTime - (prev.startTime + prev.duration);
      if (gap >= 0.3) {
        bodyLines.push(`pause(${Number(gap.toFixed(2))});`);
      }
    }

    const opts: Record<string, any> = {};
    if (item.expression && item.expression !== 'default') opts.expr = item.expression;
    if (item.speedScale && Math.abs(item.speedScale - 1.0) > 0.01) opts.speed = item.speedScale;
    if (item.pitchScale && Math.abs(item.pitchScale) > 0.01) opts.pitch = item.pitchScale;
    if (item.anim && item.anim !== 'none') opts.anim = item.anim;
    if (item.se) opts.se = item.se;
    if (item.terminal?.cmd) {
      opts.cmd = item.terminal.cmd;
      if (item.terminal.output) opts.output = item.terminal.output;
    }

    const optsStr = Object.keys(opts).length > 0 ? `, ${JSON.stringify(opts)}` : '';
    bodyLines.push(`${prefix}(${JSON.stringify(item.text)}${optsStr});`);
  });

  return header + bodyLines.join('\n') + '\n';
}

/**
 * Generates `voix.d.ts` for full VS Code / Cursor / Neovim IntelliSense.
 */
export function generateTypeDefinition(project: VoixProject): string {
  const chars = project.characters;
  const charDecls = chars
    .map((c) => {
      const prefix = c.id.slice(0, 1).toLowerCase();
      return `/**
 * Speak dialogue as ${c.name} (${c.id})
 * @param text The spoken Japanese text
 * @param options Emotion, speed, pitch, sound effect, terminal command
 */
export function ${prefix}(text: string, options?: VoiceOptions): void;
export function ${c.id}(text: string, options?: VoiceOptions): void;`;
    })
    .join('\n\n');

  return `// Voix Video Studio TypeScript Definitions
// Provides complete IntelliSense in VS Code, Neovim, and WebStorm.

export type Emotion = 'default' | 'smile' | 'shock' | 'trouble' | 'angry';
export type Animation = 'none' | 'bounce' | 'nod' | 'screen-shake' | 'sway';
export type SoundEffect =
  | 'pop'
  | 'chime'
  | 'boom'
  | 'punch'
  | 'slash'
  | 'question'
  | 'shock'
  | 'applause'
  | 'enter'
  | 'keyboard'
  | (string & {});

export interface VoiceOptions {
  /** Facial expression of the character */
  expr?: Emotion;
  /** Speech playback speed scale (e.g. 1.0, 1.2) */
  speed?: number;
  /** Voice pitch offset */
  pitch?: number;
  /** Tachie movement animation */
  anim?: Animation;
  /** Sound effect played with this line */
  se?: SoundEffect;
  /** Simulated dev terminal command overlay */
  cmd?: string;
  /** Simulated command execution output */
  output?: string;
}

export interface VideoConfig {
  title?: string;
  resolution?: [number, number];
  fps?: number;
  video?: string;
  background?: string;
  videoVolume?: number;
}

/** Set video project metadata, resolution, background recording */
export function config(options: VideoConfig): void;

/** Pause timeline for specified seconds */
export function pause(seconds: number): void;
export function wait(seconds: number): void;

/** Play a standalone sound effect */
export function se(name: SoundEffect, duration?: number): void;

/** Quick terminal command execution card */
export function cmd(command: string, dialogue?: string, options?: VoiceOptions): void;

${charDecls}
`;
}

/**
 * Generates `voix.js` runtime module stub.
 */
export function generateVoixJsLibrary(): string {
  return `// Voix runtime module stub for VS Code ES modules
export const voix = globalThis.__voix_context__ || {};
export const config = (...args) => voix.config?.(...args);
export const pause = (...args) => voix.pause?.(...args);
export const wait = (...args) => voix.wait?.(...args);
export const se = (...args) => voix.se?.(...args);
export const cmd = (...args) => voix.cmd?.(...args);
export const z = (...args) => voix.z?.(...args);
export const m = (...args) => voix.m?.(...args);
export default voix;
`;
}

/**
 * Evaluates a user JavaScript / TypeScript script and generates timeline items.
 * Supports loops, functions, variables, and custom logic.
 */
export function evaluateJavaScriptScript(
  code: string,
  characters: Character[]
): EvaluatedScriptResult {
  const items: TimelineItem[] = [];
  let currentTime = 0;
  const configObj: Partial<VoixProject['timeline']> & { title?: string } = {};

  const charMap: Record<string, Character> = {};
  characters.forEach((c, idx) => {
    const key = c.id.slice(0, 1).toLowerCase();
    if (!charMap[key]) charMap[key] = c;
    charMap[c.id] = c;
    charMap[`char${idx}`] = c;
  });

  const createSpeaker = (character: Character) => {
    return (text: string, options: any = {}) => {
      const dur = Math.max(0.6, (text.length || 1) * 0.18 * (1 / (options.speed || 1.0)));
      const voiceItem: VoiceItem = {
        id: `voice_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        type: 'voice',
        name: character.name,
        layer: 0,
        characterId: character.id,
        startTime: Number(currentTime.toFixed(2)),
        duration: Number(dur.toFixed(2)),
        text: String(text || ''),
        expression: options.expr || options.expression || 'default',
        speedScale: options.speed ?? 1.0,
        pitchScale: options.pitch ?? 0.0,
        anim: options.anim || 'none',
        se: options.se,
        terminal: options.cmd ? { cmd: options.cmd, output: options.output } : undefined,
      };
      items.push(voiceItem);
      currentTime = Number((currentTime + dur + 0.15).toFixed(2));
      return voiceItem;
    };
  };

  const sandbox: Record<string, any> = {
    config: (cfg: any) => {
      if (!cfg || typeof cfg !== 'object') return;
      if (cfg.title) configObj.title = cfg.title;
      if (cfg.video || cfg.background) configObj.videoPath = cfg.video || cfg.background;
      if (cfg.fps) configObj.fps = cfg.fps;
      if (Array.isArray(cfg.resolution)) {
        configObj.width = cfg.resolution[0];
        configObj.height = cfg.resolution[1];
      }
    },
    pause: (sec: number) => {
      currentTime = Number((currentTime + Math.max(0, Number(sec) || 0)).toFixed(2));
    },
    wait: (sec: number) => {
      currentTime = Number((currentTime + Math.max(0, Number(sec) || 0)).toFixed(2));
    },
    se: (name: string, duration = 1.0) => {
      items.push({
        id: `se_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        type: 'audio',
        name: `SE: ${name}`,
        layer: 1,
        volume: 1.0,
        startTime: Number(currentTime.toFixed(2)),
        duration: Math.max(0.2, Number(duration) || 1.0),
        src: name,
      });
    },
    cmd: (command: string, dialogue?: string, options: any = {}) => {
      const char = charMap['z'] || characters[0];
      const speakerFn = createSpeaker(char);
      speakerFn(dialogue || command, {
        ...options,
        cmd: command,
        se: options.se || 'keyboard',
        anim: options.anim || 'bounce',
      });
    },
  };

  characters.forEach((c) => {
    const fn = createSpeaker(c);
    sandbox[c.id] = fn;
    const prefix = c.id.slice(0, 1).toLowerCase();
    sandbox[prefix] = fn;
  });

  // Strip ES module imports/exports if present in user code for new Function execution
  const cleanCode = code
    .replace(/^import\s+.*?;?\s*$/gm, '')
    .replace(/^export\s+default\s+/gm, '')
    .replace(/^export\s+(const|let|var|function)\s+/gm, '$1 ');

  try {
    const fnNames = Object.keys(sandbox);
    const fnValues = Object.values(sandbox);
    const runner = new Function(...fnNames, cleanCode);
    runner(...fnValues);
    return { items, title: configObj.title, config: configObj };
  } catch (err: any) {
    return { items: [], error: String(err?.message || err) };
  }
}

/**
 * Formats a VoixProject into a clean, human-readable script codebase.
 */
export function generateStructuredCodebaseScript(project: VoixProject): string {
  const voiceItems = project.items.filter((it): it is VoiceItem => it.type === 'voice');
  const lines = serializeScriptToYaml(voiceItems, project.characters);

  return `# ==============================================================================
#  VOIX VIDEO STUDIO — CODE GENERATOR OUTPUT
# ==============================================================================
/* USER CODE BEGIN CONFIG */
title: "${project.name}"
resolution: [${project.timeline.width || 1920}, ${project.timeline.height || 1080}]
fps: ${project.timeline.fps || 60}
video: "${project.timeline.videoPath || ''}"
/* USER CODE END CONFIG */

/* USER CODE BEGIN CHARACTERS */
characters:
${project.characters
  .map(
    (c) =>
      `  - id: ${c.id}\n    name: "${c.name}"\n    speakerId: ${c.speakerId ?? 3}\n    prefix: "${c.id.slice(0, 1)}"`
  )
  .join('\n')}
/* USER CODE END CHARACTERS */

/* USER CODE BEGIN SCRIPT */
script:
${lines
  .split('\n')
  .map((l) => (l.trim() ? `  ${l}` : ''))
  .join('\n')}
/* USER CODE END SCRIPT */
`;
}

export async function openInExternalEditor(path: string): Promise<string> {
  if (!isTauriRuntime()) return 'Mock: Opened in external editor';
  return invoke<string>('open_in_external_editor', { path });
}

export async function generateCodeProject(
  targetDir: string,
  projectName: string,
  scriptCode: string,
  format: 'js' | 'yaml' = 'js',
  typeDef?: string,
  voixLib?: string
): Promise<string> {
  if (!isTauriRuntime()) return 'Mock: Project generated in browser mode';
  return invoke<string>('generate_vscode_project', {
    targetDir,
    projectName,
    scriptCode,
    format,
    typeDef,
    voixLib,
  });
}

export async function startWatchingFile(
  filePath: string,
  onFileChanged: (payload: FileChangeEventPayload) => void
): Promise<UnlistenFn | null> {
  if (!isTauriRuntime()) return null;

  const unlisten = await listen<FileChangeEventPayload>('file-changed:script', (event) => {
    if (event.payload.path === filePath) {
      onFileChanged(event.payload);
    }
  });

  try {
    await invoke('start_file_watcher', { filePath });
  } catch (err) {
    unlisten();
    throw err;
  }

  return unlisten;
}

export async function stopWatchingFile(filePath: string): Promise<void> {
  if (!isTauriRuntime()) return;
  await invoke('stop_file_watcher', { filePath });
}

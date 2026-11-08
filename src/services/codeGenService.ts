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

export interface GenerateScriptOptions {
  style?: 'fluent' | 'screenplay' | 'classic';
}

/**
 * Generates an idiomatic, clean JavaScript/TypeScript script from a VoixProject.
 * Supports fluent emotion calls (e.g. zundamon.smile("...")), natural speech timing
 * (no spammy pause() calls), screenplay DSL, and full VS Code IntelliSense.
 */
export function generateJavaScriptScript(
  project: VoixProject,
  options: GenerateScriptOptions = {}
): string {
  if (options.style === 'screenplay') {
    return generateScreenplayScript(project);
  }

  const chars = project.characters;
  const isClassic = options.style === 'classic';

  const charIdentifiers = chars.map((c) => c.id.replace(/[^a-zA-Z0-9_$]/g, '_'));
  const shortAliases = chars.map((c) => c.id.slice(0, 1).toLowerCase());
  const importList = Array.from(new Set([...charIdentifiers, ...shortAliases]));

  const header = `// ==============================================================================
//  VOIX VIDEO STUDIO — JAVASCRIPT SCRIPT
//  Edit freely in VS Code / Cursor / Neovim. Saves live-reload Voix Studio!
//  Supports fluent emotion methods (e.g. zundamon.smile("...")), loops, logic, and full TS types.
// ==============================================================================
import { config, ${importList.join(', ')}, scene, dialogue, wait, pause, cmd, se } from './voix.js';

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
    const cleanId = char ? char.id.replace(/[^a-zA-Z0-9_$]/g, '_') : 'speaker';
    const caller = isClassic ? (char ? char.id.slice(0, 1).toLowerCase() : 'z') : cleanId;

    // Only emit wait/pause if there is a deliberate, significant pause (>= 0.8s, or >= 0.3s in classic)
    const threshold = isClassic ? 0.3 : 0.8;
    if (index > 0) {
      const prev = voiceItems[index - 1];
      const gap = item.startTime - (prev.startTime + prev.duration);
      if (gap >= threshold) {
        const gapVal = Number(gap.toFixed(2));
        bodyLines.push(isClassic ? `pause(${gapVal});` : `wait(${gapVal});`);
      }
    }

    const opts: Record<string, any> = {};
    let method = '';
    const validMethods = ['smile', 'shock', 'troubled', 'angry', 'excited', 'whisper', 'serious'];
    const exprKey = item.expression === 'trouble' ? 'troubled' : item.expression;

    if (!isClassic && exprKey && validMethods.includes(exprKey)) {
      method = `.${exprKey}`;
    } else if (item.expression && item.expression !== 'default') {
      opts.expr = item.expression;
    }

    if (item.speedScale && Math.abs(item.speedScale - 1.0) > 0.01) opts.speed = item.speedScale;
    if (item.pitchScale && Math.abs(item.pitchScale) > 0.01) opts.pitch = item.pitchScale;
    if (item.anim && item.anim !== 'none') opts.anim = item.anim;
    if (item.se) opts.se = item.se;
    if (item.terminal?.cmd) {
      opts.cmd = item.terminal.cmd;
      if (item.terminal.output) opts.output = item.terminal.output;
    }

    const optsStr = Object.keys(opts).length > 0 ? `, ${JSON.stringify(opts)}` : '';
    bodyLines.push(`${caller}${method}(${JSON.stringify(item.text)}${optsStr});`);
  });

  return header + bodyLines.join('\n') + '\n';
}

/**
 * Generates an ultra-readable Screenplay DSL script using tagged template literals.
 */
export function generateScreenplayScript(project: VoixProject): string {
  const voiceItems = project.items.filter((it): it is VoiceItem => it.type === 'voice');
  const chars = project.characters;

  const header = `// ==============================================================================
//  VOIX VIDEO STUDIO — SCREENPLAY SCRIPT
//  Super-fast, plain-text dialogue writing with tagged templates.
// ==============================================================================
import { config, dialogue, wait, cmd, se } from './voix.js';

config({
  title: ${JSON.stringify(project.name || 'Untitled')},
  resolution: [${project.timeline.width || 1920}, ${project.timeline.height || 1080}],
  fps: ${project.timeline.fps || 30},
  video: ${JSON.stringify(project.timeline.videoPath || '')},
});

`;

  const scriptLines: string[] = [];
  voiceItems.forEach((item, index) => {
    const char = chars.find((c) => c.id === item.characterId) || chars[0];
    const charId = char?.id || 'speaker';

    if (index > 0) {
      const prev = voiceItems[index - 1];
      const gap = item.startTime - (prev.startTime + prev.duration);
      if (gap >= 1.0) {
        scriptLines.push(`\n// --- ${Number(gap.toFixed(1))}s pause ---`);
      }
    }

    const tags: string[] = [];
    if (item.expression && item.expression !== 'default') tags.push(item.expression);
    if (item.anim && item.anim !== 'none') tags.push(`anim:${item.anim}`);
    if (item.se) tags.push(`se:${item.se}`);
    if (item.speedScale && Math.abs(item.speedScale - 1.0) > 0.01) tags.push(`speed:${item.speedScale}`);

    const tagStr = tags.length > 0 ? ` [${tags.join(', ')}]` : '';
    scriptLines.push(`  ${charId}: ${item.text}${tagStr}`);
  });

  return (
    header +
    'dialogue`\n' +
    scriptLines.join('\n') +
    '\n`;\n'
  );
}

/**
 * Generates `voix.d.ts` for full VS Code / Cursor / Neovim IntelliSense.
 */
export function generateTypeDefinition(project: VoixProject): string {
  const chars = project.characters;
  const charDecls = chars
    .map((c) => {
      const prefix = c.id.slice(0, 1).toLowerCase();
      const cleanId = c.id.replace(/[^a-zA-Z0-9_$]/g, '_');
      return `/**
 * Speak dialogue as ${c.name} (${c.id})
 */
export interface ${cleanId}Speaker {
  (text: string, options?: VoiceOptions): void;
  smile(text: string, options?: VoiceOptions): void;
  shock(text: string, options?: VoiceOptions): void;
  troubled(text: string, options?: VoiceOptions): void;
  angry(text: string, options?: VoiceOptions): void;
  excited(text: string, options?: VoiceOptions): void;
  whisper(text: string, options?: VoiceOptions): void;
  serious(text: string, options?: VoiceOptions): void;
}
export const ${cleanId}: ${cleanId}Speaker;
export const ${prefix}: ${cleanId}Speaker;
export function ${c.id}(text: string, options?: VoiceOptions): void;
export function ${prefix}(text: string, options?: VoiceOptions): void;`;
    })
    .join('\n\n');

  return `// Voix Video Studio TypeScript Definitions
// Provides complete IntelliSense in VS Code, Neovim, and WebStorm.

export type Emotion = 'default' | 'smile' | 'shock' | 'trouble' | 'troubled' | 'angry' | 'excited' | 'whisper' | 'serious';
export type Animation = 'none' | 'bounce' | 'nod' | 'screen-shake' | 'sway' | 'shake' | 'flash' | 'punch' | 'pop';
export type SoundEffect =
  | 'deden'
  | 'pop'
  | 'piki'
  | 'shakin'
  | 'pinpon'
  | 'chime'
  | 'click'
  | 'keyboard'
  | 'punch'
  | 'bomb'
  | 'shock'
  | 'slash'
  | 'bleep'
  | 'dondon'
  | 'zukoo'
  | 'cymbal'
  | 'applause'
  | (string & {});

export interface VoiceOptions {
  /** Facial expression of the character */
  expr?: Emotion;
  /** Speech playback speed scale (e.g. 1.0, 1.2) */
  speed?: number;
  /** Voice pitch offset */
  pitch?: number;
  /** Intonation scale (0.0 - 2.0) */
  intonation?: number;
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

/** Screenplay tagged template literal for lightning-fast dialogue writing */
export function dialogue(strings: TemplateStringsArray, ...values: any[]): void;
export function screenplay(strings: TemplateStringsArray, ...values: any[]): void;

/** Group timeline dialogue into named scenes */
export function scene(name: string, fn?: () => void): void;

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
export function generateVoixJsLibrary(project?: VoixProject): string {
  const chars = project?.characters ?? [];
  const charNames = Array.from(
    new Set([
      'z',
      'm',
      ...chars.map((c) => c.id.replace(/[^a-zA-Z0-9_$]/g, '_')),
      ...chars.map((c) => c.id.slice(0, 1).toLowerCase()),
    ])
  );

  const charExports = charNames
    .map((name) => `export const ${name} = (...args) => voix.${name}?.(...args);`)
    .join('\n');

  return `// Voix runtime module stub for VS Code ES modules
export const voix = globalThis.__voix_context__ || {};
export const config = (...args) => voix.config?.(...args);
export const pause = (...args) => voix.pause?.(...args);
export const wait = (...args) => voix.wait?.(...args);
export const se = (...args) => voix.se?.(...args);
export const cmd = (...args) => voix.cmd?.(...args);
export const scene = (...args) => voix.scene?.(...args);
export const dialogue = (...args) => voix.dialogue?.(...args);
export const screenplay = (...args) => voix.screenplay?.(...args);
${charExports}
export default voix;
`;
}

/**
 * Evaluates a user JavaScript / TypeScript script and generates timeline items.
 * Supports loops, functions, variables, fluent methods (e.g. zundamon.smile("...")),
 * and screenplay tagged template literals (dialogue`...`).
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
    charMap[c.id.toLowerCase()] = c;
    charMap[`char${idx}`] = c;
  });

  const createSpeaker = (character: Character) => {
    const speakerFn: any = (text: string, options: any = {}) => {
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
        speedScale: options.speed ?? options.speedScale ?? 1.0,
        pitchScale: options.pitch ?? options.pitchScale ?? 0.0,
        intonationScale: options.intonation ?? options.intonationScale ?? 1.0,
        anim: options.anim || 'none',
        se: options.se,
        terminal: options.cmd ? { cmd: options.cmd, output: options.output } : undefined,
      };
      items.push(voiceItem);
      currentTime = Number((currentTime + dur + 0.15).toFixed(2));
      return voiceItem;
    };

    const emotions = [
      'smile',
      'shock',
      'troubled',
      'trouble',
      'angry',
      'excited',
      'whisper',
      'serious',
      'calm',
    ];
    emotions.forEach((expr) => {
      speakerFn[expr] = (text: string, opts: any = {}) => {
        return speakerFn(text, { ...opts, expr: expr === 'troubled' ? 'trouble' : expr });
      };
    });

    return speakerFn;
  };

  const parseScreenplay = (strings: TemplateStringsArray | string[], ...values: any[]) => {
    let raw = '';
    const arr = Array.isArray(strings) ? strings : [String(strings)];
    for (let i = 0; i < arr.length; i++) {
      raw += arr[i];
      if (i < values.length) raw += String(values[i] ?? '');
    }
    const lines = raw.split('\n');
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || line.startsWith('//') || line.startsWith('#')) continue;
      const match = line.match(/^([a-zA-Z0-9_\u3040-\u30ff\u4e00-\u9faf]+)\s*[:：]\s*(.+)$/);
      if (match) {
        const charRef = match[1].trim().toLowerCase();
        let speech = match[2].trim();
        const targetChar =
          characters.find(
            (c) =>
              c.id.toLowerCase() === charRef ||
              c.name.toLowerCase() === charRef ||
              c.id.slice(0, 1).toLowerCase() === charRef
          ) || characters[0];

        const opts: any = {};
        const tagMatch = speech.match(/\s*\[([^\]]+)\]\s*$/);
        if (tagMatch) {
          const tagContent = tagMatch[1];
          speech = speech.slice(0, tagMatch.index).trim();
          const tags = tagContent.split(',').map((t) => t.trim());
          for (const tag of tags) {
            if (tag.includes(':')) {
              const [k, v] = tag.split(':').map((s) => s.trim());
              opts[k] = isNaN(Number(v)) ? v : Number(v);
            } else if (tag.includes('=')) {
              const [k, v] = tag.split('=').map((s) => s.trim());
              opts[k] = isNaN(Number(v)) ? v : Number(v);
            } else {
              const lowerTag = tag.toLowerCase();
              if (['smile', 'shock', 'trouble', 'troubled', 'angry'].includes(lowerTag)) {
                opts.expr = lowerTag === 'troubled' ? 'trouble' : lowerTag;
              } else if (
                ['bounce', 'nod', 'shake', 'flash', 'punch', 'pop', 'slide', 'fade'].includes(
                  lowerTag
                )
              ) {
                opts.anim = lowerTag;
              } else if (['excited', 'whisper', 'serious', 'calm'].includes(lowerTag)) {
                opts.expr = lowerTag;
              } else {
                opts.se = lowerTag;
              }
            }
          }
        }
        const speaker = sandbox[targetChar.id] || createSpeaker(targetChar);
        speaker(speech, opts);
      }
    }
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
    scene: (_name: string, fn?: () => void) => {
      if (typeof fn === 'function') fn();
    },
    dialogue: parseScreenplay,
    screenplay: parseScreenplay,
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
    cmd: (command: string, dialogueText?: string, options: any = {}) => {
      const char = charMap['z'] || characters[0];
      const speakerFn = sandbox[char.id] || createSpeaker(char);
      speakerFn(dialogueText || command, {
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
    const cleanId = c.id.replace(/[^a-zA-Z0-9_$]/g, '_');
    sandbox[cleanId] = fn;
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

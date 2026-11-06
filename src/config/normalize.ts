import YAML from 'yaml';
import {
  AiProvider,
  AppSettings,
  CONFIG_VERSION,
  DEFAULT_CONFIG,
  ExportPreset,
  HardwareAcceleration,
  ImeBackend,
  ToggleAuto,
  TtsProviderConfig,
  VoixConfig,
} from './types';

export const CONFIG_SCHEMA_FILE = 'config.schema.json';
export const CHARACTERS_SCHEMA_FILE = 'characters.schema.json';

export const CONFIG_HEADER = [
  '# yaml-language-server: $schema=./config.schema.json',
  '# ============================================================',
  '# Voix configuration',
  '#',
  '# Precedence (low -> high):',
  '#   defaults < config.yaml < config.<profile>.yaml < VOIX_* env < CLI flags',
  '#',
  '# Every key below can be edited by hand. Unknown keys are preserved.',
  '# Runtime changes that touch WebKit (safe_mode / dmabuf / ime) need a restart.',
  '# ============================================================',
].join('\n');

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function mergeRecords(base: UnknownRecord, override: UnknownRecord): UnknownRecord {
  const result: UnknownRecord = { ...base };
  for (const [key, value] of Object.entries(override)) {
    if (value === undefined) continue;
    if (isRecord(value) && isRecord(result[key])) {
      result[key] = mergeRecords(result[key], value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

function setAt(target: UnknownRecord, path: string[], value: unknown): void {
  let cursor = target;
  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i];
    if (!isRecord(cursor[key])) cursor[key] = {};
    cursor = cursor[key] as UnknownRecord;
  }
  cursor[path[path.length - 1]] = value;
}

function asString(value: unknown, fallback: string): string {
  if (typeof value === 'string') return value;
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return fallback;
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['1', 'true', 'yes', 'on', 'enabled'].includes(normalized)) return true;
    if (['0', 'false', 'no', 'off', 'disabled'].includes(normalized)) return false;
  }
  return fallback;
}

function asNumber(value: unknown, fallback: number, min = -Infinity, max = Infinity): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function asEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

const AI_PROVIDERS: readonly AiProvider[] = [
  'gemini',
  'remote_ollama',
  'remote_openai',
  'local_persona',
];
const HARDWARE_ACCELERATIONS: readonly HardwareAcceleration[] = ['auto', 'vaapi', 'nvenc', 'cpu'];
const EXPORT_PRESETS: readonly ExportPreset[] = ['ultrafast', 'fast', 'medium', 'slow'];
const TOGGLES: readonly ToggleAuto[] = ['auto', 'on', 'off'];
const IME_BACKENDS: readonly ImeBackend[] = [
  'auto',
  'keep',
  'wayland',
  'fcitx5',
  'fcitx',
  'ibus',
  'simple',
  'xim',
];

/**
 * Earlier releases stored a flat settings.yaml. Convert those keys into the
 * nested shape so users never have to migrate by hand.
 */
function legacyOverrides(raw: UnknownRecord): UnknownRecord {
  const legacy: UnknownRecord = {};

  if (raw.aiProvider !== undefined) setAt(legacy, ['ai', 'provider'], raw.aiProvider);
  if (raw.geminiApiKey !== undefined)
    setAt(legacy, ['ai', 'gemini_api_key'], raw.geminiApiKey);
  if (raw.remoteEndpoint !== undefined)
    setAt(legacy, ['ai', 'ollama', 'endpoint'], raw.remoteEndpoint);
  if (raw.remoteModel !== undefined) setAt(legacy, ['ai', 'ollama', 'model'], raw.remoteModel);
  if (raw.remoteOpenAiEndpoint !== undefined)
    setAt(legacy, ['ai', 'openai', 'endpoint'], raw.remoteOpenAiEndpoint);

  if (raw.ttsProviders !== undefined) setAt(legacy, ['tts', 'providers'], raw.ttsProviders);

  if (raw.exportOutputPath !== undefined)
    setAt(legacy, ['export', 'output'], raw.exportOutputPath);
  if (raw.hardwareAcceleration !== undefined)
    setAt(legacy, ['export', 'hardware_acceleration'], raw.hardwareAcceleration);
  if (raw.exportFps !== undefined) setAt(legacy, ['export', 'fps'], raw.exportFps);
  if (raw.exportWidth !== undefined) setAt(legacy, ['export', 'width'], raw.exportWidth);
  if (raw.exportHeight !== undefined) setAt(legacy, ['export', 'height'], raw.exportHeight);
  if (raw.overlayFps !== undefined) setAt(legacy, ['export', 'overlay_fps'], raw.overlayFps);
  if (raw.exportCrf !== undefined) setAt(legacy, ['export', 'crf'], raw.exportCrf);
  if (raw.exportPreset !== undefined) setAt(legacy, ['export', 'preset'], raw.exportPreset);
  if (raw.backgroundColor !== undefined)
    setAt(legacy, ['export', 'background'], raw.backgroundColor);
  if (raw.autosave !== undefined) setAt(legacy, ['ui', 'autosave'], raw.autosave);
  if (raw.enableTerminalOverlay !== undefined)
    setAt(legacy, ['ui', 'terminal_overlay'], raw.enableTerminalOverlay);

  // New flat aliases, useful for quick hand edits and env overrides.
  if (raw.safeMode !== undefined) setAt(legacy, ['runtime', 'safe_mode'], raw.safeMode);
  if (raw.webkitDmabuf !== undefined)
    setAt(legacy, ['runtime', 'webkit', 'dmabuf'], raw.webkitDmabuf);
  if (raw.webkitCompositing !== undefined)
    setAt(legacy, ['runtime', 'webkit', 'compositing'], raw.webkitCompositing);
  if (raw.imeBackend !== undefined) setAt(legacy, ['runtime', 'ime', 'backend'], raw.imeBackend);
  if (raw.exportWorkdir !== undefined)
    setAt(legacy, ['runtime', 'export_workdir'], raw.exportWorkdir);
  if (raw.exportKeepDays !== undefined)
    setAt(legacy, ['runtime', 'export_keep_days'], raw.exportKeepDays);
  if (raw.exportMinFreeGb !== undefined)
    setAt(legacy, ['runtime', 'export_min_free_gb'], raw.exportMinFreeGb);

  const voicevoxEndpoint = raw.voicevoxEndpoint;
  if (typeof voicevoxEndpoint === 'string' && voicevoxEndpoint.trim()) {
    const providers = Array.isArray(raw.ttsProviders) ? raw.ttsProviders : [];
    const hasVoicevox = providers.some((provider) => isRecord(provider) && provider.id === 'voicevox');
    setAt(
      legacy,
      ['tts', 'providers'],
      hasVoicevox
        ? providers.map((provider) =>
            isRecord(provider) && provider.id === 'voicevox'
              ? { ...provider, endpoint: voicevoxEndpoint }
              : provider
          )
        : [
            ...providers,
            { id: 'voicevox', name: 'VOICEVOX', endpoint: voicevoxEndpoint, enabled: true },
          ]
    );
  }

  return legacy;
}

function normalizeProviders(raw: unknown): TtsProviderConfig[] {
  const source = Array.isArray(raw) && raw.length > 0 ? raw : DEFAULT_CONFIG.tts.providers;
  const seen = new Set<string>();
  const providers: TtsProviderConfig[] = [];

  for (const entry of source) {
    if (!isRecord(entry)) continue;
    const id = asString(entry.id, '').trim();
    const endpoint = asString(entry.endpoint, '').trim();
    if (!id || !endpoint || seen.has(id)) continue;
    seen.add(id);
    providers.push({
      id,
      name: asString(entry.name, id),
      endpoint,
      enabled: asBoolean(entry.enabled, true),
    });
  }

  return providers.length > 0 ? providers : clone(DEFAULT_CONFIG.tts.providers);
}

/** Deep-merge two already parsed YAML documents (profile over base). */
export function mergeRawConfig(base: unknown, override: unknown): unknown {
  return mergeRecords(isRecord(base) ? base : {}, isRecord(override) ? override : {});
}

export function normalizeConfig(raw: unknown): VoixConfig {
  const root = isRecord(raw) ? raw : {};
  const merged = mergeRecords(legacyOverrides(root), root);

  const runtime = isRecord(merged.runtime) ? merged.runtime : {};
  const webkit = isRecord(runtime.webkit) ? runtime.webkit : {};
  const ime = isRecord(runtime.ime) ? runtime.ime : {};
  const ui = isRecord(merged.ui) ? merged.ui : {};
  const timeline = isRecord(ui.timeline) ? ui.timeline : {};
  const ai = isRecord(merged.ai) ? merged.ai : {};
  const ollama = isRecord(ai.ollama) ? ai.ollama : {};
  const openai = isRecord(ai.openai) ? ai.openai : {};
  const tts = isRecord(merged.tts) ? merged.tts : {};
  const exp = isRecord(merged.export) ? merged.export : {};

  return {
    version: CONFIG_VERSION,
    runtime: {
      safe_mode: asBoolean(runtime.safe_mode, DEFAULT_CONFIG.runtime.safe_mode),
      log_level: asEnum(runtime.log_level, ['error', 'warn', 'info', 'debug', 'trace'] as const, 'info'),
      webkit: {
        dmabuf: asEnum(webkit.dmabuf, TOGGLES, DEFAULT_CONFIG.runtime.webkit.dmabuf),
        compositing: asEnum(
          webkit.compositing,
          TOGGLES,
          DEFAULT_CONFIG.runtime.webkit.compositing
        ),
      },
      ime: {
        backend: asEnum(ime.backend, IME_BACKENDS, DEFAULT_CONFIG.runtime.ime.backend),
      },
      export_workdir: asString(
        runtime.export_workdir,
        DEFAULT_CONFIG.runtime.export_workdir
      ),
      export_keep_days: asNumber(
        runtime.export_keep_days,
        DEFAULT_CONFIG.runtime.export_keep_days,
        0,
        3650
      ),
      export_min_free_gb: asNumber(
        runtime.export_min_free_gb,
        DEFAULT_CONFIG.runtime.export_min_free_gb,
        0,
        100000
      ),
    },
    ui: {
      autosave: asBoolean(ui.autosave, DEFAULT_CONFIG.ui.autosave),
      terminal_overlay: asBoolean(
        ui.terminal_overlay,
        DEFAULT_CONFIG.ui.terminal_overlay
      ),
      timeline: {
        snap: asBoolean(timeline.snap, DEFAULT_CONFIG.ui.timeline.snap),
      },
    },
    ai: {
      provider: asEnum(ai.provider, AI_PROVIDERS, DEFAULT_CONFIG.ai.provider),
      gemini_api_key: asString(ai.gemini_api_key, DEFAULT_CONFIG.ai.gemini_api_key),
      ollama: {
        endpoint: asString(ollama.endpoint, DEFAULT_CONFIG.ai.ollama.endpoint),
        model: asString(ollama.model, DEFAULT_CONFIG.ai.ollama.model),
      },
      openai: {
        endpoint: asString(openai.endpoint, DEFAULT_CONFIG.ai.openai.endpoint),
      },
    },
    tts: {
      providers: normalizeProviders(tts.providers),
    },
    export: {
      output: asString(exp.output, DEFAULT_CONFIG.export.output),
      fps: Math.round(asNumber(exp.fps, DEFAULT_CONFIG.export.fps, 1, 120)),
      width: Math.round(asNumber(exp.width, DEFAULT_CONFIG.export.width, 2, 16384)),
      height: Math.round(asNumber(exp.height, DEFAULT_CONFIG.export.height, 2, 16384)),
      overlay_fps: Math.round(
        asNumber(exp.overlay_fps, DEFAULT_CONFIG.export.overlay_fps, 1, 120)
      ),
      crf: Math.round(asNumber(exp.crf, DEFAULT_CONFIG.export.crf, 0, 51)),
      preset: asEnum(exp.preset, EXPORT_PRESETS, DEFAULT_CONFIG.export.preset),
      background: asString(exp.background, DEFAULT_CONFIG.export.background),
      hardware_acceleration: asEnum(
        exp.hardware_acceleration,
        HARDWARE_ACCELERATIONS,
        DEFAULT_CONFIG.export.hardware_acceleration
      ),
    },
  };
}

export function configToAppSettings(config: VoixConfig): AppSettings {
  const voicevox =
    config.tts.providers.find((provider) => provider.id === 'voicevox') ||
    config.tts.providers[0];

  return {
    aiProvider: config.ai.provider,
    geminiApiKey: config.ai.gemini_api_key,
    remoteEndpoint: config.ai.ollama.endpoint,
    remoteModel: config.ai.ollama.model,
    remoteOpenAiEndpoint: config.ai.openai.endpoint,
    voicevoxEndpoint: voicevox?.endpoint ?? '',
    exportOutputPath: config.export.output,
    hardwareAcceleration: config.export.hardware_acceleration,
    exportFps: config.export.fps,
    exportWidth: config.export.width,
    exportHeight: config.export.height,
    overlayFps: config.export.overlay_fps,
    exportCrf: config.export.crf,
    exportPreset: config.export.preset,
    backgroundColor: config.export.background,
    ttsProviders: clone(config.tts.providers),
    autosave: config.ui.autosave,
    enableTerminalOverlay: config.ui.terminal_overlay,
    timelineSnap: config.ui.timeline.snap,
    safeMode: config.runtime.safe_mode,
    runtimeLogLevel: config.runtime.log_level,
    webkitDmabuf: config.runtime.webkit.dmabuf,
    webkitCompositing: config.runtime.webkit.compositing,
    imeBackend: config.runtime.ime.backend,
    exportWorkdir: config.runtime.export_workdir,
    exportKeepDays: config.runtime.export_keep_days,
    exportMinFreeGb: config.runtime.export_min_free_gb,
  };
}

/** Project the flat UI settings back into the authoritative nested config. */
export function applyAppSettings(config: VoixConfig, settings: AppSettings): VoixConfig {
  const next = clone(config);

  if (settings.aiProvider !== undefined) next.ai.provider = settings.aiProvider;
  if (settings.geminiApiKey !== undefined) next.ai.gemini_api_key = settings.geminiApiKey;
  if (settings.remoteEndpoint !== undefined)
    next.ai.ollama.endpoint = settings.remoteEndpoint;
  if (settings.remoteModel !== undefined) next.ai.ollama.model = settings.remoteModel;
  if (settings.remoteOpenAiEndpoint !== undefined)
    next.ai.openai.endpoint = settings.remoteOpenAiEndpoint;

  if (settings.ttsProviders !== undefined) {
    next.tts.providers = normalizeProviders(settings.ttsProviders);
  }
  if (settings.voicevoxEndpoint !== undefined) {
    const endpoint = settings.voicevoxEndpoint.trim();
    const provider = next.tts.providers.find((entry) => entry.id === 'voicevox');
    if (provider) provider.endpoint = endpoint;
    else next.tts.providers.push({ id: 'voicevox', name: 'VOICEVOX', endpoint, enabled: true });
  }

  if (settings.exportOutputPath !== undefined) next.export.output = settings.exportOutputPath;
  if (settings.hardwareAcceleration !== undefined)
    next.export.hardware_acceleration = settings.hardwareAcceleration;
  if (settings.exportFps !== undefined) next.export.fps = settings.exportFps;
  if (settings.exportWidth !== undefined) next.export.width = settings.exportWidth;
  if (settings.exportHeight !== undefined) next.export.height = settings.exportHeight;
  if (settings.overlayFps !== undefined) next.export.overlay_fps = settings.overlayFps;
  if (settings.exportCrf !== undefined) next.export.crf = settings.exportCrf;
  if (settings.exportPreset !== undefined) next.export.preset = settings.exportPreset;
  if (settings.backgroundColor !== undefined) next.export.background = settings.backgroundColor;

  if (settings.autosave !== undefined) next.ui.autosave = settings.autosave;
  if (settings.enableTerminalOverlay !== undefined)
    next.ui.terminal_overlay = settings.enableTerminalOverlay;
  if (settings.timelineSnap !== undefined) next.ui.timeline.snap = settings.timelineSnap;

  if (settings.safeMode !== undefined) next.runtime.safe_mode = settings.safeMode;
  if (settings.runtimeLogLevel !== undefined)
    next.runtime.log_level = settings.runtimeLogLevel;
  if (settings.webkitDmabuf !== undefined)
    next.runtime.webkit.dmabuf = settings.webkitDmabuf;
  if (settings.webkitCompositing !== undefined)
    next.runtime.webkit.compositing = settings.webkitCompositing;
  if (settings.imeBackend !== undefined) next.runtime.ime.backend = settings.imeBackend;
  if (settings.exportWorkdir !== undefined)
    next.runtime.export_workdir = settings.exportWorkdir;
  if (settings.exportKeepDays !== undefined)
    next.runtime.export_keep_days = settings.exportKeepDays;
  if (settings.exportMinFreeGb !== undefined)
    next.runtime.export_min_free_gb = settings.exportMinFreeGb;

  return normalizeConfig(next);
}

const ENV_PATHS: Record<string, string[]> = {
  VOIX_AI_PROVIDER: ['ai', 'provider'],
  VOIX_GEMINI_API_KEY: ['ai', 'gemini_api_key'],
  VOIX_OLLAMA_ENDPOINT: ['ai', 'ollama', 'endpoint'],
  VOIX_OLLAMA_MODEL: ['ai', 'ollama', 'model'],
  VOIX_OPENAI_ENDPOINT: ['ai', 'openai', 'endpoint'],
  VOIX_VOICEVOX_ENDPOINT: ['voicevoxEndpoint'],
  VOIX_EXPORT_OUTPUT: ['export', 'output'],
  VOIX_EXPORT_FPS: ['export', 'fps'],
  VOIX_EXPORT_WIDTH: ['export', 'width'],
  VOIX_EXPORT_HEIGHT: ['export', 'height'],
  VOIX_OVERLAY_FPS: ['export', 'overlay_fps'],
  VOIX_EXPORT_CRF: ['export', 'crf'],
  VOIX_EXPORT_PRESET: ['export', 'preset'],
  VOIX_BACKGROUND_COLOR: ['export', 'background'],
  VOIX_HARDWARE_ACCELERATION: ['export', 'hardware_acceleration'],
  VOIX_AUTOSAVE: ['ui', 'autosave'],
  VOIX_TERMINAL_OVERLAY: ['ui', 'terminal_overlay'],
  VOIX_SAFE_MODE: ['runtime', 'safe_mode'],
  VOIX_DMABUF: ['runtime', 'webkit', 'dmabuf'],
  VOIX_COMPOSITING: ['runtime', 'webkit', 'compositing'],
  VOIX_IME_BACKEND: ['runtime', 'ime', 'backend'],
  VOIX_EXPORT_WORKDIR: ['runtime', 'export_workdir'],
  VOIX_EXPORT_KEEP_DAYS: ['runtime', 'export_keep_days'],
  VOIX_EXPORT_MIN_FREE_GB: ['runtime', 'export_min_free_gb'],
};

export interface EnvOverrideResult {
  config: VoixConfig;
  applied: Record<string, string>;
  warnings: string[];
}

/**
 * Apply VOIX_* environment variables on top of the YAML config. Values are
 * strings, but normalization handles booleans and numbers.
 */
export function applyEnvOverrides(
  config: VoixConfig,
  env: Record<string, string | undefined>
): EnvOverrideResult {
  const overrides: UnknownRecord = {};
  const applied: Record<string, string> = {};
  const warnings: string[] = [];

  for (const [key, path] of Object.entries(ENV_PATHS)) {
    const value = env[key];
    if (value === undefined || value.trim() === '') continue;
    applied[key] = value;
    setAt(overrides, path, value);
  }

  const merged = normalizeConfig(mergeRecords(clone(config) as unknown as UnknownRecord, overrides));

  if (applied.VOIX_SAFE_MODE && !['1', '0', 'true', 'false', 'yes', 'no', 'on', 'off'].includes(applied.VOIX_SAFE_MODE.toLowerCase())) {
    warnings.push(`VOIX_SAFE_MODE=${applied.VOIX_SAFE_MODE} is not a boolean`);
  }
  for (const key of ['VOIX_EXPORT_FPS', 'VOIX_EXPORT_WIDTH', 'VOIX_EXPORT_HEIGHT', 'VOIX_OVERLAY_FPS', 'VOIX_EXPORT_CRF', 'VOIX_EXPORT_KEEP_DAYS', 'VOIX_EXPORT_MIN_FREE_GB']) {
    if (key in applied && !Number.isFinite(Number(applied[key]))) {
      warnings.push(`${key}=${applied[key]} is not a number`);
    }
  }

  return { config: merged, applied, warnings };
}

export function configToYaml(config: VoixConfig): string {
  return `${CONFIG_HEADER}\n${YAML.stringify(config, { indent: 2, lineWidth: 0 })}`;
}

export function configFromYaml(text: string): VoixConfig {
  const parsed = YAML.parse(text);
  return normalizeConfig(parsed);
}

const LEGACY_FLAT_KEYS = [
  'aiProvider',
  'geminiApiKey',
  'remoteEndpoint',
  'remoteModel',
  'remoteOpenAiEndpoint',
  'voicevoxEndpoint',
  'ttsProviders',
  'exportOutputPath',
  'hardwareAcceleration',
  'exportFps',
  'exportWidth',
  'exportHeight',
  'overlayFps',
  'exportCrf',
  'exportPreset',
  'backgroundColor',
  'autosave',
  'enableTerminalOverlay',
  'safeMode',
  'webkitDmabuf',
  'webkitCompositing',
  'imeBackend',
  'exportWorkdir',
  'exportKeepDays',
  'exportMinFreeGb',
];

export function ensureConfigHeader(text: string): string {
  if (text.includes('yaml-language-server')) return text;
  return `${CONFIG_HEADER}\n${text.replace(/^\uFEFF/, '')}`;
}

function flattenLeaves(
  value: unknown,
  prefix: string[] = [],
  result: Array<[string[], unknown]> = []
): Array<[string[], unknown]> {
  if (isRecord(value)) {
    const entries = Object.entries(value);
    if (entries.length === 0 && prefix.length > 0) result.push([prefix, {}]);
    for (const [key, child] of entries) {
      flattenLeaves(child, [...prefix, key], result);
    }
    return result;
  }
  result.push([prefix, value]);
  return result;
}

/**
 * Write a normalized config back into an existing YAML document with
 * `Document.setIn`, so hand-written comments and unknown keys survive a save
 * from the UI. Legacy flat keys are removed to keep a single source of truth.
 */
export function updateConfigYamlText(existingText: string | null, config: VoixConfig): string {
  if (!existingText || !existingText.trim()) return configToYaml(config);

  const doc = YAML.parseDocument(existingText);
  if (doc.errors.length > 0) {
    throw new Error(doc.errors.map((error) => error.message).join('\n'));
  }
  if (!isRecord(doc.toJS())) return configToYaml(config);

  for (const key of LEGACY_FLAT_KEYS) {
    if (doc.has(key)) doc.delete(key);
  }

  for (const [path, value] of flattenLeaves(config)) {
    doc.setIn(path, clone(value));
  }

  const text = ensureConfigHeader(String(doc));
  return text.endsWith('\n') ? text : `${text}\n`;
}

export type CharacterDocument = { characters: unknown[] };

export function parseCharactersYaml(text: string): unknown[] {
  const parsed = YAML.parse(text);
  if (Array.isArray(parsed)) return parsed;
  if (isRecord(parsed) && Array.isArray(parsed.characters)) return parsed.characters;
  throw new Error('characters.yaml must contain a `characters:` list (or a legacy root array)');
}

export function charactersToYaml(characters: unknown[]): string {
  const header = [
    '# yaml-language-server: $schema=./characters.schema.json',
    '# Voix character presets. Edit with care: avatar paths may be large data URLs.',
  ].join('\n');
  return `${header}\n${YAML.stringify({ characters }, { indent: 2, lineWidth: 0 })}`;
}

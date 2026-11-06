import { invoke } from '@tauri-apps/api/core';
import YAML from 'yaml';
import { Character } from '../types';
import { isTauriRuntime } from './audioCache';
import {
  AppSettings,
  BootConfig,
  ConfigSourceInfo,
  DEFAULT_CONFIG,
  DoctorReport,
  VoixConfig,
} from '../config/types';
import {
  applyAppSettings,
  applyEnvOverrides,
  charactersToYaml,
  configToAppSettings,
  configToYaml,
  ensureConfigHeader,
  mergeRawConfig,
  normalizeConfig,
  parseCharactersYaml,
  updateConfigYamlText,
} from '../config/normalize';

export type {
  AppSettings,
  BootConfig,
  ConfigSourceInfo,
  DoctorCheck,
  DoctorReport,
  DoctorStatus,
  TtsProviderConfig,
} from '../config/types';

const CONFIG_FILE = 'config.yaml';
const LEGACY_SETTINGS_FILE = 'settings.yaml';
const LEGACY_SETTINGS_JSON = 'settings.json';
const CHARACTERS_FILE = 'characters.yaml';
const CHARACTERS_JSON_FILE = 'characters.json';
const SETTINGS_KEY = 'voix_app_settings_v2';
const CHARACTERS_KEY = 'voix_characters_config';

export const DEFAULT_APP_SETTINGS: AppSettings = configToAppSettings(DEFAULT_CONFIG);

interface LoadedConfig {
  config: VoixConfig;
  sources: ConfigSourceInfo;
  boot: BootConfig;
}

let cachedBoot: BootConfig | null = null;
let cachedSources: ConfigSourceInfo | null = null;

function joinPath(base: string, file: string): string {
  return `${base.replace(/[\\/]+$/, '')}/${file}`;
}

function browserBootConfig(): BootConfig {
  return {
    configPath: `~/.config/voix/${CONFIG_FILE}`,
    legacyConfigPath: null,
    profile: null,
    profilePath: null,
    configDir: '~/.config/voix',
    cacheDir: '~/.cache/voix',
    dataDir: '~/.local/share/voix',
    exportWorkdir: DEFAULT_CONFIG.runtime.export_workdir,
    safeMode: false,
    webkit: { ...DEFAULT_CONFIG.runtime.webkit },
    ime: {
      backend: 'auto',
      requestedGtkImModule: null,
      effectiveGtkImModule: null,
      warning: null,
    },
    envOverrides: {},
    warnings: [],
  };
}

async function getBootConfig(force = false): Promise<BootConfig> {
  if (!isTauriRuntime()) return browserBootConfig();
  if (cachedBoot && !force) return cachedBoot;

  try {
    cachedBoot = await invoke<BootConfig>('get_boot_config');
    return cachedBoot;
  } catch (err) {
    console.warn('[configService] get_boot_config unavailable, using fallback paths:', err);
    const configDir = await invoke<string>('get_config_dir_path');
    const cacheDir = await invoke<string>('get_cache_dir_path');
    const dataDir = await invoke<string>('get_data_dir_path');
    cachedBoot = {
      ...browserBootConfig(),
      configDir,
      cacheDir,
      dataDir,
      configPath: joinPath(configDir, CONFIG_FILE),
    };
    return cachedBoot;
  }
}

async function pathExists(path: string): Promise<boolean> {
  if (!isTauriRuntime()) return false;
  try {
    return await invoke<boolean>('file_exists', { path });
  } catch {
    return false;
  }
}

async function readText(path: string): Promise<string> {
  return invoke<string>('read_text_file', { path });
}

async function writeText(path: string, content: string): Promise<void> {
  await invoke('write_text_file', { path, content });
}

function parseConfigText(text: string, path: string): unknown {
  try {
    if (path.endsWith('.json')) return JSON.parse(text);
    return YAML.parse(text);
  } catch (err) {
    throw new Error(`Could not parse ${path}: ${String(err)}`);
  }
}

async function readLegacyConfig(boot: BootConfig): Promise<{ raw: unknown; path: string } | null> {
  const candidates = [LEGACY_SETTINGS_FILE, LEGACY_SETTINGS_JSON];
  for (const name of candidates) {
    const path = joinPath(boot.configDir, name);
    if (!(await pathExists(path))) continue;
    try {
      return { raw: parseConfigText(await readText(path), path), path };
    } catch (err) {
      boot.warnings.push(String(err));
    }
  }
  return null;
}

async function readProfileConfig(boot: BootConfig): Promise<unknown> {
  if (!boot.profilePath) return undefined;
  if (!(await pathExists(boot.profilePath))) return undefined;
  return parseConfigText(await readText(boot.profilePath), boot.profilePath);
}

async function readBaseConfig(boot: BootConfig): Promise<{ raw: unknown; legacyPath: string | null }> {
  if (await pathExists(boot.configPath)) {
    return { raw: parseConfigText(await readText(boot.configPath), boot.configPath), legacyPath: null };
  }

  const legacy = await readLegacyConfig(boot);
  if (legacy) return { raw: legacy.raw, legacyPath: legacy.path };

  return { raw: parseConfigText(readLocalSettings(), 'localStorage'), legacyPath: null };
}

function readLocalSettings(): string {
  if (typeof localStorage === 'undefined') return '{}';
  return localStorage.getItem(SETTINGS_KEY) || '{}';
}

function localCharacters(): Character[] | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const local = localStorage.getItem(CHARACTERS_KEY);
    if (!local) return null;
    const parsed = JSON.parse(local);
    return Array.isArray(parsed) && parsed.length > 0 ? (parsed as Character[]) : null;
  } catch {
    return null;
  }
}

function mirrorLocalSettings(settings: AppSettings): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    if (settings.aiProvider) localStorage.setItem('voix_ai_provider', settings.aiProvider);
    if (settings.geminiApiKey) localStorage.setItem('gemini_api_key', settings.geminiApiKey);
    if (settings.remoteEndpoint)
      localStorage.setItem('voix_ai_remote_endpoint', settings.remoteEndpoint);
    if (settings.remoteModel) localStorage.setItem('voix_ai_remote_model', settings.remoteModel);
  } catch (err) {
    console.warn('[configService] localStorage settings skipped:', err);
  }
}

async function loadConfigInternal(): Promise<LoadedConfig> {
  const boot = await getBootConfig();
  const warnings = [...boot.warnings];
  const sources: ConfigSourceInfo = {
    configPath: boot.configPath,
    profilePath: boot.profilePath,
    profile: boot.profile,
    legacyConfigPath: boot.legacyConfigPath,
    envOverrideKeys: Object.keys(boot.envOverrides || {}),
    warnings,
  };

  let config = normalizeConfig(DEFAULT_CONFIG);

  if (isTauriRuntime()) {
    try {
      const base = await readBaseConfig(boot);
      if (base.legacyPath) sources.legacyConfigPath = base.legacyPath;
      const profile = await readProfileConfig(boot);
      const merged = mergeRawConfig(base.raw, profile ?? {});
      const withEnv = applyEnvOverrides(normalizeConfig(merged), boot.envOverrides || {});
      config = withEnv.config;
      warnings.push(...withEnv.warnings);
    } catch (err) {
      warnings.push(`Falling back to defaults: ${String(err)}`);
    }
  } else {
    try {
      const local = readLocalSettings();
      const withEnv = applyEnvOverrides(normalizeConfig(JSON.parse(local)), boot.envOverrides);
      config = withEnv.config;
    } catch {
      config = normalizeConfig(DEFAULT_CONFIG);
    }
  }

  cachedSources = sources;
  cachedBoot = boot;
  return { config, sources, boot };
}

/** Load the effective config (base + profile + environment). */
export async function loadConfig(): Promise<VoixConfig> {
  return (await loadConfigInternal()).config;
}

/** Boot-time paths, profile and resolved runtime warning data. */
export async function loadBootConfig(): Promise<BootConfig> {
  return getBootConfig();
}

export async function loadConfigSources(): Promise<ConfigSourceInfo> {
  if (cachedSources) return cachedSources;
  return (await loadConfigInternal()).sources;
}

export async function loadSettingsFromConfig(): Promise<AppSettings> {
  return configToAppSettings((await loadConfigInternal()).config);
}

async function loadBaseConfigForSave(boot: BootConfig): Promise<VoixConfig> {
  if (await pathExists(boot.configPath)) {
    const text = await readText(boot.configPath);
    return normalizeConfig(parseConfigText(text, boot.configPath));
  }
  const legacy = await readLegacyConfig(boot);
  if (legacy) return normalizeConfig(legacy.raw);
  return normalizeConfig(DEFAULT_CONFIG);
}

async function writeCompatibilityMirrors(boot: BootConfig, config: VoixConfig): Promise<void> {
  const flat = configToAppSettings(config);
  const json = JSON.stringify(flat, null, 2);
  const flatYaml = [
    '# Generated compatibility mirror. Edit config.yaml instead.',
    YAML.stringify(flat, { indent: 2, lineWidth: 0 }),
  ].join('\n');

  if (isTauriRuntime()) {
    await writeText(joinPath(boot.configDir, LEGACY_SETTINGS_FILE), flatYaml);
    try {
      await invoke('save_app_settings', { settingsJson: json });
    } catch (err) {
      console.warn('[configService] Could not write settings.json mirror:', err);
    }
  }
  mirrorLocalSettings(flat);
}

export async function saveSettingsToConfig(settings: AppSettings): Promise<void> {
  const boot = await getBootConfig();

  if (!isTauriRuntime()) {
    const base = normalizeConfig(JSON.parse(readLocalSettings()));
    const next = applyAppSettings(base, settings);
    mirrorLocalSettings(configToAppSettings(next));
    cachedSources = null;
    return;
  }

  const baseConfig = await loadBaseConfigForSave(boot);
  const next = applyAppSettings(baseConfig, settings);
  const existing = (await pathExists(boot.configPath)) ? await readText(boot.configPath) : null;
  const yaml = updateConfigYamlText(existing, next);

  await writeText(boot.configPath, yaml);
  await writeCompatibilityMirrors(boot, next);
  cachedSources = null;
}

/** Raw config.yaml editor support (comments are preserved on save). */
export async function loadRawConfigYaml(): Promise<string> {
  const boot = await getBootConfig();
  if (isTauriRuntime() && (await pathExists(boot.configPath))) {
    return readText(boot.configPath);
  }
  return configToYaml((await loadConfigInternal()).config);
}

export async function saveRawConfigYaml(yamlText: string): Promise<VoixConfig> {
  const doc = YAML.parseDocument(yamlText);
  if (doc.errors.length > 0) {
    throw new Error(doc.errors.map((error) => error.message).join('\n'));
  }
  const parsed = doc.toJS();
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('config.yaml root must be a mapping/object');
  }

  const config = normalizeConfig(parsed);
  const text = ensureConfigHeader(yamlText);

  if (isTauriRuntime()) {
    const boot = await getBootConfig();
    await writeText(boot.configPath, text.endsWith('\n') ? text : `${text}\n`);
    await writeCompatibilityMirrors(boot, config);
    cachedSources = null;
  } else {
    mirrorLocalSettings(configToAppSettings(config));
    cachedSources = null;
  }
  return config;
}

export async function loadCharactersFromConfig(): Promise<Character[] | null> {
  if (isTauriRuntime()) {
    const boot = await getBootConfig();
    const yamlPath = joinPath(boot.configDir, CHARACTERS_FILE);
    try {
      if (await pathExists(yamlPath)) {
        const parsed = parseCharactersYaml(await readText(yamlPath));
        if (parsed.length > 0) return parsed as Character[];
      }
    } catch (err) {
      console.warn(`[configService] Could not load ${CHARACTERS_FILE}:`, err);
    }

    try {
      const jsonStr = await invoke<string>('load_characters_config');
      if (jsonStr && jsonStr.trim() !== '[]' && jsonStr.trim() !== '') {
        const parsed = JSON.parse(jsonStr);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed as Character[];
      }
    } catch (err) {
      console.warn(`[configService] Could not load ${CHARACTERS_JSON_FILE}:`, err);
    }
  }

  return localCharacters();
}

export async function saveCharactersToConfig(characters: Character[]): Promise<void> {
  const json = JSON.stringify(characters, null, 2);
  const yaml = charactersToYaml(characters);

  try {
    localStorage.setItem(CHARACTERS_KEY, json);
  } catch (err) {
    console.warn('[configService] localStorage characters skipped:', err);
  }

  if (!isTauriRuntime()) return;

  const boot = await getBootConfig();
  await writeText(joinPath(boot.configDir, CHARACTERS_FILE), yaml);
  try {
    await invoke('save_characters_config', { charactersJson: json });
  } catch (err) {
    console.warn('[configService] Could not save characters.json mirror:', err);
  }
}

export async function loadRawCharactersYaml(): Promise<string> {
  if (isTauriRuntime()) {
    const boot = await getBootConfig();
    const path = joinPath(boot.configDir, CHARACTERS_FILE);
    if (await pathExists(path)) return readText(path);
    const characters = (await loadCharactersFromConfig()) || [];
    return charactersToYaml(characters);
  }
  return charactersToYaml(localCharacters() || []);
}

export async function saveRawCharactersYaml(yamlText: string): Promise<void> {
  const parsed = parseCharactersYaml(yamlText);
  const characters = parsed as Character[];

  try {
    localStorage.setItem(CHARACTERS_KEY, JSON.stringify(characters, null, 2));
  } catch {}

  if (!isTauriRuntime()) return;

  const boot = await getBootConfig();
  await writeText(
    joinPath(boot.configDir, CHARACTERS_FILE),
    ensureCharactersHeader(yamlText)
  );
  try {
    await invoke('save_characters_config', {
      charactersJson: JSON.stringify(characters, null, 2),
    });
  } catch (err) {
    console.warn('[configService] Could not save characters.json mirror:', err);
  }
}

function ensureCharactersHeader(text: string): string {
  if (text.includes('yaml-language-server')) return text;
  return [
    '# yaml-language-server: $schema=./characters.schema.json',
    '# Voix character presets.',
    text,
  ].join('\n');
}

/** Legacy names kept so third-party snippets and older UI code keep working. */
export const loadRawSettingsJson = loadRawConfigYaml;
export const saveRawSettingsJson = saveRawConfigYaml;

export async function loadRawCharactersJson(): Promise<string> {
  return JSON.stringify(await loadCharactersFromConfig(), null, 2);
}

export async function saveRawCharactersJson(jsonStr: string): Promise<void> {
  const parsed = JSON.parse(jsonStr);
  if (!Array.isArray(parsed)) throw new Error('characters.json root must be an array');
  await saveCharactersToConfig(parsed as Character[]);
}

export async function runDoctorReport(): Promise<DoctorReport> {
  if (!isTauriRuntime()) {
    const loaded = await loadConfigInternal();
    return {
      generatedAt: new Date().toISOString(),
      platform: 'browser',
      checks: [
        {
          id: 'runtime',
          label: 'Tauri runtime',
          status: 'info',
          detail: 'Doctor checks run in the desktop app (pnpm tauri dev / Voix binary).',
        },
      ],
      configSources: loaded.sources,
      boot: loaded.boot,
    };
  }
  return invoke<DoctorReport>('run_doctor_report');
}

export async function openConfigFolder(): Promise<void> {
  try {
    if (isTauriRuntime()) await invoke('open_config_directory');
  } catch (err) {
    console.warn('Could not open config directory:', err);
  }
}

export async function openCacheFolder(): Promise<void> {
  try {
    if (isTauriRuntime()) await invoke('open_cache_directory');
  } catch (err) {
    console.warn('Could not open cache directory:', err);
  }
}

export async function openDataFolder(): Promise<void> {
  try {
    if (isTauriRuntime()) await invoke('open_data_directory');
  } catch (err) {
    console.warn('Could not open data directory:', err);
  }
}

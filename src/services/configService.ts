import { invoke } from '@tauri-apps/api/core';
import YAML from 'yaml';
import { Character } from '../types';
import { isTauriRuntime } from './audioCache';

export interface TtsProviderConfig {
  id: string;
  name: string;
  endpoint: string;
  enabled?: boolean;
}

export interface AppSettings {
  aiProvider?: 'gemini' | 'remote_ollama' | 'remote_openai' | 'local_persona';
  geminiApiKey?: string;
  remoteEndpoint?: string;
  remoteModel?: string;
  remoteOpenAiEndpoint?: string;
  voicevoxEndpoint?: string;
  exportOutputPath?: string;
  hardwareAcceleration?: 'auto' | 'vaapi' | 'nvenc' | 'cpu';
  exportFps?: number;
  exportWidth?: number;
  exportHeight?: number;
  overlayFps?: number;
  exportCrf?: number;
  exportPreset?: 'ultrafast' | 'fast' | 'medium' | 'slow';
  backgroundColor?: string;
  ttsProviders?: TtsProviderConfig[];
  autosave?: boolean;
  /** Show the terminal overlay used for engineering videos. */
  enableTerminalOverlay?: boolean;
}

const SETTINGS_KEY = 'voix_app_settings_v2';
const CHARACTERS_KEY = 'voix_characters_config';
const SETTINGS_FILE = 'settings.yaml';

const DEFAULTS: AppSettings = {
  aiProvider: 'gemini',
  geminiApiKey: '',
  remoteEndpoint: 'http://192.168.1.100:11434',
  remoteModel: 'qwen2.5:latest',
  remoteOpenAiEndpoint: 'http://localhost:8000/v1',
  voicevoxEndpoint: 'http://localhost:50021',
  exportOutputPath: `${'~'}/voix_output.mp4`,
  hardwareAcceleration: 'auto',
  exportFps: 30,
  exportWidth: 1920,
  exportHeight: 1080,
  overlayFps: 15,
  exportCrf: 20,
  exportPreset: 'medium',
  backgroundColor: '#0f0f11',
  autosave: true,
  enableTerminalOverlay: true,
  ttsProviders: [
    { id: 'voicevox', name: 'VOICEVOX', endpoint: 'http://localhost:50021', enabled: true },
    { id: 'coeiroink', name: 'COEIROINK', endpoint: 'http://localhost:50031', enabled: true },
    { id: 'aivis', name: 'AivisSpeech', endpoint: 'http://localhost:10101', enabled: true },
  ],
};

function resolveHome(path: string | undefined): string {
  if (!path) return '';
  if (path.startsWith('~')) return path; // Rust/Node side expands ~ only when used natively
  return path;
}

export async function loadCharactersFromConfig(): Promise<Character[] | null> {
  try {
    if (isTauriRuntime()) {
      const jsonStr = await invoke<string>('load_characters_config');
      if (jsonStr && jsonStr.trim() !== '[]' && jsonStr.trim() !== '') {
        const parsed = JSON.parse(jsonStr);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    }
  } catch (err) {
    console.warn('[configService] Could not load characters.json:', err);
  }

  try {
    const local = localStorage.getItem(CHARACTERS_KEY);
    if (local) {
      const parsed = JSON.parse(local);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {}
  return null;
}

export async function saveCharactersToConfig(characters: Character[]): Promise<void> {
  const json = JSON.stringify(characters, null, 2);
  try {
    localStorage.setItem(CHARACTERS_KEY, json);
  } catch (err) {
    console.warn('[configService] localStorage characters skipped:', err);
  }
  try {
    if (isTauriRuntime()) {
      await invoke('save_characters_config', { charactersJson: json });
    }
  } catch (err) {
    console.warn('[configService] Could not save characters.json:', err);
  }
}

export async function loadSettingsFromConfig(): Promise<AppSettings> {
  let loaded: Partial<AppSettings> = {};

  if (isTauriRuntime()) {
    try {
      const configDir = await invoke<string>('get_config_dir_path');
      const yamlPath = `${configDir}/${SETTINGS_FILE}`;
      const exists = await invoke<boolean>('file_exists', { path: yamlPath });
      if (exists) {
        const text = await invoke<string>('read_text_file', { path: yamlPath });
        loaded = (YAML.parse(text) as Partial<AppSettings>) || {};
      } else {
        // Migrate legacy settings.json once.
        const jsonExists = await invoke<boolean>('file_exists', { path: `${configDir}/settings.json` });
        if (jsonExists) {
          const text = await invoke<string>('read_text_file', { path: `${configDir}/settings.json` });
          loaded = JSON.parse(text) as Partial<AppSettings>;
          await saveSettingsToConfig({ ...DEFAULTS, ...loaded });
        }
      }
    } catch (err) {
      console.warn('[configService] Could not load settings.yaml:', err);
    }
  }

  if (!loaded || Object.keys(loaded).length === 0) {
    try {
      const local = localStorage.getItem(SETTINGS_KEY);
      if (local) loaded = JSON.parse(local) as Partial<AppSettings>;
    } catch {}
  }

  const merged: AppSettings = {
    ...DEFAULTS,
    ...loaded,
    ttsProviders:
      Array.isArray(loaded.ttsProviders) && loaded.ttsProviders.length > 0
        ? loaded.ttsProviders
        : DEFAULTS.ttsProviders,
  };
  merged.exportOutputPath = resolveHome(merged.exportOutputPath);
  return merged;
}

export async function saveSettingsToConfig(settings: AppSettings): Promise<void> {
  const json = JSON.stringify(settings, null, 2);
  const merged = { ...DEFAULTS, ...settings };
  const yaml = YAML.stringify(merged, { indent: 2, lineWidth: 0 });
  try {
    localStorage.setItem(SETTINGS_KEY, json);
    if (settings.aiProvider) localStorage.setItem('voix_ai_provider', settings.aiProvider);
    if (settings.geminiApiKey) localStorage.setItem('gemini_api_key', settings.geminiApiKey);
    if (settings.remoteEndpoint) localStorage.setItem('voix_ai_remote_endpoint', settings.remoteEndpoint);
    if (settings.remoteModel) localStorage.setItem('voix_ai_remote_model', settings.remoteModel);
  } catch (err) {
    console.warn('[configService] localStorage settings skipped:', err);
  }

  if (isTauriRuntime()) {
    try {
      const configDir = await invoke<string>('get_config_dir_path');
      await invoke('write_text_file', { path: `${configDir}/${SETTINGS_FILE}`, content: yaml });
      // Keep legacy JSON mirrors for scripts that still read them.
      await invoke('save_app_settings', { settingsJson: json });
    } catch (err) {
      console.warn('[configService] Could not save settings.yaml:', err);
      throw err;
    }
  }
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

export async function loadRawSettingsYaml(): Promise<string> {
  if (!isTauriRuntime()) {
    return YAML.stringify(await loadSettingsFromConfig(), { indent: 2 });
  }
  try {
    const configDir = await invoke<string>('get_config_dir_path');
    const path = `${configDir}/${SETTINGS_FILE}`;
    const exists = await invoke<boolean>('file_exists', { path });
    if (exists) return await invoke<string>('read_text_file', { path });
  } catch {}
  return YAML.stringify(await loadSettingsFromConfig(), { indent: 2 });
}

export async function saveRawSettingsYaml(yamlText: string): Promise<void> {
  const parsed = YAML.parse(yamlText);
  if (!parsed || typeof parsed !== 'object') throw new Error('YAML root must be an object');
  const merged = { ...DEFAULTS, ...(parsed as AppSettings) };
  await saveSettingsToConfig(merged);
}

/** Legacy aliases used by older settings UI code. */
export const loadRawSettingsJson = loadRawSettingsYaml;
export const saveRawSettingsJson = saveRawSettingsYaml;

export async function loadRawCharactersJson(): Promise<string> {
  try {
    if (!isTauriRuntime()) return localStorage.getItem(CHARACTERS_KEY) || '[]';
    return await invoke<string>('load_characters_config');
  } catch {
    return '[]';
  }
}

export async function saveRawCharactersJson(jsonStr: string): Promise<void> {
  const parsed = JSON.parse(jsonStr);
  localStorage.setItem(CHARACTERS_KEY, JSON.stringify(parsed, null, 2));
  if (isTauriRuntime()) {
    await invoke('save_characters_config', { charactersJson: JSON.stringify(parsed, null, 2) });
  }
}

export const DEFAULT_APP_SETTINGS = DEFAULTS;

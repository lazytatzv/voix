import { invoke } from '@tauri-apps/api/core';
import { Character } from '../types';

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
}

const SETTINGS_KEY = 'voix_app_settings';
const CHARACTERS_KEY = 'voix_characters_config';

/**
 * Linux XDG (~/.config/voix/characters.json) からキャラクター定義をロード
 */
export async function loadCharactersFromConfig(): Promise<Character[] | null> {
  try {
    const jsonStr = await invoke<string>('load_characters_config');
    if (jsonStr && jsonStr.trim() !== '[]' && jsonStr.trim() !== '') {
      const parsed = JSON.parse(jsonStr);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (err) {
    console.warn('[configService] Could not load ~/.config/voix/characters.json:', err);
  }

  // Fallback to localStorage
  try {
    const local = localStorage.getItem(CHARACTERS_KEY);
    if (local) {
      const parsed = JSON.parse(local);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {}

  return null;
}

/**
 * Linux XDG (~/.config/voix/characters.json) へキャラクター定義を保存
 */
export async function saveCharactersToConfig(characters: Character[]): Promise<void> {
  const json = JSON.stringify(characters, null, 2);
  try {
    localStorage.setItem(CHARACTERS_KEY, json);
    await invoke('save_characters_config', { charactersJson: json });
  } catch (err) {
    console.warn('[configService] Could not save ~/.config/voix/characters.json:', err);
  }
}

/**
 * Linux XDG (~/.config/voix/settings.json) から全体設定をロード
 */
export async function loadSettingsFromConfig(): Promise<AppSettings> {
  let loaded: Partial<AppSettings> = {};

  try {
    const jsonStr = await invoke<string>('load_app_settings');
    if (jsonStr && jsonStr.trim() !== '{}' && jsonStr.trim() !== '') {
      loaded = JSON.parse(jsonStr);
    }
  } catch (err) {
    console.warn('[configService] Could not load ~/.config/voix/settings.json:', err);
  }

  return {
    aiProvider: loaded.aiProvider || (localStorage.getItem('voix_ai_provider') as AppSettings['aiProvider']) || 'gemini',
    geminiApiKey: loaded.geminiApiKey || localStorage.getItem('gemini_api_key') || '',
    remoteEndpoint: loaded.remoteEndpoint || localStorage.getItem('voix_ai_remote_endpoint') || 'http://192.168.1.100:11434',
    remoteModel: loaded.remoteModel || localStorage.getItem('voix_ai_remote_model') || 'qwen2.5:latest',
    remoteOpenAiEndpoint: loaded.remoteOpenAiEndpoint || 'http://localhost:8000/v1',
    voicevoxEndpoint: loaded.voicevoxEndpoint || 'http://localhost:50021',
    exportOutputPath: loaded.exportOutputPath || '/home/tatsv/myymm/output_video.mp4',
    hardwareAcceleration: loaded.hardwareAcceleration || 'auto',
    exportFps: loaded.exportFps || 30,
  };
}

/**
 * Linux XDG (~/.config/voix/settings.json) へ全体設定を保存
 */
export async function saveSettingsToConfig(settings: AppSettings): Promise<void> {
  const json = JSON.stringify(settings, null, 2);
  try {
    localStorage.setItem(SETTINGS_KEY, json);
    if (settings.aiProvider) localStorage.setItem('voix_ai_provider', settings.aiProvider);
    if (settings.geminiApiKey) localStorage.setItem('gemini_api_key', settings.geminiApiKey);
    if (settings.remoteEndpoint) localStorage.setItem('voix_ai_remote_endpoint', settings.remoteEndpoint);
    if (settings.remoteModel) localStorage.setItem('voix_ai_remote_model', settings.remoteModel);

    await invoke('save_app_settings', { settingsJson: json });
  } catch (err) {
    console.warn('[configService] Could not save ~/.config/voix/settings.json:', err);
  }
}

/**
 * ~/.config/voix/ フォルダをLinux標準ファイルマネージャで開く
 */
export async function openConfigFolder(): Promise<void> {
  try {
    await invoke('open_config_directory');
  } catch (err) {
    console.warn('Could not open config directory:', err);
  }
}

/**
 * settings.json のRAW文字列を直接取得
 */
export async function loadRawSettingsJson(): Promise<string> {
  try {
    return await invoke<string>('load_app_settings');
  } catch {
    return '{}';
  }
}

/**
 * settings.json のRAW文字列を直接保存
 */
export async function saveRawSettingsJson(jsonStr: string): Promise<void> {
  await invoke('save_app_settings', { settingsJson: jsonStr });
}

/**
 * characters.json のRAW文字列を直接取得
 */
export async function loadRawCharactersJson(): Promise<string> {
  try {
    return await invoke<string>('load_characters_config');
  } catch {
    return '[]';
  }
}

/**
 * characters.json のRAW文字列を直接保存
 */
export async function saveRawCharactersJson(jsonStr: string): Promise<void> {
  await invoke('save_characters_config', { charactersJson: jsonStr });
}

import { invoke } from '@tauri-apps/api/core';
import { Character } from '../types';

export interface AppSettings {
  aiProvider?: 'gemini' | 'remote_ollama' | 'remote_openai' | 'local_persona';
  geminiApiKey?: string;
  remoteEndpoint?: string;
  remoteModel?: string;
  exportOutputPath?: string;
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
  try {
    const jsonStr = await invoke<string>('load_app_settings');
    if (jsonStr && jsonStr.trim() !== '{}' && jsonStr.trim() !== '') {
      return JSON.parse(jsonStr);
    }
  } catch (err) {
    console.warn('[configService] Could not load ~/.config/voix/settings.json:', err);
  }

  // Fallback to localStorage keys
  return {
    aiProvider: (localStorage.getItem('voix_ai_provider') as AppSettings['aiProvider']) || 'gemini',
    geminiApiKey: localStorage.getItem('gemini_api_key') || '',
    remoteEndpoint: localStorage.getItem('voix_ai_remote_endpoint') || 'http://192.168.1.100:11434',
    remoteModel: localStorage.getItem('voix_ai_remote_model') || 'qwen2.5:latest',
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

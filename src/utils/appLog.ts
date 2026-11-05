import { invoke } from '@tauri-apps/api/core';
import { isTauriRuntime } from '../services/audioCache';

export function appLog(tag: string, message: string): void {
  console.log(`[${tag}] ${message}`);
  if (isTauriRuntime()) {
    invoke('app_log', { tag, message }).catch(() => {});
  }
}

import { invoke } from '@tauri-apps/api/core';
import { isTauriRuntime } from './audioCache';

export interface GitRepoStatus {
  is_repo: boolean;
  branch: string;
  remote_url?: string | null;
  clean: boolean;
  modified_count: number;
  untracked_count: number;
  last_commit_message?: string | null;
  last_commit_hash?: string | null;
  last_commit_date?: string | null;
  repo_root?: string | null;
}

export interface GitCommitEntry {
  hash: string;
  short_hash: string;
  message: string;
  author: string;
  date: string;
}

export async function getGitStatus(path = '.'): Promise<GitRepoStatus> {
  if (!isTauriRuntime()) {
    return {
      is_repo: false,
      branch: '',
      clean: true,
      modified_count: 0,
      untracked_count: 0,
    };
  }
  return invoke<GitRepoStatus>('git_get_status', { path });
}

export async function getGitHistory(path = '.', limit = 30): Promise<GitCommitEntry[]> {
  if (!isTauriRuntime()) return [];
  return invoke<GitCommitEntry[]>('git_get_history', { path, limit });
}

export async function commitSnapshot(
  path: string,
  message: string,
  files?: string[]
): Promise<string> {
  if (!isTauriRuntime()) return 'Snapshot created in mock mode';
  return invoke<string>('git_commit_snapshot', { path, message, files });
}

export async function initRepository(path: string): Promise<string> {
  if (!isTauriRuntime()) return 'Mock repository initialized';
  return invoke<string>('git_init_repository', { path });
}

export async function pushRemote(path = '.'): Promise<string> {
  if (!isTauriRuntime()) return 'Mock push succeeded';
  return invoke<string>('git_push_remote', { path });
}

export async function readFileAtCommit(
  path: string,
  commitHash: string,
  relativeFilePath: string
): Promise<string> {
  if (!isTauriRuntime()) throw new Error('Native Git is only available in desktop app');
  return invoke<string>('git_read_file_at_commit', {
    path,
    commitHash,
    relativeFilePath,
  });
}

import { describe, it, expect } from 'vitest';
import {
  getGitStatus,
  getGitHistory,
  commitSnapshot,
  initRepository,
  setRemoteUrl,
  pushRemote,
} from '../gitService';

describe('gitService in test / non-tauri mode', () => {
  it('returns default status in mock environment', async () => {
    const status = await getGitStatus('.');
    expect(status.is_repo).toBe(false);
    expect(status.clean).toBe(true);
  });

  it('returns empty history in non-tauri environment', async () => {
    const history = await getGitHistory('.', 10);
    expect(history).toEqual([]);
  });

  it('returns mock message on commit and push', async () => {
    const commitRes = await commitSnapshot('.', 'Test commit');
    expect(commitRes).toContain('Snapshot');

    const initRes = await initRepository('.');
    expect(initRes).toContain('initialized');

    const remoteRes = await setRemoteUrl('.', 'https://github.com/test/repo.git');
    expect(remoteRes).toContain('Mock');

    const pushRes = await pushRemote('.');
    expect(pushRes).toContain('Mock push');
  });
});

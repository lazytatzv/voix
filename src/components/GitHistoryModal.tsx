import React, { useState, useEffect, useCallback } from 'react';
import {
  GitBranch,
  GitCommit,
  UploadCloud,
  FolderGit2,
  CheckCircle2,
  AlertCircle,
  Clock,
  RotateCcw,
  X,
  Loader2,
  ShieldCheck,
} from 'lucide-react';
import {
  getGitStatus,
  getGitHistory,
  commitSnapshot,
  initRepository,
  pushRemote,
  readFileAtCommit,
  GitRepoStatus,
  GitCommitEntry,
} from '../services/gitService';
import { VoixProject } from '../types';
import { projectFromYaml } from '../utils/projectYaml';

interface GitHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectPath: string | null;
  project: VoixProject;
  onRestoreProject?: (project: VoixProject) => void;
  onSaveCurrentProject?: () => Promise<void>;
  onShowToast?: (msg: string) => void;
}

export const GitHistoryModal: React.FC<GitHistoryModalProps> = ({
  isOpen,
  onClose,
  projectPath,
  project,
  onRestoreProject,
  onSaveCurrentProject,
  onShowToast,
}) => {
  const [status, setStatus] = useState<GitRepoStatus | null>(null);
  const [history, setHistory] = useState<GitCommitEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [commitMessage, setCommitMessage] = useState('');
  const [isCommitting, setIsCommitting] = useState(false);
  const [isPushing, setIsPushing] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [restoringHash, setRestoringHash] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const targetPath = projectPath || '.';

  const refreshGit = useCallback(async () => {
    setLoading(true);
    setActionMessage(null);
    try {
      const s = await getGitStatus(targetPath);
      setStatus(s);
      if (s.is_repo) {
        const hist = await getGitHistory(targetPath, 25);
        setHistory(hist);
      } else {
        setHistory([]);
      }
    } catch (err) {
      console.warn('Failed to load git status:', err);
    } finally {
      setLoading(false);
    }
  }, [targetPath]);

  useEffect(() => {
    if (isOpen) {
      void refreshGit();
      const lineCount = project.items.filter((i) => i.type === 'voice').length;
      setCommitMessage(`Update script & timeline (${lineCount} dialogue lines)`);
    }
  }, [isOpen, refreshGit, project.items]);

  const handleCommit = async () => {
    if (!commitMessage.trim()) return;
    setIsCommitting(true);
    setActionMessage(null);
    try {
      if (onSaveCurrentProject) {
        await onSaveCurrentProject();
      }
      await commitSnapshot(targetPath, commitMessage.trim());
      setActionMessage(`Snapshot committed successfully`);
      if (onShowToast) onShowToast('Git snapshot committed');
      setCommitMessage(`Edit project at ${new Date().toLocaleTimeString()}`);
      await refreshGit();
    } catch (err) {
      setActionMessage(`Commit failed: ${String(err)}`);
    } finally {
      setIsCommitting(false);
    }
  };

  const handlePush = async () => {
    setIsPushing(true);
    setActionMessage(null);
    try {
      await pushRemote(targetPath);
      setActionMessage('Pushed to GitHub / remote successfully!');
      if (onShowToast) onShowToast('Pushed to GitHub remote');
      await refreshGit();
    } catch (err) {
      setActionMessage(`Push failed: ${String(err)}`);
    } finally {
      setIsPushing(false);
    }
  };

  const handleInitRepo = async () => {
    setIsInitializing(true);
    setActionMessage(null);
    try {
      await initRepository(targetPath);
      setActionMessage('Initialized Git repository with video exclusion filters');
      if (onShowToast) onShowToast('Git repository initialized');
      await refreshGit();
    } catch (err) {
      setActionMessage(`Init failed: ${String(err)}`);
    } finally {
      setIsInitializing(false);
    }
  };

  const handleRestoreCommit = async (commit: GitCommitEntry) => {
    if (!onRestoreProject) return;
    const confirmed = window.confirm(
      `Restore project state to commit "${commit.short_hash}: ${commit.message}"?\nUnsaved changes will be replaced.`
    );
    if (!confirmed) return;

    setRestoringHash(commit.hash);
    setActionMessage(null);
    try {
      // Find the relative file path for current project
      let relativePath = projectPath ? projectPath.split(/[\\/]/).pop() || '' : 'autosave.voix.yaml';
      if (!relativePath.endsWith('.yaml') && !relativePath.endsWith('.json')) {
        relativePath = `${project.name}.voix.yaml`;
      }

      // Try reading the file content from git commit
      let yaml = '';
      try {
        yaml = await readFileAtCommit(targetPath, commit.hash, relativePath);
      } catch {
        // Fallback: try common project filenames
        const candidates = ['autosave.voix.yaml', 'project.voix.yaml', `${project.name}.voix.yaml`];
        for (const candidate of candidates) {
          try {
            yaml = await readFileAtCommit(targetPath, commit.hash, candidate);
            if (yaml) break;
          } catch {
            // continue checking
          }
        }
      }

      if (!yaml) {
        throw new Error(`Could not find project file at commit ${commit.short_hash}`);
      }

      const restoredProject = projectFromYaml(yaml);
      onRestoreProject(restoredProject);
      setActionMessage(`Restored project state to ${commit.short_hash}`);
      if (onShowToast) onShowToast(`Restored to ${commit.short_hash}`);
      onClose();
    } catch (err) {
      setActionMessage(`Restore failed: ${String(err)}`);
    } finally {
      setRestoringHash(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-[#141619] border border-[#2e3135] rounded-xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[85vh] overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-[#25282c] flex items-center justify-between bg-[#191b1f]">
          <div className="flex items-center gap-2">
            <FolderGit2 className="w-5 h-5 text-[#8ab4f8]" />
            <h2 className="text-sm font-semibold text-[#e3e3e3]">
              Git Version History & GitHub Sync
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-[#8e918f] hover:text-[#e3e3e3] rounded transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 space-y-4 overflow-y-auto flex-1">
          {/* Lightweight Notice Banner */}
          <div className="bg-[#161f28] border border-[#233549] rounded-lg p-3 text-xs flex items-start gap-2.5 text-[#c2e7ff]">
            <ShieldCheck className="w-4 h-4 text-[#8ab4f8] flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-[#8ab4f8]">
                Lightweight Script & Settings Version Control
              </p>
              <p className="text-[11px] text-[#9ac3e6] mt-0.5 leading-relaxed">
                Large video files (MP4, MKV) are ignored by Git. Only project configurations, dialogue lines, character styles, and timeline timings are tracked (&lt; 50 KB), making GitHub synchronization instantaneous!
              </p>
            </div>
          </div>

          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center text-center space-y-2">
              <Loader2 className="w-6 h-6 animate-spin text-[#8ab4f8]" />
              <span className="text-xs text-[#8e918f]">Checking Git status...</span>
            </div>
          ) : !status?.is_repo ? (
            /* Repo not initialized view */
            <div className="bg-[#191b1f] border border-[#2a2d32] rounded-lg p-6 text-center space-y-3">
              <GitBranch className="w-8 h-8 text-[#8e918f] mx-auto opacity-70" />
              <h3 className="text-sm font-semibold text-[#e3e3e3]">
                No Git Repository Detected in Project Folder
              </h3>
              <p className="text-xs text-[#8e918f] max-w-md mx-auto">
                Initialize a Git repository to enable version snapshots, rollback history, and GitHub syncing for your video scripts and settings.
              </p>
              <button
                type="button"
                onClick={handleInitRepo}
                disabled={isInitializing}
                className="px-4 py-2 bg-[#1b3a57] hover:bg-[#234b70] disabled:bg-[#1a1c20] text-[#8ab4f8] border border-[#2b517a] rounded text-xs font-semibold inline-flex items-center gap-2 transition cursor-pointer"
              >
                {isInitializing ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <FolderGit2 className="w-4 h-4" />
                )}
                Initialize Git Repository
              </button>
            </div>
          ) : (
            /* Repo active view */
            <>
              {/* Status Header */}
              <div className="bg-[#191b1f] border border-[#2a2d32] rounded-lg p-3.5 space-y-2.5">
                <div className="flex items-center justify-between flex-wrap gap-2 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="flex items-center gap-1 font-mono text-[#8ab4f8] bg-[#1a2533] px-2 py-0.5 rounded border border-[#273d57]">
                      <GitBranch className="w-3.5 h-3.5" />
                      {status.branch}
                    </span>
                    {status.clean ? (
                      <span className="flex items-center gap-1 text-emerald-400 text-[11px] font-mono">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Clean (No uncommitted changes)
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-amber-400 text-[11px] font-mono">
                        <AlertCircle className="w-3.5 h-3.5" />
                        {status.modified_count + status.untracked_count} changes pending
                      </span>
                    )}
                  </div>

                  {status.remote_url && (
                    <div className="text-[11px] font-mono text-[#8e918f] truncate max-w-[280px]" title={status.remote_url}>
                      Remote: {status.remote_url}
                    </div>
                  )}
                </div>

                {status.last_commit_message && (
                  <div className="text-xs text-[#8e918f] flex items-center gap-1.5 pt-1 border-t border-[#25282c]">
                    <Clock className="w-3.5 h-3.5 flex-shrink-0" />
                    <span className="truncate">
                      Latest: <span className="text-[#c4c7c5] font-mono">{status.last_commit_hash?.slice(0, 7)}</span> - {status.last_commit_message} ({status.last_commit_date})
                    </span>
                  </div>
                )}
              </div>

              {/* Action Banner Message */}
              {actionMessage && (
                <div className="p-2.5 bg-[#19222c] border border-[#2a3c50] text-[#8ab4f8] text-xs rounded-md">
                  {actionMessage}
                </div>
              )}

              {/* Commit & Push Controls */}
              <div className="bg-[#17191d] border border-[#282b30] rounded-lg p-3.5 space-y-2.5">
                <span className="text-[11px] font-mono uppercase tracking-wider text-[#8e918f] block">
                  Create Version Snapshot
                </span>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={commitMessage}
                    onChange={(e) => setCommitMessage(e.target.value)}
                    placeholder="Describe changes (e.g. Adjusted timings for scene 2)..."
                    className="flex-1 bg-[#121316] border border-[#2e3137] rounded px-3 py-1.5 text-xs text-[#e3e3e3] placeholder-[#6e7279] focus:outline-none focus:border-[#8ab4f8]"
                  />
                  <button
                    type="button"
                    onClick={handleCommit}
                    disabled={isCommitting || !commitMessage.trim()}
                    className="px-3.5 py-1.5 bg-[#1b3a57] hover:bg-[#234b70] disabled:bg-[#1a1c20] text-[#8ab4f8] disabled:text-[#5f6368] border border-[#2b517a] disabled:border-[#2a2c30] rounded text-xs font-semibold inline-flex items-center gap-1.5 transition flex-shrink-0 cursor-pointer disabled:cursor-not-allowed"
                  >
                    {isCommitting ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <GitCommit className="w-3.5 h-3.5" />
                    )}
                    Commit Snapshot
                  </button>
                  {status.remote_url && (
                    <button
                      type="button"
                      onClick={handlePush}
                      disabled={isPushing}
                      className="px-3 py-1.5 bg-[#1e232b] hover:bg-[#28303b] border border-[#323d4b] text-[#c4c7c5] hover:text-white rounded text-xs inline-flex items-center gap-1.5 transition flex-shrink-0 cursor-pointer"
                      title="Push commits to GitHub"
                    >
                      {isPushing ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <UploadCloud className="w-3.5 h-3.5 text-[#8ab4f8]" />
                      )}
                      Push
                    </button>
                  )}
                </div>
              </div>

              {/* Revision History List */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-[#8e918f]">
                  <span className="font-mono uppercase tracking-wider text-[11px]">
                    Revision History ({history.length} commits)
                  </span>
                  <button
                    type="button"
                    onClick={refreshGit}
                    className="hover:text-[#e3e3e3] transition text-[11px] font-mono"
                  >
                    Refresh
                  </button>
                </div>

                <div className="divide-y divide-[#22252a] border border-[#282b30] rounded-lg max-h-56 overflow-y-auto bg-[#121316]">
                  {history.length === 0 ? (
                    <div className="p-4 text-center text-xs text-[#8e918f]">
                      No commits recorded yet. Make your first snapshot above!
                    </div>
                  ) : (
                    history.map((c) => (
                      <div
                        key={c.hash}
                        className="p-2.5 hover:bg-[#181a1e] flex items-center justify-between gap-3 transition group"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-[11px] text-[#8ab4f8] bg-[#1a2330] px-1.5 py-0.2 rounded border border-[#26374d]">
                              {c.short_hash}
                            </span>
                            <span className="text-xs font-medium text-[#e3e3e3] truncate">
                              {c.message}
                            </span>
                          </div>
                          <div className="text-[10px] text-[#8e918f] font-mono mt-0.5 flex items-center gap-2">
                            <span>{c.author}</span>
                            <span>·</span>
                            <span>{c.date}</span>
                          </div>
                        </div>

                        {onRestoreProject && (
                          <button
                            type="button"
                            onClick={() => handleRestoreCommit(c)}
                            disabled={restoringHash === c.hash}
                            className="px-2 py-1 text-[11px] font-mono bg-[#191b1f] hover:bg-[#252830] border border-[#2e3137] hover:border-[#404652] text-[#c4c7c5] hover:text-[#8ab4f8] rounded flex items-center gap-1 transition flex-shrink-0"
                            title="Rollback project to this version"
                          >
                            {restoringHash === c.hash ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <RotateCcw className="w-3 h-3" />
                            )}
                            Restore
                          </button>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-[#111315] border-t border-[#222528] flex items-center justify-between">
          <span className="text-xs text-[#8e918f] font-mono truncate max-w-sm">
            Path: {targetPath}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-[#25282c] hover:bg-[#30343a] text-xs text-[#e3e3e3] rounded transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

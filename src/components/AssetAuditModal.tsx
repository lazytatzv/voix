import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Check,
  FileQuestion,
  Film,
  FolderOpen,
  Image as ImageIcon,
  Loader2,
  Music,
  RefreshCw,
  User,
  X,
} from 'lucide-react';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { VoixProject } from '../types';
import {
  ProjectAssetAuditEntry,
  assetDisplayName,
  auditProjectAssets,
} from '../services/assetAudit';
import { isTauriRuntime } from '../services/audioCache';

interface AssetAuditModalProps {
  isOpen: boolean;
  project: VoixProject;
  onClose: () => void;
  /** Rewrite every reference to the old path and trigger a re-audit. */
  onRelink: (oldPath: string, newPath: string) => void;
}

const KIND_ICONS = {
  image: ImageIcon,
  audio: Music,
  video: Film,
  character: User,
} as const;

const KIND_LABELS = {
  image: 'Image',
  audio: 'Audio',
  video: 'Video',
  character: 'Character',
} as const;

const KIND_FILTERS = {
  image: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'] }],
  character: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'] }],
  audio: [{ name: 'Audio', extensions: ['wav', 'mp3', 'ogg', 'flac', 'm4a', 'aac', 'opus'] }],
  video: [{ name: 'Videos', extensions: ['mp4', 'mkv', 'webm', 'mov', 'avi', 'm4v'] }],
} as const;

export const AssetAuditModal: React.FC<AssetAuditModalProps> = ({
  isOpen,
  project,
  onClose,
  onRelink,
}) => {
  const [entries, setEntries] = useState<ProjectAssetAuditEntry[]>([]);
  const [isChecking, setIsChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const check = useCallback(async () => {
    setIsChecking(true);
    setError(null);
    try {
      setEntries(await auditProjectAssets(project));
    } catch (err) {
      setError(String(err));
    } finally {
      setIsChecking(false);
    }
  }, [project]);

  useEffect(() => {
    if (!isOpen) return;
    void check();
  }, [isOpen, check]);

  const { missing, found, unknown } = useMemo(() => {
    const result = {
      missing: [] as ProjectAssetAuditEntry[],
      found: [] as ProjectAssetAuditEntry[],
      unknown: [] as ProjectAssetAuditEntry[],
    };
    entries.forEach((entry) => {
      if (entry.exists === false) result.missing.push(entry);
      else if (entry.exists === true) result.found.push(entry);
      else result.unknown.push(entry);
    });
    return result;
  }, [entries]);

  if (!isOpen) return null;

  const handleLocate = async (entry: ProjectAssetAuditEntry) => {
    try {
      const picked = await openDialog({
        title: `Locate ${assetDisplayName(entry.path)}`,
        multiple: false,
        filters: KIND_FILTERS[entry.kind] as unknown as {
          name: string;
          extensions: string[];
        }[],
      });
      if (typeof picked === 'string' && picked.trim()) {
        onRelink(entry.path, picked);
      }
    } catch (err) {
      setError(`File picker failed: ${String(err)}`);
    }
  };

  const renderEntry = (entry: ProjectAssetAuditEntry, missingEntry: boolean) => {
    const Icon = KIND_ICONS[entry.kind];
    const usage: string[] = [];
    if (entry.itemIds.length > 0) {
      usage.push(`${entry.itemIds.length} item${entry.itemIds.length === 1 ? '' : 's'}`);
    }
    if (entry.characterIds.length > 0) {
      usage.push(
        `${entry.characterIds.length} character${entry.characterIds.length === 1 ? '' : 's'}`
      );
    }
    if (entry.background) usage.push('background video');

    return (
      <div
        key={entry.path}
        className={`flex items-start gap-2.5 rounded-sm border px-2.5 py-2 ${
          missingEntry
            ? 'border-[#5a2a21] bg-[#231314]'
            : 'border-[#242629] bg-[#101113]'
        }`}
      >
        <Icon
          className={`w-3.5 h-3.5 mt-0.5 flex-shrink-0 ${
            missingEntry ? 'text-[#f8b26a]' : 'text-[#8ab4f8]'
          }`}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-[11px] text-[#e3e3e3] truncate">
              {assetDisplayName(entry.path)}
            </span>
            <span className="text-[9px] font-mono uppercase tracking-wider text-[#6f7276] border border-[#2a2c30] rounded px-1 py-px flex-shrink-0">
              {KIND_LABELS[entry.kind]}
            </span>
          </div>
          <div className="text-[10px] font-mono text-[#6f7276] truncate" title={entry.path}>
            {entry.path}
          </div>
          {usage.length > 0 && (
            <div className="text-[10px] font-mono text-[#8e918f] mt-0.5">
              Used by {usage.join(' · ')}
            </div>
          )}
        </div>
        {missingEntry && (
          <button
            type="button"
            onClick={() => void handleLocate(entry)}
            className="flex-shrink-0 px-2 py-1 text-[10px] font-mono bg-[#181a1d] border border-[#2a2c30] rounded-sm text-[#c4c7c5] hover:text-white hover:border-[#8ab4f8]/60 flex items-center gap-1"
          >
            <FolderOpen className="w-3 h-3" /> Locate
          </button>
        )}
        {!missingEntry && entry.exists === true && (
          <Check className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0 mt-0.5" />
        )}
        {entry.exists === null && (
          <FileQuestion className="w-3.5 h-3.5 text-[#8e918f] flex-shrink-0 mt-0.5" />
        )}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/65 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl max-h-[88vh] overflow-hidden bg-[#141517] border border-[#2c2e32] rounded-none flex flex-col">
        <div className="px-4 py-3 border-b border-[#242629] flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="inline-flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-[#8ab4f8] border border-[#2a3b4d] bg-[#10202c] rounded px-2 py-0.5">
              <FolderOpen className="w-3 h-3" />
              Assets
            </span>
            <span className="text-[11px] font-mono text-[#6f7276]">
              {entries.length} referenced
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => void check()}
              disabled={isChecking}
              title="Check every asset path again"
              className="p-1 rounded hover:bg-[#24272b] text-[#8e918f] hover:text-white disabled:opacity-40"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isChecking ? 'animate-spin' : ''}`} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded hover:bg-[#24272b] text-[#8e918f] hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {!isTauriRuntime() && (
            <div className="flex items-start gap-2 border border-[#3b3520] bg-[#211d12] rounded-sm px-3 py-2 text-[11px] font-mono text-[#d8c48a]">
              <FileQuestion className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
              File checks are only available in the desktop app. The inventory below still shows
              every external media path.
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 border border-[#5a2a21] bg-[#231314] rounded-sm px-3 py-2 text-[11px] font-mono text-[#f0a08a]">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
              {error}
            </div>
          )}

          {isChecking && entries.length === 0 ? (
            <div className="flex items-center justify-center gap-2 py-10 text-[#8e918f] text-xs font-mono">
              <Loader2 className="w-4 h-4 animate-spin" />
              Checking asset paths…
            </div>
          ) : entries.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <Check className="w-6 h-6 text-emerald-400" />
              <p className="text-xs font-mono text-[#c4c7c5]">No external assets referenced.</p>
              <p className="text-[10px] font-mono text-[#6f7276]">
                Character art bundled with Voix is not listed here.
              </p>
            </div>
          ) : (
            <>
              {missing.length > 0 && (
                <section className="space-y-2">
                  <div className="flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-[#f8b26a]" />
                    <span className="text-[10px] font-mono uppercase tracking-wider text-[#f8b26a]">
                      Missing · {missing.length}
                    </span>
                  </div>
                  {missing.map((entry) => renderEntry(entry, true))}
                </section>
              )}

              {found.length > 0 && (
                <section className="space-y-2">
                  <div className="flex items-center gap-1.5">
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-[10px] font-mono uppercase tracking-wider text-[#8e918f]">
                      Found · {found.length}
                    </span>
                  </div>
                  {found.map((entry) => renderEntry(entry, false))}
                </section>
              )}

              {unknown.length > 0 && (
                <section className="space-y-2">
                  <div className="flex items-center gap-1.5">
                    <FileQuestion className="w-3.5 h-3.5 text-[#8e918f]" />
                    <span className="text-[10px] font-mono uppercase tracking-wider text-[#8e918f]">
                      Not checked · {unknown.length}
                    </span>
                  </div>
                  {unknown.map((entry) => renderEntry(entry, false))}
                </section>
              )}

              {missing.length === 0 && found.length > 0 && (
                <p className="text-[10px] font-mono text-[#6f7276]">
                  Every external asset is reachable. Locate rewrites all timeline and character
                  references to the replacement file.
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

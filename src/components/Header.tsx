import React, { useEffect, useRef, useState } from 'react';
import {
  Upload,
  Download,
  PlaySquare,
  Video,
  Layers,
  Settings,
  Settings2,
  User,
  Save,
  SaveAll,
  FolderOpen,
  FilePlus2,
  Undo2,
  Redo2,
  History,
  FileText,
  FileJson,
  FileWarning,
  MoreHorizontal,
  RefreshCw,
  FolderGit2,
} from 'lucide-react';
import { open } from '@tauri-apps/plugin-dialog';

export interface RecentProjectEntry {
  path: string;
  name: string;
  savedAt: number;
}

interface HeaderProps {
  projectName: string;
  onProjectNameChange: (name: string) => void;
  onVideoSelect: (fileOrPath: File | string) => void;
  onAutoTranscribe: () => void;
  onImportSubtitles: () => void;
  onImportYmmp?: () => void;
  onExportSubtitles?: () => void;
  onOpenAssets?: () => void;
  onOpenCharacterSettings: () => void;
  onOpenSettings?: () => void;
  onOpenProjectSettings?: () => void;
  onOpenGitHistory?: () => void;
  onExportVideo: () => void;
  onOpenAiVideoGenerator: () => void;
  hasVideo: boolean;
  itemCount: number;
  isTranscribing: boolean;
  onSaveProject?: () => void;
  onSaveProjectAs?: () => void;
  onOpenProject?: () => void;
  onNewProject?: () => void;
  recentProjects?: RecentProjectEntry[];
  onOpenRecentProject?: (path: string) => void;
  onClearRecentProjects?: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  isDirty?: boolean;
  projectPath?: string | null;
}

export const Header: React.FC<HeaderProps> = ({
  projectName,
  onProjectNameChange,
  onVideoSelect,
  onAutoTranscribe,
  onImportSubtitles,
  onImportYmmp,
  onExportSubtitles,
  onOpenAssets,
  onOpenCharacterSettings,
  onOpenSettings,
  onOpenProjectSettings,
  onOpenGitHistory,
  onExportVideo,
  onOpenAiVideoGenerator,
  hasVideo,
  itemCount,
  isTranscribing,
  onSaveProject,
  onSaveProjectAs,
  onOpenProject,
  onNewProject,
  recentProjects = [],
  onOpenRecentProject,
  onClearRecentProjects,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  isDirty,
  projectPath,
}) => {
  const videoInputRef = useRef<HTMLInputElement | null>(null);
  const recentMenuRef = useRef<HTMLDivElement | null>(null);
  const moreMenuRef = useRef<HTMLDivElement | null>(null);
  const [isRecentOpen, setIsRecentOpen] = useState(false);
  const [isMoreOpen, setIsMoreOpen] = useState(false);

  useEffect(() => {
    if (!isRecentOpen) return;
    const close = (event: PointerEvent) => {
      if (!recentMenuRef.current?.contains(event.target as Node)) setIsRecentOpen(false);
    };
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [isRecentOpen]);

  useEffect(() => {
    if (!isMoreOpen) return;
    const close = (event: PointerEvent) => {
      if (!moreMenuRef.current?.contains(event.target as Node)) setIsMoreOpen(false);
    };
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [isMoreOpen]);

  useEffect(() => {
    if (recentProjects.length === 0) setIsRecentOpen(false);
  }, [recentProjects.length]);

  const handlePickVideo = async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [
          {
            name: 'Video Files',
            extensions: ['mp4', 'mkv', 'webm', 'mov', 'avi', 'm4v'],
          },
        ],
      });
      if (selected && typeof selected === 'string') {
        onVideoSelect(selected);
        return;
      }
    } catch (e) {
      console.warn('Native file picker error, falling back to HTML input:', e);
    }
    videoInputRef.current?.click();
  };

  const handleVideoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onVideoSelect(file);
      e.target.value = '';
    }
  };

  const fileName = projectPath ? projectPath.split('/').pop() : null;
  const tooltipPath = projectPath || 'Autosaved at ~/.config/voix/autosave.voix.yaml';

  const handleReloadScreen = () => {
    if (window.confirm('Reload the screen? Unsaved changes since the last autosave will be lost.')) {
      window.location.reload();
    }
  };

  return (
    <header className="relative z-30 h-12 bg-[#101112] border-b border-[#222426] px-4 flex items-center justify-between select-none flex-shrink-0">
      {/* Left: Brand, project title, file actions */}
      <div className="flex items-center gap-2 min-w-0">
        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="w-6 h-6 rounded-none bg-[#18191b] border border-[#2c2e31] flex items-center justify-center text-[#8ab4f8]">
            <PlaySquare className="w-3.5 h-3.5" />
          </div>
          <span className="font-bold text-xs tracking-[0.14em] uppercase text-[#e3e3e3]">Voix</span>
        </div>

        <span className="text-[#3c4043] font-mono text-xs">/</span>

        <div className="flex items-center gap-1 min-w-0 overflow-hidden">
          <input
            type="text"
            value={projectName}
            onChange={(e) => onProjectNameChange(e.target.value)}
            className="bg-transparent text-xs text-[#a8aaa8] hover:text-[#e3e3e3] focus:text-[#e3e3e3] rounded px-1.5 py-0.5 outline-none transition w-36 max-w-full min-w-0 border border-transparent focus:border-[#3c4043]"
            placeholder="Untitled"
          />
          {isDirty && (
            <span
              className="w-1.5 h-1.5 rounded-full bg-[#f59e0b] flex-shrink-0"
              title="Unsaved changes (autosaved continuously)"
            />
          )}
          <span
            className="text-[10px] font-mono text-[#5f6368] truncate max-w-[140px] hidden 2xl:inline"
            title={tooltipPath}
          >
            {fileName || 'autosave'}
          </span>
        </div>

        <div className="flex items-center gap-0.5 flex-shrink-0">
          {onNewProject && (
            <button
              type="button"
              onClick={onNewProject}
              className="p-1 rounded hover:bg-[#222427] text-[#8e918f] hover:text-[#c4c7c5] transition"
              title="New Project (Ctrl+N)"
            >
              <FilePlus2 className="w-3.5 h-3.5" />
            </button>
          )}
          {onOpenProject && (
            <button
              type="button"
              onClick={onOpenProject}
              className="p-1 rounded hover:bg-[#222427] text-[#8e918f] hover:text-[#c4c7c5] transition"
              title="Open Project (Ctrl+O)"
            >
              <FolderOpen className="w-3.5 h-3.5" />
            </button>
          )}
          {onOpenRecentProject && recentProjects.length > 0 && (
            <div ref={recentMenuRef} className="relative hidden lg:block">
              <button
                type="button"
                onClick={() => setIsRecentOpen((value) => !value)}
                className={`p-1 rounded hover:bg-[#222427] transition ${
                  isRecentOpen ? 'text-[#8ab4f8] bg-[#222427]' : 'text-[#8e918f] hover:text-[#c4c7c5]'
                }`}
                title="Open Recent Project"
                aria-haspopup="menu"
                aria-expanded={isRecentOpen}
              >
                <History className="w-3.5 h-3.5" />
              </button>
              {isRecentOpen && (
                <div
                  role="menu"
                  className="absolute left-0 top-full mt-2 z-[70] w-80 bg-[#16181b] border border-[#2c2e32] rounded-sm overflow-hidden"
                >
                  <div className="px-3 py-1.5 border-b border-[#242629] flex items-center justify-between">
                    <span className="text-[10px] font-mono uppercase tracking-wider text-[#8e918f]">
                      Recent projects
                    </span>
                    {onClearRecentProjects && (
                      <button
                        type="button"
                        onClick={() => {
                          onClearRecentProjects();
                          setIsRecentOpen(false);
                        }}
                        className="text-[10px] font-mono text-[#8e918f] hover:text-rose-300"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                  <div className="max-h-72 overflow-y-auto py-1">
                    {recentProjects.map((entry) => (
                      <button
                        key={entry.path}
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setIsRecentOpen(false);
                          onOpenRecentProject(entry.path);
                        }}
                        className="w-full text-left px-3 py-2 hover:bg-[#202226] transition"
                        title={entry.path}
                      >
                        <span className="flex items-center gap-1.5 text-[11px] text-[#e3e3e3] truncate">
                          <FileText className="w-3 h-3 text-[#8ab4f8] flex-shrink-0" />
                          {entry.name || entry.path.split('/').pop()}
                        </span>
                        <span className="block mt-0.5 pl-[18px] text-[10px] font-mono text-[#6f7276] truncate">
                          {entry.path}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          {onSaveProject && (
            <button
              type="button"
              onClick={onSaveProject}
              className="p-1 rounded hover:bg-[#222427] text-[#8e918f] hover:text-[#c4c7c5] transition"
              title="Save Project (Ctrl+S)"
            >
              <Save className="w-3.5 h-3.5" />
            </button>
          )}
          {onSaveProjectAs && (
            <button
              type="button"
              onClick={onSaveProjectAs}
              className="p-1 rounded hover:bg-[#222427] text-[#8e918f] hover:text-[#c4c7c5] transition"
              title="Save Project As... (Ctrl+Shift+S)"
            >
              <SaveAll className="w-3.5 h-3.5" />
            </button>
          )}
          <span className="w-px h-4 bg-[#2a2c30] mx-0.5" />
          {onUndo && (
            <button
              type="button"
              onClick={onUndo}
              disabled={!canUndo}
              className="p-1 rounded hover:bg-[#222427] text-[#8e918f] hover:text-[#c4c7c5] transition disabled:opacity-25"
              title="Undo (Ctrl+Z)"
            >
              <Undo2 className="w-3.5 h-3.5" />
            </button>
          )}
          {onRedo && (
            <button
              type="button"
              onClick={onRedo}
              disabled={!canRedo}
              className="p-1 rounded hover:bg-[#222427] text-[#8e918f] hover:text-[#c4c7c5] transition disabled:opacity-25"
              title="Redo (Ctrl+Shift+Z / Ctrl+Y)"
            >
              <Redo2 className="w-3.5 h-3.5" />
            </button>
          )}
          <span className="w-px h-4 bg-[#2a2c30] mx-0.5" />
          {onOpenProjectSettings && (
            <button
              type="button"
              onClick={onOpenProjectSettings}
              className="p-1 rounded hover:bg-[#222427] text-[#8e918f] hover:text-[#c4c7c5] transition"
              title="Project settings (resolution, tracks, background)"
            >
              <Settings2 className="w-3.5 h-3.5" />
            </button>
          )}
          {onOpenGitHistory && (
            <button
              type="button"
              onClick={onOpenGitHistory}
              className="p-1 rounded hover:bg-[#222427] text-[#8e918f] hover:text-[#8ab4f8] transition"
              title="Git Version History & GitHub Sync"
            >
              <FolderGit2 className="w-3.5 h-3.5" />
            </button>
          )}
          {onOpenAssets && (
            <button
              type="button"
              onClick={onOpenAssets}
              className="hidden xl:inline-flex items-center justify-center p-1 rounded hover:bg-[#222427] text-[#8e918f] hover:text-[#c4c7c5] transition"
              title="Asset audit (find and relink missing files)"
            >
              <FileWarning className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Center: Core video actions */}
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <input
          ref={videoInputRef}
          type="file"
          accept="video/mp4,video/webm,video/quicktime,video/mkv,video/*"
          className="hidden"
          onChange={handleVideoChange}
        />
        <button
          type="button"
          onClick={handlePickVideo}
          className="px-2.5 py-1 bg-[#151619] hover:bg-[#1f2126] text-[#e3e3e3] text-xs font-mono rounded-sm border border-[#282a2e] flex items-center gap-1.5 transition active:scale-95"
          title="Select or change background video"
        >
          {hasVideo ? (
            <Video className="w-3.5 h-3.5 text-[#8ab4f8]" />
          ) : (
            <Upload className="w-3.5 h-3.5 text-[#8ab4f8]" />
          )}
          <span className="hidden xl:inline">{hasVideo ? 'Change Video' : '+ Video'}</span>
        </button>

        {hasVideo && (
          <button
            type="button"
            onClick={onAutoTranscribe}
            disabled={isTranscribing}
            className="px-2.5 py-1 bg-[#151619] hover:bg-[#1f2126] text-[#8ab4f8] text-xs font-mono rounded-sm border border-[#282a2e] flex items-center gap-1.5 transition active:scale-95 disabled:opacity-30"
            title="Auto-generate dialogue clips from detected speech"
          >
            <Layers className={`w-3.5 h-3.5 ${isTranscribing ? 'animate-spin' : ''}`} />
            <span className="hidden xl:inline">{isTranscribing ? 'Transcribing...' : 'Auto Captions'}</span>
          </button>
        )}

        <button
          type="button"
          onClick={onImportSubtitles}
          className="px-2.5 py-1 bg-[#151619] hover:bg-[#1f2126] text-[#c4c7c5] hover:text-white text-xs font-mono rounded-sm border border-[#282a2e] flex items-center gap-1.5 transition active:scale-95"
          title="Import SubRip (.srt) subtitles into the text lane"
        >
          <FileText className="w-3.5 h-3.5 text-[#8ab4f8]" />
          <span className="hidden xl:inline">Import SRT</span>
        </button>

        {onExportSubtitles && (
          <button
            type="button"
            onClick={onExportSubtitles}
            className="px-2.5 py-1 bg-[#151619] hover:bg-[#1f2126] text-[#c4c7c5] hover:text-white text-xs font-mono rounded-sm border border-[#282a2e] flex items-center gap-1.5 transition active:scale-95"
            title="Export the voice-line timing as SubRip (.srt) subtitles"
          >
            <Download className="w-3.5 h-3.5 text-[#8ab4f8]" />
            <span className="hidden xl:inline">Export SRT</span>
          </button>
        )}

        <button
          type="button"
          onClick={onOpenAiVideoGenerator}
          className="px-2.5 py-1 bg-[#151619] hover:bg-[#1f2126] text-[#c4c7c5] hover:text-white text-xs font-mono rounded-sm border border-[#282a2e] flex items-center gap-1.5 transition active:scale-95"
          title="Draft a Japanese commentary script from the video"
        >
          <FileText className="w-3.5 h-3.5 text-[#a8aaa8]" />
          <span className="hidden xl:inline">Script Draft</span>
        </button>

        {onImportYmmp && (
          <div ref={moreMenuRef} className="relative">
            <button
              type="button"
              onClick={() => setIsMoreOpen((value) => !value)}
              className={`p-1.5 rounded-sm border transition ${
                isMoreOpen
                  ? 'bg-[#222427] text-[#8ab4f8] border-[#2c2e32]'
                  : 'bg-[#151619] text-[#8e918f] hover:text-[#c4c7c5] border-[#282a2e]'
              }`}
              title="More actions"
              aria-haspopup="menu"
              aria-expanded={isMoreOpen}
            >
              <MoreHorizontal className="w-3.5 h-3.5" />
            </button>
            {isMoreOpen && (
              <div
                role="menu"
                className="absolute right-0 top-full mt-2 z-[70] w-64 bg-[#16181b] border border-[#2c2e32] rounded-sm overflow-hidden"
              >
                {onOpenGitHistory && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setIsMoreOpen(false);
                      onOpenGitHistory();
                    }}
                    className="w-full text-left px-3 py-2 hover:bg-[#202226] transition border-b border-[#242629]"
                    title="Git snapshots & GitHub synchronization"
                  >
                    <span className="flex items-center gap-2 text-[11px] text-[#e3e3e3]">
                      <FolderGit2 className="w-3 h-3 text-[#8ab4f8] flex-shrink-0" />
                      Git Version History
                    </span>
                    <span className="block mt-0.5 pl-[20px] text-[10px] font-mono text-[#6f7276]">
                      Snapshots, GitHub push & rollback
                    </span>
                  </button>
                )}
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setIsMoreOpen(false);
                    onImportYmmp();
                  }}
                  className="w-full text-left px-3 py-2 hover:bg-[#202226] transition"
                  title="Import a Yukkuri Movie Maker 4 project (.ymmp)"
                >
                  <span className="flex items-center gap-2 text-[11px] text-[#e3e3e3]">
                    <FileJson className="w-3 h-3 text-[#f8b26a] flex-shrink-0" />
                    Import YMM4 project
                  </span>
                  <span className="block mt-0.5 pl-[20px] text-[10px] font-mono text-[#6f7276]">
                    .ymmp — Yukkuri Movie Maker 4
                  </span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Right: Tools & export */}
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <span className="text-[10px] font-mono text-[#5f6368] mr-1 hidden xl:inline">
          {itemCount} items
        </span>
        <button
          type="button"
          onClick={handleReloadScreen}
          className="p-1.5 rounded-sm bg-[#151619] hover:bg-[#1f2126] text-[#a8aaa8] hover:text-white border border-[#282a2e] transition"
          title="Reload screen"
          aria-label="Reload screen"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={onOpenCharacterSettings}
          className="p-1.5 rounded-sm bg-[#151619] hover:bg-[#1f2126] text-[#a8aaa8] hover:text-white border border-[#282a2e] transition"
          title="Characters & voice audition"
        >
          <User className="w-3.5 h-3.5" />
        </button>

        {onOpenSettings && (
          <button
            type="button"
            onClick={onOpenSettings}
            className="p-1.5 rounded-sm bg-[#151619] hover:bg-[#1f2126] text-[#a8aaa8] hover:text-white border border-[#282a2e] transition"
            title="Settings (Ctrl+,)"
          >
            <Settings className="w-3.5 h-3.5" />
          </button>
        )}

        <button
          type="button"
          onClick={onExportVideo}
          disabled={itemCount === 0}
          className="ml-1 px-3.5 py-1 bg-[#004a77] hover:bg-[#005a92] text-[#c2e7ff] text-xs font-mono font-semibold rounded-none border border-[#005a92] transition active:scale-95 flex items-center gap-1.5 disabled:opacity-30"
          title="Render and export video (Ctrl+E)"
        >
          <Download className="w-3 h-3" />
          <span>Export</span>
        </button>
      </div>
    </header>
  );
};

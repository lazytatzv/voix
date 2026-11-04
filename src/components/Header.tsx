import React, { useRef } from 'react';
import {
  Upload,
  Download,
  PlaySquare,
  Video,
  Bot,
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
} from 'lucide-react';
import { open } from '@tauri-apps/plugin-dialog';

interface HeaderProps {
  projectName: string;
  onProjectNameChange: (name: string) => void;
  onVideoSelect: (fileOrPath: File | string) => void;
  onAutoTranscribe: () => void;
  onOpenCharacterSettings: () => void;
  onOpenSettings?: () => void;
  onOpenProjectSettings?: () => void;
  onExportVideo: () => void;
  onOpenAiVideoGenerator: () => void;
  hasVideo: boolean;
  itemCount: number;
  isTranscribing: boolean;
  onSaveProject?: () => void;
  onSaveProjectAs?: () => void;
  onOpenProject?: () => void;
  onNewProject?: () => void;
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
  onOpenCharacterSettings,
  onOpenSettings,
  onOpenProjectSettings,
  onExportVideo,
  onOpenAiVideoGenerator,
  hasVideo,
  itemCount,
  isTranscribing,
  onSaveProject,
  onSaveProjectAs,
  onOpenProject,
  onNewProject,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  isDirty,
  projectPath,
}) => {
  const videoInputRef = useRef<HTMLInputElement | null>(null);

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

  return (
    <header className="h-12 bg-[#101112] border-b border-[#222426] px-4 flex items-center justify-between select-none flex-shrink-0">
      {/* Left: Brand, project title, file actions */}
      <div className="flex items-center gap-2 min-w-0">
        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="w-6 h-6 rounded bg-[#18191b] border border-[#2c2e31] flex items-center justify-center text-[#8ab4f8]">
            <PlaySquare className="w-3.5 h-3.5" />
          </div>
          <span className="font-bold text-xs tracking-tight text-[#e3e3e3]">Voix</span>
        </div>

        <span className="text-[#3c4043] font-mono text-xs">/</span>

        <div className="flex items-center gap-1 min-w-0">
          <input
            type="text"
            value={projectName}
            onChange={(e) => onProjectNameChange(e.target.value)}
            className="bg-transparent text-xs text-[#a8aaa8] hover:text-[#e3e3e3] focus:text-[#e3e3e3] rounded px-1.5 py-0.5 outline-none transition w-36 border border-transparent focus:border-[#3c4043]"
            placeholder="Untitled"
          />
          {isDirty && (
            <span
              className="w-1.5 h-1.5 rounded-full bg-[#f59e0b] flex-shrink-0"
              title="Unsaved changes (autosaved continuously)"
            />
          )}
          <span
            className="text-[10px] font-mono text-[#5f6368] truncate max-w-[140px] hidden xl:inline"
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
        </div>
      </div>

      {/* Center: Core video & AI actions */}
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
          <span>{hasVideo ? 'Change Video' : '+ Video'}</span>
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
            <span>{isTranscribing ? 'Transcribing...' : 'Auto Captions'}</span>
          </button>
        )}

        <button
          type="button"
          onClick={onOpenAiVideoGenerator}
          className="px-2.5 py-1 bg-[#151619] hover:bg-[#1f2126] text-[#c4c7c5] hover:text-white text-xs font-mono rounded-sm border border-[#282a2e] flex items-center gap-1.5 transition active:scale-95"
          title="Generate a Japanese dialogue script with AI"
        >
          <Bot className="w-3.5 h-3.5 text-[#34d399]" />
          <span>AI Script</span>
        </button>
      </div>

      {/* Right: Tools & export */}
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <span className="text-[10px] font-mono text-[#5f6368] mr-1">{itemCount} items</span>
        <button
          type="button"
          onClick={onOpenCharacterSettings}
          className="p-1.5 rounded-sm bg-[#151619] hover:bg-[#1f2126] text-[#a8aaa8] hover:text-white border border-[#282a2e] transition"
          title="Characters & voice"
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
          className="ml-1 px-3 py-1 bg-[#004a77] hover:bg-[#005a92] text-[#c2e7ff] text-xs font-mono font-semibold rounded-sm border border-[#005a92] shadow-xs transition active:scale-95 flex items-center gap-1.5 disabled:opacity-30"
          title="Render and export video (Ctrl+E)"
        >
          <Download className="w-3 h-3" />
          <span>Export</span>
        </button>
      </div>
    </header>
  );
};

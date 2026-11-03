import React, { useRef } from 'react';
import {
  Upload,
  Download,
  PlaySquare,
  Video,
  Bot,
  Layers,
  Settings,
  User,
  Save,
  FolderOpen,
} from 'lucide-react';
import { open } from '@tauri-apps/plugin-dialog';

interface HeaderProps {
  projectName: string;
  onProjectNameChange: (name: string) => void;
  onVideoSelect: (fileOrPath: File | string) => void;
  onAutoTranscribe: () => void;
  onOpenCharacterSettings: () => void;
  onOpenSettings?: () => void;
  onExportVideo: () => void;
  onOpenAiVideoGenerator: () => void;
  hasVideo: boolean;
  itemCount: number;
  isTranscribing: boolean;
  onSaveProject?: () => void;
  onLoadProject?: (file: File) => void;
}

export const Header: React.FC<HeaderProps> = ({
  projectName,
  onProjectNameChange,
  onVideoSelect,
  onAutoTranscribe,
  onOpenCharacterSettings,
  onOpenSettings,
  onExportVideo,
  onOpenAiVideoGenerator,
  hasVideo,
  itemCount,
  isTranscribing,
  onSaveProject,
  onLoadProject,
}) => {
  const videoInputRef = useRef<HTMLInputElement | null>(null);
  const projectInputRef = useRef<HTMLInputElement | null>(null);

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

  const handleProjectFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && onLoadProject) {
      onLoadProject(file);
      e.target.value = '';
    }
  };

  return (
    <header className="h-12 bg-[#101112] border-b border-[#222426] px-4 flex items-center justify-between select-none">
      {/* Left: Minimal Brand & Project Title */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded bg-[#18191b] border border-[#2c2e31] flex items-center justify-center text-[#8ab4f8]">
            <PlaySquare className="w-3.5 h-3.5" />
          </div>
          <span className="font-bold text-xs tracking-tight text-[#e3e3e3]">
            Voix
          </span>
        </div>

        <span className="text-[#3c4043] font-mono text-xs">/</span>

        <input
          type="text"
          value={projectName}
          onChange={(e) => onProjectNameChange(e.target.value)}
          className="bg-transparent text-xs text-[#a8aaa8] hover:text-[#e3e3e3] focus:text-[#e3e3e3] rounded px-1.5 py-0.5 outline-none transition w-36 border border-transparent focus:border-[#3c4043]"
          placeholder="Untitled"
        />

        {/* Project Load / Save */}
        <input
          ref={projectInputRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={handleProjectFileChange}
        />
        <div className="flex items-center gap-0.5">
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
          {onLoadProject && (
            <button
              type="button"
              onClick={() => projectInputRef.current?.click()}
              className="p-1 rounded hover:bg-[#222427] text-[#8e918f] hover:text-[#c4c7c5] transition"
              title="Load Project (.json)"
            >
              <FolderOpen className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Center: Core Video & AI Actions */}
      <div className="flex items-center gap-1.5">
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
          title="Select or change video file"
        >
          {hasVideo ? <Video className="w-3.5 h-3.5 text-[#8ab4f8]" /> : <Upload className="w-3.5 h-3.5 text-[#8ab4f8]" />}
          <span>{hasVideo ? 'Change Video' : '+ Video'}</span>
        </button>

        {hasVideo && (
          <button
            type="button"
            onClick={onAutoTranscribe}
            disabled={isTranscribing}
            className="px-2.5 py-1 bg-[#151619] hover:bg-[#1f2126] text-[#8ab4f8] text-xs font-mono rounded-sm border border-[#282a2e] flex items-center gap-1.5 transition active:scale-95 disabled:opacity-30"
            title="Auto-transcribe video speech to Japanese dialogue"
          >
            <Layers className={`w-3.5 h-3.5 ${isTranscribing ? 'animate-spin' : ''}`} />
            <span>{isTranscribing ? 'Transcribing...' : 'Auto Captions'}</span>
          </button>
        )}

        <button
          type="button"
          onClick={onOpenAiVideoGenerator}
          className="px-2.5 py-1 bg-[#151619] hover:bg-[#1f2126] text-[#c4c7c5] hover:text-white text-xs font-mono rounded-sm border border-[#282a2e] flex items-center gap-1.5 transition active:scale-95"
          title="Generate Japanese dialogue script with AI"
        >
          <Bot className="w-3.5 h-3.5 text-[#34d399]" />
          <span>AI Script</span>
        </button>
      </div>

      {/* Right: Tools & Export */}
      <div className="flex items-center gap-1.5">
        {/* Characters */}
        <button
          type="button"
          onClick={onOpenCharacterSettings}
          className="p-1.5 rounded-sm bg-[#151619] hover:bg-[#1f2126] text-[#a8aaa8] hover:text-white border border-[#282a2e] transition"
          title="Characters & Voice"
        >
          <User className="w-3.5 h-3.5" />
        </button>

        {/* Settings */}
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

        {/* Export */}
        <button
          type="button"
          onClick={onExportVideo}
          disabled={itemCount === 0}
          className="ml-1 px-3 py-1 bg-[#004a77] hover:bg-[#005a92] text-[#c2e7ff] text-xs font-mono font-semibold rounded-sm border border-[#005a92] shadow-xs transition active:scale-95 flex items-center gap-1.5 disabled:opacity-30"
          title="Render and export video"
        >
          <Download className="w-3 h-3" />
          <span>Export</span>
        </button>
      </div>
    </header>
  );
};

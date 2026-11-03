import React, { useRef } from 'react';
import { Upload, SlidersHorizontal, Download, PlaySquare, FolderOpen, Save, Video, FileArchive, Bot, Layers } from 'lucide-react';

interface HeaderProps {
  projectName: string;
  onProjectNameChange: (name: string) => void;
  onVideoSelect: (fileOrPath: File | string) => void;
  onAutoTranscribe: () => void;
  onOpenCharacterSettings: () => void;
  onOpenTtsSettings?: () => void;
  onExportVideo: () => void;
  onSaveProject: () => void;
  onLoadProject: (file: File) => void;
  onOpenAiVideoGenerator: () => void;
  onOpenTachieImport: () => void;
  hasVideo: boolean;
  itemCount: number;
  isTranscribing: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  projectName,
  onProjectNameChange,
  onVideoSelect,
  onAutoTranscribe,
  onOpenCharacterSettings,
  onExportVideo,
  onSaveProject,
  onLoadProject,
  onOpenAiVideoGenerator,
  onOpenTachieImport,
  hasVideo,
  itemCount,
  isTranscribing,
}) => {
  const videoInputRef = useRef<HTMLInputElement | null>(null);
  const projectInputRef = useRef<HTMLInputElement | null>(null);

  const handlePickVideo = () => {
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
    if (file) {
      onLoadProject(file);
      e.target.value = '';
    }
  };

  return (
    <header className="h-14 bg-[#121314] border-b border-[#242628] px-5 flex items-center justify-between select-none">
      {/* Left: Brand & Project Name */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-[#1c1d1f] border border-[#2e3135] flex items-center justify-center text-[#8ab4f8]">
            <PlaySquare className="w-4 h-4" />
          </div>
          <div className="flex items-center gap-2">
            <span className="font-bold text-sm tracking-tight text-[#e3e3e3]">
              Voix
            </span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#1e2022] border border-[#333538] text-[#8e918f]">
              Workstation
            </span>
            <input
              type="text"
              value={projectName}
              onChange={(e) => onProjectNameChange(e.target.value)}
              className="bg-transparent text-xs text-[#a8aaa8] hover:text-[#e3e3e3] focus:text-[#e3e3e3] focus:bg-[#1a1b1d] rounded px-2 py-1 outline-none transition w-44 border border-transparent focus:border-[#3c4043]"
              placeholder="Untitled Project"
            />
          </div>
        </div>

        {/* Project Open / Save */}
        <div className="flex items-center bg-[#18191b] p-0.5 rounded-lg border border-[#282a2c] ml-1">
          <input
            ref={projectInputRef}
            type="file"
            accept=".voix,.json,.myymmp"
            className="hidden"
            onChange={handleProjectFileChange}
          />
          <button
            onClick={() => projectInputRef.current?.click()}
            className="px-2.5 py-1 text-xs text-[#a8aaa8] hover:text-white hover:bg-[#25272a] rounded flex items-center gap-1.5 transition"
            title="Open project file (.voix)"
          >
            <FolderOpen className="w-3.5 h-3.5" />
            Open
          </button>
          <button
            onClick={onSaveProject}
            className="px-2.5 py-1 text-xs text-[#a8aaa8] hover:text-white hover:bg-[#25272a] rounded flex items-center gap-1.5 transition"
            title="Save project (.voix)"
          >
            <Save className="w-3.5 h-3.5" />
            Save
          </button>
        </div>
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-2">
        {/* AI Script Generator */}
        <button
          onClick={onOpenAiVideoGenerator}
          className="px-3 py-1.5 bg-[#1a1b1d] hover:bg-[#242629] text-[#e3e3e3] text-xs font-medium rounded-lg border border-[#333639] flex items-center gap-1.5 transition active:scale-95"
          title="Generate full multi-character dialogue script from topic"
        >
          <Bot className="w-3.5 h-3.5 text-[#8ab4f8]" />
          <span>AI Script</span>
        </button>

        {/* Import Tachie */}
        <button
          onClick={onOpenTachieImport}
          className="px-3 py-1.5 bg-[#1a1b1d] hover:bg-[#242629] text-[#e3e3e3] text-xs font-medium rounded-lg border border-[#333639] flex items-center gap-1.5 transition active:scale-95"
          title="Import character tachie from .zip or .psd"
        >
          <FileArchive className="w-3.5 h-3.5 text-[#10b981]" />
          <span>Import Tachie</span>
        </button>

        <div className="h-4 w-px bg-[#282a2c] mx-0.5" />

        {/* Import Video */}
        <input
          ref={videoInputRef}
          type="file"
          accept="video/mp4,video/webm,video/quicktime,video/mkv,video/*"
          className="hidden"
          onChange={handleVideoChange}
        />
        <button
          onClick={handlePickVideo}
          className="px-3 py-1.5 bg-[#1a1b1d] hover:bg-[#242629] text-[#e3e3e3] text-xs font-medium rounded-lg border border-[#333639] flex items-center gap-1.5 transition active:scale-95"
        >
          {hasVideo ? <Video className="w-3.5 h-3.5 text-[#8ab4f8]" /> : <Upload className="w-3.5 h-3.5 text-[#8ab4f8]" />}
          {hasVideo ? 'Change Video' : 'Add Video'}
        </button>

        {/* Auto Captions */}
        <button
          onClick={onAutoTranscribe}
          disabled={!hasVideo || isTranscribing}
          className="px-3 py-1.5 bg-[#1e293b] hover:bg-[#283548] text-[#93c5fd] text-xs font-medium rounded-lg border border-[#3b82f6]/30 flex items-center gap-1.5 transition active:scale-95 disabled:opacity-30"
          title="Auto-detect speech segments and generate captions"
        >
          <Layers className={`w-3.5 h-3.5 ${isTranscribing ? 'animate-spin' : ''}`} />
          {isTranscribing ? 'Transcribing...' : 'Auto Captions'}
        </button>

        <div className="h-4 w-px bg-[#282a2c] mx-0.5" />

        {/* Speakers / Avatars Settings */}
        <button
          onClick={onOpenCharacterSettings}
          className="p-1.5 rounded-lg bg-[#1a1b1d] hover:bg-[#242629] text-[#a8aaa8] hover:text-white border border-[#333639] transition"
          title="Speakers & Avatars"
        >
          <SlidersHorizontal className="w-4 h-4" />
        </button>

        {/* Export Video */}
        <button
          onClick={onExportVideo}
          disabled={itemCount === 0}
          className="px-3.5 py-1.5 bg-[#3b82f6] hover:bg-[#2563eb] text-white text-xs font-semibold rounded-lg shadow-sm transition active:scale-95 flex items-center gap-1.5 disabled:opacity-30"
        >
          <Download className="w-3.5 h-3.5" />
          Export
        </button>
      </div>
    </header>
  );
};

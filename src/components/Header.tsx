import React, { useRef } from 'react';
import { Upload, Sparkles, SlidersHorizontal, Download, PlaySquare, FolderOpen, Save, Video } from 'lucide-react';

interface HeaderProps {
  projectName: string;
  onProjectNameChange: (name: string) => void;
  onVideoSelect: (file: File) => void;
  onAutoTranscribe: () => void;
  onOpenCharacterSettings: () => void;
  onOpenTtsSettings: () => void;
  onExportVideo: () => void;
  onSaveProject: () => void;
  onLoadProject: (file: File) => void;
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
  hasVideo,
  itemCount,
  isTranscribing,
}) => {
  const videoInputRef = useRef<HTMLInputElement | null>(null);
  const projectInputRef = useRef<HTMLInputElement | null>(null);

  const handleVideoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onVideoSelect(file);
  };

  const handleProjectFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onLoadProject(file);
  };

  return (
    <header className="h-16 bg-[#131314] border-b border-[#282a2c] px-6 flex items-center justify-between select-none">
      {/* Left: Brand & Project Name */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-full bg-[#1e1f20] border border-[#3c4043] flex items-center justify-center text-[#8ab4f8] shadow-sm">
            <PlaySquare className="w-4 h-4" />
          </div>
          <div className="flex flex-col">
            <span className="font-semibold text-sm tracking-tight text-[#e3e3e3] flex items-center gap-1.5">
              Voix
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[#004a77] text-[#c2e7ff] font-medium">
                Studio
              </span>
            </span>
            <input
              type="text"
              value={projectName}
              onChange={(e) => onProjectNameChange(e.target.value)}
              className="bg-transparent text-xs text-[#a8aaa8] hover:text-[#e3e3e3] focus:text-[#e3e3e3] focus:bg-[#1e1f20] rounded-md px-1.5 py-0.5 outline-none transition w-44 font-normal"
              placeholder="Untitled Project"
            />
          </div>
        </div>

        {/* Project Open / Save */}
        <div className="flex items-center bg-[#1e1f20] p-1 rounded-full border border-[#333538] ml-2">
          <input
            ref={projectInputRef}
            type="file"
            accept=".voix,.json,.myymmp"
            className="hidden"
            onChange={handleProjectFileChange}
          />
          <button
            onClick={() => projectInputRef.current?.click()}
            className="px-3 py-1 text-xs text-[#c4c7c5] hover:text-white hover:bg-[#282a2c] rounded-full flex items-center gap-1.5 transition"
            title="Open project file (.voix)"
          >
            <FolderOpen className="w-3.5 h-3.5" />
            Open
          </button>
          <button
            onClick={onSaveProject}
            className="px-3 py-1 text-xs text-[#c4c7c5] hover:text-white hover:bg-[#282a2c] rounded-full flex items-center gap-1.5 transition"
            title="Save project (.voix)"
          >
            <Save className="w-3.5 h-3.5" />
            Save
          </button>
        </div>
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-3">
        {/* Import Video */}
        <input
          ref={videoInputRef}
          type="file"
          accept="video/mp4,video/webm,video/quicktime,video/mkv"
          className="hidden"
          onChange={handleVideoChange}
        />
        <button
          onClick={() => videoInputRef.current?.click()}
          className="px-4 py-2 bg-[#1e1f20] hover:bg-[#282a2c] text-[#e3e3e3] text-xs font-medium rounded-full border border-[#3c4043] flex items-center gap-2 transition active:scale-95"
        >
          {hasVideo ? <Video className="w-4 h-4 text-[#8ab4f8]" /> : <Upload className="w-4 h-4 text-[#8ab4f8]" />}
          {hasVideo ? 'Change Video' : 'Import Video'}
        </button>

        {/* Auto Captions */}
        <button
          onClick={onAutoTranscribe}
          disabled={!hasVideo || isTranscribing}
          className="px-4 py-2 bg-[#004a77] hover:bg-[#005c94] text-[#c2e7ff] text-xs font-medium rounded-full flex items-center gap-2 transition active:scale-95 disabled:opacity-40"
          title="Auto-detect speech segments and generate captions"
        >
          <Sparkles className={`w-3.5 h-3.5 ${isTranscribing ? 'animate-spin' : ''}`} />
          {isTranscribing ? 'Transcribing...' : 'Auto Captions'}
        </button>

        <div className="h-5 w-px bg-[#333538] mx-1" />

        {/* Speakers / Avatars Settings */}
        <button
          onClick={onOpenCharacterSettings}
          className="p-2.5 rounded-full hover:bg-[#1e1f20] text-[#c4c7c5] hover:text-white transition"
          title="Speakers & Avatars"
        >
          <SlidersHorizontal className="w-4 h-4" />
        </button>

        {/* Export Video */}
        <button
          onClick={onExportVideo}
          disabled={itemCount === 0}
          className="px-5 py-2 bg-[#8ab4f8] hover:bg-[#a8c7fa] text-[#001d35] text-xs font-semibold rounded-full shadow-sm transition active:scale-95 flex items-center gap-1.5 disabled:opacity-40"
        >
          <Download className="w-3.5 h-3.5" />
          Export
        </button>
      </div>
    </header>
  );
};

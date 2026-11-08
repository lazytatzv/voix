import React, { useState } from 'react';
import {
  X,
  Film,
  MessageSquare,
  Trash2,
  CheckCircle2,
  FileText,
  RefreshCw,
} from 'lucide-react';
import { SrtCue } from '../utils/srt';

export type VideoChangeAction = 'clear_subtitles' | 'keep' | 'clear_all' | 'import_srt';

export interface CompanionSrtInfo {
  path: string;
  fileName: string;
  cues: SrtCue[];
}

export interface VideoChangeModalProps {
  isOpen: boolean;
  onClose: () => void;
  newVideoPath: string;
  currentVideoPath: string | null;
  voiceCount: number;
  textCount: number;
  totalItemsCount: number;
  companionSrt: CompanionSrtInfo | null;
  onConfirm: (action: VideoChangeAction, rememberPreference: boolean) => void;
}

export const VideoChangeModal: React.FC<VideoChangeModalProps> = ({
  isOpen,
  onClose,
  newVideoPath,
  currentVideoPath,
  voiceCount,
  textCount,
  totalItemsCount,
  companionSrt,
  onConfirm,
}) => {
  const [rememberChoice, setRememberChoice] = useState(false);

  if (!isOpen) return null;

  const newFileName = newVideoPath.split(/[\\/]/).pop() || newVideoPath;
  const currentFileName = currentVideoPath?.split(/[\\/]/).pop();
  const otherItemsCount = Math.max(0, totalItemsCount - voiceCount - textCount);

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-[#141619] border border-[#2e3135] rounded-lg shadow-2xl w-full max-w-xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#2e3135] bg-[#1a1c20]">
          <div className="flex items-center gap-2.5">
            <Film className="w-4 h-4 text-[#8ab4f8]" />
            <h2 className="text-sm font-semibold text-[#e3e3e3]">
              Video Changed: Subtitles & Dialogue Detected
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-[#8e918f] hover:text-[#e3e3e3] rounded hover:bg-[#282a2e] transition"
            title="Cancel"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
          {/* File summary */}
          <div className="bg-[#0e0f11] border border-[#242629] rounded-md p-3.5 space-y-2">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-[#8e918f]">New Video:</span>
              <span className="text-white font-medium truncate max-w-[320px]" title={newVideoPath}>
                {newFileName}
              </span>
            </div>
            {currentFileName && currentFileName !== newFileName && (
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-[#8e918f]">Previous:</span>
                <span className="text-[#6f7276] truncate max-w-[320px]" title={currentVideoPath || ''}>
                  {currentFileName}
                </span>
              </div>
            )}
            <div className="pt-2 border-t border-[#1c1d22] flex items-center gap-3 text-xs text-[#c4c7c5]">
              <span className="flex items-center gap-1.5 text-amber-300">
                <MessageSquare className="w-3.5 h-3.5" />
                {voiceCount} voice line{voiceCount === 1 ? '' : 's'}
              </span>
              <span className="flex items-center gap-1.5 text-[#8ab4f8]">
                <FileText className="w-3.5 h-3.5" />
                {textCount} subtitle item{textCount === 1 ? '' : 's'}
              </span>
              {otherItemsCount > 0 && (
                <span className="text-[#6f7276]">
                  +{otherItemsCount} other item{otherItemsCount === 1 ? '' : 's'}
                </span>
              )}
            </div>
          </div>

          <p className="text-xs text-[#c4c7c5] leading-relaxed">
            Existing subtitles and dialogue were found on the timeline from the previous video.
            How would you like to handle them for this new video?
          </p>

          {/* Companion SRT Card (if detected) */}
          {companionSrt && (
            <div className="bg-[#12221b] border border-emerald-700/60 rounded-md p-3.5 space-y-2.5">
              <div className="flex items-start gap-2.5">
                <FileText className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />
                <div>
                  <div className="text-xs font-semibold text-emerald-300">
                    Companion Subtitle File Detected
                  </div>
                  <div className="text-[11px] text-emerald-400/80 mt-0.5 font-mono">
                    {companionSrt.fileName} ({companionSrt.cues.length} cues)
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => onConfirm('import_srt', rememberChoice)}
                className="w-full py-2 px-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-semibold flex items-center justify-center gap-2 transition active:scale-98 shadow-md"
              >
                <FileText className="w-3.5 h-3.5" />
                Import Matching Subtitles ({companionSrt.fileName})
              </button>
            </div>
          )}

          {/* Action options */}
          <div className="space-y-2">
            {/* Clear Subtitles (Recommended) */}
            <button
              type="button"
              onClick={() => onConfirm('clear_subtitles', rememberChoice)}
              className="w-full text-left p-3 rounded-md border border-rose-900/60 bg-[#241519]/70 hover:bg-[#2e181e] hover:border-rose-600 transition group flex items-start gap-3"
            >
              <div className="p-2 rounded bg-rose-950/60 border border-rose-800/40 text-rose-300 group-hover:scale-105 transition-transform flex-shrink-0 mt-0.5">
                <Trash2 className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold text-rose-200 flex items-center gap-2">
                  Clear Subtitles & Dialogue
                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30 font-normal">
                    Recommended
                  </span>
                </div>
                <div className="text-[11px] text-[#a8aaa8] mt-1 leading-normal">
                  Removes all previous voice lines and subtitles so you start fresh with this video.
                  Timeline duration syncs with the new video.
                </div>
              </div>
            </button>

            {/* Keep Subtitles */}
            <button
              type="button"
              onClick={() => onConfirm('keep', rememberChoice)}
              className="w-full text-left p-3 rounded-md border border-[#2e3135] bg-[#1a1c20]/60 hover:bg-[#22252a] hover:border-[#3e4249] transition group flex items-start gap-3"
            >
              <div className="p-2 rounded bg-[#25282e] border border-[#33373e] text-[#8ab4f8] group-hover:scale-105 transition-transform flex-shrink-0 mt-0.5">
                <CheckCircle2 className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold text-[#e3e3e3]">
                  Keep Existing Subtitles & Dialogue
                </div>
                <div className="text-[11px] text-[#8e918f] mt-1 leading-normal">
                  Preserves current subtitles and voice items in place (useful when merely swapping
                  the background video footage).
                </div>
              </div>
            </button>

            {/* Clear All */}
            <button
              type="button"
              onClick={() => onConfirm('clear_all', rememberChoice)}
              className="w-full text-left p-3 rounded-md border border-[#2e3135] bg-[#1a1c20]/40 hover:bg-[#22252a] hover:border-[#3e4249] transition group flex items-start gap-3"
            >
              <div className="p-2 rounded bg-[#25282e] border border-[#33373e] text-amber-300 group-hover:scale-105 transition-transform flex-shrink-0 mt-0.5">
                <RefreshCw className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold text-[#c4c7c5]">
                  Clear Entire Timeline (Reset All Tracks)
                </div>
                <div className="text-[11px] text-[#6f7276] mt-1 leading-normal">
                  Removes all items across all tracks (voice, text, images, audio, shapes) for a
                  clean slate.
                </div>
              </div>
            </button>
          </div>

          {/* Remember Choice */}
          <div className="pt-2">
            <label className="flex items-center gap-2 text-xs text-[#8e918f] cursor-pointer hover:text-[#c4c7c5] select-none">
              <input
                type="checkbox"
                checked={rememberChoice}
                onChange={(e) => setRememberChoice(e.target.checked)}
                className="rounded border-[#3e4249] bg-[#1e2024] text-rose-500 focus:ring-0 cursor-pointer"
              />
              <span>Remember my choice for future video replacements (configurable in Settings)</span>
            </label>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-[#2e3135] bg-[#1a1c20] flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded text-xs text-[#8e918f] hover:text-[#e3e3e3] hover:bg-[#282a2e] transition"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

import React, { useState } from 'react';
import { X, Download, Film, CheckCircle2, Loader2, AlertCircle } from 'lucide-react';
import { TimelineItem, VoiceItem } from '../types';
import { executeExportVideo } from '../services/exportService';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: TimelineItem[];
  videoDuration: number;
  videoSrc: string | null;
}

export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  onClose,
  items,
  videoDuration,
}) => {
  const [outputPath, setOutputPath] = useState<string>('/home/tatsv/myymm/output_video.mp4');
  const [isExporting, setIsExporting] = useState(false);
  const [progressStatus, setProgressStatus] = useState<string>('');
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const voiceClips = items.filter((it): it is VoiceItem => it.type === 'voice');

  const handleStartExport = async () => {
    setIsExporting(true);
    setErrorMessage(null);
    setResultMessage(null);
    setProgressStatus('Preparing audio tracks...');

    try {
      setProgressStatus('Rendering video with FFmpeg...');
      const result = await executeExportVideo({
        outputPath: outputPath.trim(),
        clips: voiceClips,
        totalDuration: videoDuration,
      });

      setResultMessage(result);
    } catch (err: unknown) {
      setErrorMessage(String(err));
    } finally {
      setIsExporting(false);
      setProgressStatus('');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 select-none">
      <div className="bg-[#121315] border border-[#2a2c30] rounded-sm w-full max-w-md overflow-hidden shadow-2xl flex flex-col">
        {/* Header */}
        <div className="px-5 py-3 border-b border-[#202226] flex items-center justify-between bg-[#0e0f11]">
          <div className="flex items-center gap-2">
            <Film className="w-4 h-4 text-[#8ab4f8]" />
            <h3 className="font-semibold text-xs font-mono uppercase tracking-wider text-[#e3e3e3]">Export Video (MP4)</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-sm text-[#8e918f] hover:text-white hover:bg-[#1a1b1e] transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Settings Area */}
        <div className="p-5 space-y-4 text-xs font-mono">
          <div className="bg-[#151619] p-3.5 rounded-sm border border-[#24262a] space-y-2">
            <div className="flex justify-between text-[#8e918f]">
              <span>Caption Clips</span>
              <span className="font-medium text-[#e3e3e3]">{voiceClips.length} clips</span>
            </div>
            <div className="flex justify-between text-[#8e918f]">
              <span>Total Duration</span>
              <span className="font-medium text-[#e3e3e3]">~{videoDuration.toFixed(1)}s</span>
            </div>
            <div className="flex justify-between text-[#8e918f]">
              <span>Codec & Format</span>
              <span className="font-medium text-[#8ab4f8]">H.264 / AAC (MP4)</span>
            </div>
          </div>

          <div>
            <label className="text-[11px] text-[#c4c7c5] block mb-1.5 uppercase">Output File Path</label>
            <input
              type="text"
              value={outputPath}
              onChange={(e) => setOutputPath(e.target.value)}
              className="w-full bg-[#101113] border border-[#26282c] focus:border-[#3b82f6] rounded-sm px-3 py-1.5 text-xs text-[#e3e3e3] font-mono outline-none"
            />
          </div>

          {/* Running Status */}
          {isExporting && (
            <div className="p-3 bg-[#004a77]/30 border border-[#004a77] rounded-xl flex items-center gap-2.5 text-[#c2e7ff]">
              <Loader2 className="w-4 h-4 animate-spin text-[#8ab4f8] flex-shrink-0" />
              <span>{progressStatus}</span>
            </div>
          )}

          {/* Success */}
          {resultMessage && (
            <div className="p-3 bg-emerald-950/40 border border-emerald-800 rounded-xl flex items-center gap-2 text-emerald-300">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
              <span className="truncate">{resultMessage}</span>
            </div>
          )}

          {/* Error */}
          {errorMessage && (
            <div className="p-3 bg-red-950/40 border border-red-800 rounded-xl flex items-center gap-2 text-red-300">
              <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
              <span className="truncate">{errorMessage}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-[#282a2c] flex items-center justify-end gap-2 bg-[#18191b]">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-full text-xs text-[#c4c7c5] hover:text-white hover:bg-[#282a2c] transition"
          >
            Close
          </button>
          <button
            onClick={handleStartExport}
            disabled={isExporting || voiceClips.length === 0}
            className="px-5 py-2 rounded-full bg-[#8ab4f8] hover:bg-[#a8c7fa] text-[#001d35] font-semibold text-xs shadow transition flex items-center gap-1.5 disabled:opacity-40"
          >
            <Download className="w-3.5 h-3.5" />
            {isExporting ? 'Exporting...' : 'Start Export'}
          </button>
        </div>
      </div>
    </div>
  );
};

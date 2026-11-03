import React, { useState } from 'react';
import { X, Upload, Loader2, Sparkles, Check, FileArchive, ArrowRight } from 'lucide-react';
import { importTachieFile, TachieImportResult } from '../services/tachieService';

interface TachieImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportSuccess: (result: TachieImportResult) => void;
}

export const TachieImportModal: React.FC<TachieImportModalProps> = ({
  isOpen,
  onClose,
  onImportSuccess,
}) => {
  const [filePath, setFilePath] = useState('/home/tatsv/Downloads/ずんだもん立ち絵素材2.3.zip');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewResult, setPreviewResult] = useState<TachieImportResult | null>(null);

  if (!isOpen) return null;

  const handleProcess = async (pathOrData: string, hint?: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await importTachieFile(pathOrData, hint);
      setPreviewResult(res);
    } catch (e: unknown) {
      const err = e as { message?: string } | string;
      const msg = typeof err === 'string' ? err : err?.message || 'Failed to extract tachie';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const b64 = reader.result as string;
      handleProcess(b64, file.name);
    };
    reader.onerror = () => {
      setError('Failed to read file from disk');
    };
    reader.readAsDataURL(file);
  };

  const handleConfirm = () => {
    if (!previewResult) return;
    onImportSuccess(previewResult);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-in fade-in">
      <div className="bg-[#1e1f20] border border-[#3c4043] rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#282a2c] flex items-center justify-between bg-[#18191b]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-[#004a77] text-[#c2e7ff] flex items-center justify-center">
              <FileArchive className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-semibold text-sm text-[#e3e3e3] flex items-center gap-2">
                Import Tachie Material (立ち絵素材)
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#10b981]/20 text-[#34d399] font-mono">
                  ZIP / PSD
                </span>
              </h3>
              <p className="text-[11px] text-[#8e918f]">
                Extracts PSD / ZIP archives (Sakamoto Ahiru etc.) into high-res transparent PNGs
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-[#282a2c] text-[#8e918f] hover:text-white transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5 overflow-y-auto">
          {/* File path or file picker */}
          <div>
            <label className="text-xs font-medium text-[#c4c7c5] block mb-1.5">
              Tachie Archive File (.zip, .psd, .png)
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={filePath}
                onChange={(e) => setFilePath(e.target.value)}
                placeholder="/path/to/ずんだもん立ち絵素材2.3.zip"
                className="flex-1 bg-[#131314] border border-[#3c4043] focus:border-[#8ab4f8] rounded-xl px-3.5 py-2 text-xs text-[#e3e3e3] outline-none font-mono"
              />
              <button
                type="button"
                onClick={() => handleProcess(filePath)}
                disabled={!filePath.trim() || isLoading}
                className="px-4 py-2 bg-[#8ab4f8] hover:bg-[#a8c7fa] text-[#001d35] rounded-xl text-xs font-semibold flex items-center gap-1.5 transition disabled:opacity-40"
              >
                {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Load'}
              </button>
            </div>

            {/* Quick Suggestions */}
            <div className="flex items-center gap-1.5 mt-2">
              <span className="text-[10px] text-[#8e918f]">Quick select:</span>
              <button
                type="button"
                onClick={() => {
                  const p = '/home/tatsv/Downloads/ずんだもん立ち絵素材2.3.zip';
                  setFilePath(p);
                  handleProcess(p);
                }}
                className="text-[10px] text-[#8ab4f8] hover:underline font-mono truncate max-w-xs"
              >
                ずんだもん立ち絵素材2.3.zip
              </button>
            </div>
          </div>

          {/* Or File Drop Area */}
          <div className="relative border-2 border-dashed border-[#3c4043] hover:border-[#8ab4f8] rounded-2xl p-5 text-center transition group">
            <input
              type="file"
              accept=".zip,.psd,.png,.webp"
              onChange={handleFileUpload}
              className="absolute inset-0 opacity-0 cursor-pointer"
            />
            <div className="flex flex-col items-center justify-center gap-1.5 text-xs text-[#8e918f]">
              <Upload className="w-5 h-5 text-[#8ab4f8] group-hover:scale-110 transition" />
              <span>Drag & drop or <strong className="text-[#8ab4f8]">browse</strong> ZIP or PSD file</span>
              <span className="text-[10px] text-[#5e6265]">Handles Shift-JIS (CP932) encoding automatically</span>
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-400">
              {error}
            </div>
          )}

          {/* Extracted Preview */}
          {previewResult && (
            <div className="bg-[#131314] border border-[#282a2c] rounded-2xl p-4 flex gap-4 items-center animate-in fade-in">
              <div className="w-24 h-32 rounded-xl bg-[#1e1f20] border border-[#3c4043] overflow-hidden flex items-center justify-center p-1 relative flex-shrink-0">
                <img
                  src={previewResult.avatar_data_url}
                  alt={previewResult.character_name}
                  className="w-full h-full object-contain"
                />
              </div>

              <div className="flex-1 space-y-1.5 text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm text-white">
                    {previewResult.character_name}
                  </span>
                  <span
                    className="w-3 h-3 rounded-full border border-white/20"
                    style={{ backgroundColor: previewResult.theme_color }}
                    title="Detected Theme Color"
                  />
                </div>

                <div className="text-[11px] text-[#8e918f] space-y-0.5 font-mono">
                  <p>Voicevox ID: <span className="text-[#c2e7ff] font-semibold">{previewResult.speaker_id}</span></p>
                  <p>Resolution: <span className="text-[#c2e7ff]">{previewResult.width} x {previewResult.height} px</span></p>
                  <p>Format: <span className="text-[#34d399]">Transparent RGBA PNG</span></p>
                </div>

                <div className="pt-1 flex items-center gap-1.5 text-[11px] text-[#34d399]">
                  <Check className="w-3.5 h-3.5" />
                  <span>Ready to add to video speakers!</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-[#282a2c] bg-[#18191b] flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-full text-xs text-[#8e918f] hover:text-white transition"
          >
            Cancel
          </button>

          <button
            onClick={handleConfirm}
            disabled={!previewResult || isLoading}
            className="px-5 py-2 rounded-full bg-[#10b981] hover:bg-[#059669] text-white text-xs font-semibold flex items-center gap-1.5 transition disabled:opacity-30 shadow-sm"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Add to Speakers
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};

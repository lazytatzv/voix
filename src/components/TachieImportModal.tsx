import React, { useState } from 'react';
import { X, Upload, Loader2, Check, FileArchive, ArrowRight, FolderOpen, UserPlus } from 'lucide-react';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
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
  const [filePath, setFilePath] = useState('/home/tatsv/Downloads/四国めたん立ち絵素材2.1.zip');
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

  const handleNativeBrowse = async () => {
    try {
      const selected = await openDialog({
        multiple: false,
        filters: [
          {
            name: 'Tachie Materials',
            extensions: ['zip', 'psd', 'png', 'webp'],
          },
        ],
      });
      if (selected && typeof selected === 'string') {
        setFilePath(selected);
        const nameHint = selected.split('/').pop() || selected;
        await handleProcess(selected, nameHint);
      }
    } catch (e) {
      console.warn('Native dialog error:', e);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check if real file path exists on the file object
    const p = (file as unknown as { path?: string }).path;
    if (p && typeof p === 'string') {
      setFilePath(p);
      handleProcess(p, file.name);
      return;
    }

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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
      <div className="bg-[#18191b] border border-[#3c4043] rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#282a2c] flex items-center justify-between bg-[#131415]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#282a2c] border border-[#3c4043] text-[#8ab4f8] flex items-center justify-center">
              <FileArchive className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-semibold text-sm text-[#e3e3e3] flex items-center gap-2">
                Import Tachie Material
                <span className="text-[10px] px-2 py-0.5 rounded bg-[#282a2c] border border-[#3c4043] text-[#8e918f] font-mono">
                  ZIP / PSD
                </span>
              </h3>
              <p className="text-[11px] text-[#8e918f]">
                Extracts transparent character layers and lip-sync mouth variations
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-[#282a2c] text-[#8e918f] hover:text-white transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4 overflow-y-auto">
          {/* File path or file picker */}
          <div>
            <label className="text-xs font-medium text-[#c4c7c5] block mb-1.5">
              Archive File Path (.zip, .psd, .png)
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={filePath}
                onChange={(e) => setFilePath(e.target.value)}
                placeholder="/path/to/archive.zip"
                className="flex-1 bg-[#131314] border border-[#3c4043] focus:border-[#8ab4f8] rounded-lg px-3 py-2 text-xs text-[#e3e3e3] outline-none font-mono"
              />
              <button
                type="button"
                onClick={handleNativeBrowse}
                title="Browse local file"
                className="px-3 py-2 bg-[#282a2c] hover:bg-[#333538] text-[#e3e3e3] border border-[#3c4043] rounded-lg text-xs font-medium flex items-center gap-1.5 transition active:scale-95"
              >
                <FolderOpen className="w-3.5 h-3.5 text-[#8ab4f8]" />
                Browse
              </button>
              <button
                type="button"
                onClick={() => handleProcess(filePath)}
                disabled={!filePath.trim() || isLoading}
                className="px-4 py-2 bg-[#3b82f6] hover:bg-[#2563eb] text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition disabled:opacity-40"
              >
                {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Load'}
              </button>
            </div>

            {/* Quick Suggestions */}
            <div className="flex flex-wrap items-center gap-2 mt-2.5">
              <span className="text-[10px] text-[#8e918f]">Quick select:</span>
              <button
                type="button"
                onClick={() => {
                  const p = '/home/tatsv/Downloads/四国めたん立ち絵素材2.1.zip';
                  setFilePath(p);
                  handleProcess(p, '四国めたん立ち絵素材2.1.zip');
                }}
                className="text-[10px] px-2 py-0.5 rounded bg-[#202124] border border-[#3c4043] text-[#ec4899] hover:bg-[#282a2c] font-medium transition"
              >
                四国めたん立ち絵素材2.1.zip
              </button>
              <button
                type="button"
                onClick={() => {
                  const p = '/home/tatsv/Downloads/ずんだもん立ち絵素材2.3.zip';
                  setFilePath(p);
                  handleProcess(p, 'ずんだもん立ち絵素材2.3.zip');
                }}
                className="text-[10px] px-2 py-0.5 rounded bg-[#202124] border border-[#3c4043] text-[#34d399] hover:bg-[#282a2c] font-medium transition"
              >
                ずんだもん立ち絵素材2.3.zip
              </button>
            </div>
          </div>

          {/* Or File Drop Area */}
          <div className="relative border border-dashed border-[#3c4043] hover:border-[#8ab4f8] rounded-xl p-4 text-center transition group bg-[#131415]/50">
            <input
              type="file"
              accept=".zip,.psd,.png,.webp"
              onChange={handleFileUpload}
              className="absolute inset-0 opacity-0 cursor-pointer"
            />
            <div className="flex flex-col items-center justify-center gap-1 text-xs text-[#8e918f]">
              <Upload className="w-4 h-4 text-[#8ab4f8] transition" />
              <span>Drag & drop archive or image here</span>
              <span className="text-[10px] text-[#5e6265]">Automatically parses Shift-JIS (CP932) and PSD layer structures</span>
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="p-3 rounded-lg bg-red-950/40 border border-red-800/50 text-xs text-red-300">
              {error}
            </div>
          )}

          {/* Extracted Preview */}
          {previewResult && (
            <div className="bg-[#131415] border border-[#2e3135] rounded-xl p-4 flex gap-4 items-center animate-in fade-in">
              <div className="w-24 h-32 rounded-lg bg-[#18191b] border border-[#3c4043] overflow-hidden flex items-center justify-center p-1 relative flex-shrink-0">
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
                  <p>VOICEVOX ID: <span className="text-[#e3e3e3] font-semibold">{previewResult.speaker_id}</span></p>
                  <p>Dimensions: <span className="text-[#e3e3e3]">{previewResult.width} x {previewResult.height} px</span></p>
                  <p>Mouth Flap: <span className="text-[#10b981]">{previewResult.speaking_data_url ? 'Active (口パク差分抽出済)' : 'Idle only'}</span></p>
                </div>

                <div className="pt-1 flex items-center gap-1.5 text-[11px] text-[#10b981]">
                  <Check className="w-3.5 h-3.5" />
                  <span>Ready to add to project speakers</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-[#282a2c] bg-[#131415] flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-xs text-[#8e918f] hover:text-white transition"
          >
            Cancel
          </button>

          <button
            onClick={handleConfirm}
            disabled={!previewResult || isLoading}
            className="px-5 py-2 rounded-lg bg-[#10b981] hover:bg-[#059669] text-white text-xs font-semibold flex items-center gap-1.5 transition disabled:opacity-30 shadow-sm"
          >
            <UserPlus className="w-3.5 h-3.5" />
            Add to Speakers
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};

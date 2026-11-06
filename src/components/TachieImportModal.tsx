import React, { useState, useEffect } from 'react';
import { X, Loader2, Check, FileArchive, ArrowRight, FolderOpen, UserPlus, RefreshCw } from 'lucide-react';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { importTachieFile, TachieImportResult } from '../services/tachieService';
import { resolveImageToDataUrl } from '../utils/imageUtils';
import { SafeAvatarImg } from './SafeAvatarImg';
import { Character } from '../types';

interface TachieImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  characters?: Character[];
  targetCharacterId?: string | null;
  onImportSuccess: (result: TachieImportResult, mode: 'update' | 'add', targetCharId?: string) => void;
}

export const TachieImportModal: React.FC<TachieImportModalProps> = ({
  isOpen,
  onClose,
  characters = [],
  targetCharacterId,
  onImportSuccess,
}) => {
  const [filePath, setFilePath] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewResult, setPreviewResult] = useState<TachieImportResult | null>(null);
  const [importMode, setImportMode] = useState<'update' | 'add'>('update');

  const matchingChar = targetCharacterId
    ? characters.find((c) => c.id === targetCharacterId)
    : previewResult
    ? characters.find(
        (c) =>
          c.speakerId === previewResult.speaker_id ||
          (c.name && previewResult.character_name && (c.name.includes(previewResult.character_name) || previewResult.character_name.includes(c.name)))
      )
    : null;

  useEffect(() => {
    if (matchingChar) {
      setImportMode('update');
    } else {
      setImportMode('add');
    }
  }, [matchingChar?.id, previewResult?.character_name]);

  if (!isOpen) return null;

  const handleProcess = async (pathOrData: string, hint?: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await importTachieFile(pathOrData, hint);
      // メモリキャッシュを事前ウォームアップして即座にプレビュー描画
      await resolveImageToDataUrl(res.avatar_data_url);
      if (res.speaking_data_url) {
        await resolveImageToDataUrl(res.speaking_data_url);
      }
      if (res.expressions) {
        await Promise.all(
          Object.values(res.expressions).map((p) => resolveImageToDataUrl(p))
        );
      }
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

  const handleConfirm = () => {
    if (!previewResult) return;
    const mode = matchingChar ? importMode : 'add';
    onImportSuccess(previewResult, mode, matchingChar?.id);
    onClose();
  };

  return (
    <div className="geo-backdrop fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
      <div className="geo-panel bg-[#18191b] border border-[#3c4043] rounded-none w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
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
                Metan Tachie (ZIP)
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
                Zundamon Tachie (ZIP)
              </button>
            </div>
          </div>

          {/* File Select Area (Native Linux Dialog / Zero Memory Freeze) */}
          <button
            type="button"
            onClick={handleNativeBrowse}
            className="w-full border border-dashed border-[#3c4043] hover:border-[#8ab4f8] rounded-xl p-4 text-center transition group bg-[#131415]/50 flex flex-col items-center justify-center gap-1.5 text-xs text-[#8e918f] cursor-pointer hover:bg-[#18191c] active:scale-[0.99]"
          >
            <FolderOpen className="w-5 h-5 text-[#8ab4f8] transition group-hover:scale-110" />
            <span className="font-medium text-[#e3e3e3]">
              Click to select ZIP or PSD file
            </span>
            <span className="text-[10px] text-[#5e6265]">
              Direct filesystem access — extracts PSD layers & expressions without memory limits
            </span>
          </button>

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
                <SafeAvatarImg
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
                  <p>Mouth Flap: <span className="text-[#10b981]">{previewResult.speaking_data_url ? 'Active (Extracted)' : 'Idle only'}</span></p>
                </div>

                <div className="pt-1 flex items-center gap-1.5 text-[11px] text-[#10b981]">
                  <Check className="w-3.5 h-3.5" />
                  <span>Ready to apply to project</span>
                </div>

                {/* Existing Character Update or Add New */}
                {matchingChar && (
                  <div className="pt-2.5 mt-2 border-t border-[#282a2c] space-y-1.5">
                    <span className="text-[11px] text-[#c4c7c5] font-medium block">
                      Import Mode (Prevent Duplicates)
                    </span>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setImportMode('update')}
                        className={`p-2 rounded-lg text-left text-xs transition border flex flex-col gap-0.5 cursor-pointer ${
                          importMode === 'update'
                            ? 'bg-[#004a77] border-[#8ab4f8] text-white shadow-xs font-semibold'
                            : 'bg-[#18191b] border-[#3c4043] text-[#8e918f] hover:text-[#e3e3e3]'
                        }`}
                      >
                        <span className="flex items-center gap-1.5">
                          <Check className="w-3.5 h-3.5 text-[#10b981]" />
                          Update "{matchingChar.name}"
                        </span>
                        <span className="text-[10px] text-[#8ab4f8] opacity-80">Recommended: update existing avatar</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setImportMode('add')}
                        className={`p-2 rounded-lg text-left text-xs transition border flex flex-col gap-0.5 cursor-pointer ${
                          importMode === 'add'
                            ? 'bg-[#004a77] border-[#8ab4f8] text-white shadow-xs font-semibold'
                            : 'bg-[#18191b] border-[#3c4043] text-[#8e918f] hover:text-[#e3e3e3]'
                        }`}
                      >
                        <span className="flex items-center gap-1.5">
                          <UserPlus className="w-3.5 h-3.5" />
                          Add as New Speaker
                        </span>
                        <span className="text-[10px] opacity-70">Add as separate character</span>
                      </button>
                    </div>
                  </div>
                )}
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
            {matchingChar && importMode === 'update' ? (
              <>
                <RefreshCw className="w-3.5 h-3.5" />
                Update "{matchingChar.name}" Avatar
              </>
            ) : (
              <>
                <UserPlus className="w-3.5 h-3.5" />
                Add to Speakers
                <ArrowRight className="w-3.5 h-3.5" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

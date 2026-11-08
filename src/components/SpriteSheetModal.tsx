import React, { useState, useRef, useEffect } from 'react';
import {
  X,
  Upload,
  Scissors,
  Sparkles,
  Check,
  RefreshCw,
  Sliders,
  Grid,
} from 'lucide-react';
import { Character, Speaker, SpeakerStyle } from '../types';
import {
  sliceSpriteSheet,
  createCharacterFromSprites,
  SlicedSprite,
  DEFAULT_EXPRESSION_LABELS,
} from '../utils/spriteSheetSlicer';

export interface ProviderItem {
  id: string;
  name: string;
  speakers?: Speaker[];
}

interface SpriteSheetModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaveCharacter: (character: Character) => void;
  providers?: ProviderItem[];
}

export const SpriteSheetModal: React.FC<SpriteSheetModalProps> = ({
  isOpen,
  onClose,
  onSaveCharacter,
  providers = [],
}) => {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [imageName, setImageName] = useState<string>('');
  const [columns, setColumns] = useState<number>(5);
  const [rows, setRows] = useState<number>(4);
  const [removeBg, setRemoveBg] = useState<boolean>(true);
  const [tolerance, setTolerance] = useState<number>(25);
  const [charName, setCharName] = useState<string>('Tech Girl');
  const [selectedProviderId, setSelectedProviderId] = useState<string>('voicevox');
  const [selectedSpeakerId, setSelectedSpeakerId] = useState<number>(3); // Zundamon
  const [selectedStyleId, setSelectedStyleId] = useState<number>(3);
  const [themeColor, setThemeColor] = useState<string>('#a855f7'); // Lilac purple
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [slicedSprites, setSlicedSprites] = useState<SlicedSprite[]>([]);
  const [previewSpriteIndex, setPreviewSpriteIndex] = useState<number>(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Initialize with Tech Girl sample
  const loadTechGirlPreset = () => {
    setImageSrc('/characters/tech_girl/spritesheet.webp');
    setImageName('tech_girl_spritesheet.webp');
    setColumns(5);
    setRows(4);
    setCharName('Tech Girl');
    setThemeColor('#a855f7');
  };

  useEffect(() => {
    if (isOpen && !imageSrc) {
      loadTechGirlPreset();
    }
  }, [isOpen]);

  // Re-slice whenever image, columns, rows, or removeBg change
  useEffect(() => {
    if (!imageSrc) {
      setSlicedSprites([]);
      return;
    }

    let cancelled = false;
    setIsProcessing(true);

    sliceSpriteSheet(imageSrc, {
      columns,
      rows,
      removeBackground: removeBg,
      tolerance,
      labels: DEFAULT_EXPRESSION_LABELS,
    })
      .then((sprites) => {
        if (!cancelled) {
          setSlicedSprites(sprites);
          setPreviewSpriteIndex(0);
        }
      })
      .catch((err) => {
        console.error('Failed to slice sprite sheet:', err);
      })
      .finally(() => {
        if (!cancelled) setIsProcessing(false);
      });

    return () => {
      cancelled = true;
    };
  }, [imageSrc, columns, rows, removeBg, tolerance]);

  if (!isOpen) return null;

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
      const url = URL.createObjectURL(file);
      setImageSrc(url);
      setImageName(file.name);
      const guessedName = file.name.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' ');
      setCharName(guessedName.charAt(0).toUpperCase() + guessedName.slice(1));
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type.startsWith('image/')) {
      const url = URL.createObjectURL(file);
      setImageSrc(url);
      setImageName(file.name);
      const guessedName = file.name.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' ');
      setCharName(guessedName.charAt(0).toUpperCase() + guessedName.slice(1));
    }
  };

  const handleSave = () => {
    if (slicedSprites.length === 0) return;

    const newChar = createCharacterFromSprites({
      name: charName.trim() || 'New Character',
      sprites: slicedSprites,
      ttsProviderId: selectedProviderId,
      speakerId: selectedSpeakerId,
      styleId: selectedStyleId,
      strokeColor: themeColor,
      textColor: '#ffffff',
    });

    onSaveCharacter(newChar);
    onClose();
  };

  const activeProvider = providers.find((p) => p.id === selectedProviderId) || providers[0];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-in fade-in duration-150">
      <div className="bg-[#141619] border border-[#2e3135] rounded-2xl shadow-2xl w-full max-w-4xl flex flex-col max-h-[92vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#242629]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#271d3b] flex items-center justify-center border border-[#4c3275]">
              <Scissors className="w-4 h-4 text-[#c084fc]" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white tracking-wide flex items-center gap-2">
                Auto-Slice Sprite Sheet
                <span className="text-[10px] font-mono font-normal px-2 py-0.5 rounded-full bg-[#271d3b] text-[#c084fc] border border-[#4c3275]">
                  Instant Character Generator
                </span>
              </h2>
              <p className="text-xs text-[#8e918f]">
                Drop any character grid image to auto-slice expressions and create a transparent tachie.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-[#202226] text-[#8e918f] hover:text-white transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 md:grid-cols-12 gap-6 min-h-0">
          {/* Left Column: Sheet Upload & Config */}
          <div className="md:col-span-5 flex flex-col gap-4">
            {/* Drop Zone */}
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleFileDrop}
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-[#34383e] hover:border-[#a855f7] rounded-xl p-4 flex flex-col items-center justify-center gap-2 text-center bg-[#181a1d] hover:bg-[#1d1a24] transition cursor-pointer group"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileSelect}
                className="hidden"
              />
              <Upload className="w-6 h-6 text-[#8e918f] group-hover:text-[#c084fc] transition" />
              <div className="text-xs text-[#c4c7c5]">
                <span className="text-[#c084fc] font-medium">Click to upload</span> or drag sprite sheet here
              </div>
              <span className="text-[10px] text-[#6f7377] font-mono">
                {imageName || 'PNG, WebP, JPG supported'}
              </span>
            </div>

            {/* Quick Preset Buttons */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={loadTechGirlPreset}
                className="flex-1 py-1.5 px-3 rounded-lg bg-[#271d3b] hover:bg-[#352554] text-[#c084fc] text-xs font-medium border border-[#4c3275] transition flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                Load Tech Girl Preset (20 Poses)
              </button>
            </div>

            {/* Grid Slicing Settings */}
            <div className="bg-[#181a1d] border border-[#242629] rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-[#e3e3e3]">
                <Grid className="w-3.5 h-3.5 text-[#c084fc]" />
                Grid Dimensions
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-mono text-[#8e918f] block mb-1">
                    Columns: <span className="text-white font-bold">{columns}</span>
                  </label>
                  <input
                    type="range"
                    min={1}
                    max={10}
                    value={columns}
                    onChange={(e) => setColumns(Number(e.target.value))}
                    className="w-full accent-[#a855f7]"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-mono text-[#8e918f] block mb-1">
                    Rows: <span className="text-white font-bold">{rows}</span>
                  </label>
                  <input
                    type="range"
                    min={1}
                    max={10}
                    value={rows}
                    onChange={(e) => setRows(Number(e.target.value))}
                    className="w-full accent-[#a855f7]"
                  />
                </div>
              </div>

              <div className="pt-2 border-t border-[#242629] space-y-2">
                <label className="flex items-center gap-2 cursor-pointer text-xs text-[#c4c7c5]">
                  <input
                    type="checkbox"
                    checked={removeBg}
                    onChange={(e) => setRemoveBg(e.target.checked)}
                    className="rounded accent-[#a855f7]"
                  />
                  <span>Auto-remove white background (transparent)</span>
                </label>

                {removeBg && (
                  <div>
                    <div className="flex justify-between text-[10px] font-mono text-[#8e918f] mb-1">
                      <span>Cutout tolerance</span>
                      <span>{tolerance}</span>
                    </div>
                    <input
                      type="range"
                      min={10}
                      max={60}
                      value={tolerance}
                      onChange={(e) => setTolerance(Number(e.target.value))}
                      className="w-full accent-[#a855f7]"
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Character & Voice Identity */}
            <div className="bg-[#181a1d] border border-[#242629] rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-[#e3e3e3]">
                <Sliders className="w-3.5 h-3.5 text-[#c084fc]" />
                Character Identity
              </div>

              <div>
                <label className="text-[11px] font-mono text-[#8e918f] block mb-1">Character Name</label>
                <input
                  type="text"
                  value={charName}
                  onChange={(e) => setCharName(e.target.value)}
                  placeholder="e.g. Tech Girl"
                  className="w-full bg-[#111214] border border-[#2e3135] rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-[#a855f7]"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] font-mono text-[#8e918f] block mb-1">Theme Color</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={themeColor}
                      onChange={(e) => setThemeColor(e.target.value)}
                      className="w-7 h-7 rounded border border-[#2e3135] bg-transparent cursor-pointer"
                    />
                    <span className="text-xs font-mono text-[#c4c7c5]">{themeColor}</span>
                  </div>
                </div>

                <div>
                  <label className="text-[11px] font-mono text-[#8e918f] block mb-1">Voice Provider</label>
                  <select
                    value={selectedProviderId}
                    onChange={(e) => {
                      setSelectedProviderId(e.target.value);
                      const p = providers.find((pr) => pr.id === e.target.value);
                      const firstStyle = p?.speakers?.[0]?.styles?.[0];
                      if (firstStyle) {
                        setSelectedSpeakerId(firstStyle.id);
                        setSelectedStyleId(firstStyle.id);
                      }
                    }}
                    className="w-full bg-[#111214] border border-[#2e3135] rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-[#a855f7]"
                  >
                    {providers.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {activeProvider && activeProvider.speakers && activeProvider.speakers.length > 0 && (
                <div>
                  <label className="text-[11px] font-mono text-[#8e918f] block mb-1">Default Speaker</label>
                  <select
                    value={selectedSpeakerId}
                    onChange={(e) => {
                      const id = Number(e.target.value);
                      setSelectedSpeakerId(id);
                      setSelectedStyleId(id);
                    }}
                    className="w-full bg-[#111214] border border-[#2e3135] rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-[#a855f7]"
                  >
                    {activeProvider.speakers.flatMap((spk: Speaker) =>
                      spk.styles.map((st: SpeakerStyle) => (
                        <option key={st.id} value={st.id}>
                          {spk.name} ({st.name})
                        </option>
                      ))
                    )}
                  </select>
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Sliced Grid & Preview */}
          <div className="md:col-span-7 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[#e3e3e3] flex items-center gap-1.5">
                <span>Sliced Sprites</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[#24272d] text-[#8e918f]">
                  {slicedSprites.length} expressions
                </span>
              </span>
              {isProcessing && (
                <span className="text-xs text-[#c084fc] flex items-center gap-1">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Slicing…
                </span>
              )}
            </div>

            {/* Sliced Sprites Grid */}
            <div className="flex-1 bg-[#0e0f11] border border-[#242629] rounded-xl p-3 overflow-y-auto max-h-[380px]">
              {slicedSprites.length === 0 ? (
                <div className="h-48 flex items-center justify-center text-xs text-[#6f7377]">
                  No sprites sliced yet. Upload a sheet to start.
                </div>
              ) : (
                <div
                  className="grid gap-2"
                  style={{
                    gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
                  }}
                >
                  {slicedSprites.map((sprite, i) => (
                    <button
                      key={sprite.index}
                      type="button"
                      onClick={() => setPreviewSpriteIndex(i)}
                      className={`relative group rounded-lg p-1.5 border transition cursor-pointer flex flex-col items-center bg-[#181a1d] ${
                        previewSpriteIndex === i
                          ? 'border-[#a855f7] ring-1 ring-[#a855f7] bg-[#221c2e]'
                          : 'border-[#2e3135] hover:border-[#4c3275]'
                      }`}
                    >
                      <div className="w-full aspect-square flex items-center justify-center overflow-hidden rounded bg-[radial-gradient(#24272d_1px,transparent_1px)] [background-size:8px_8px]">
                        <img
                          src={sprite.dataUrl}
                          alt={sprite.name}
                          className="max-h-full max-w-full object-contain pointer-events-none"
                        />
                      </div>
                      <span className="text-[9px] font-mono text-[#8e918f] truncate w-full text-center mt-1">
                        [{sprite.name}]
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Single Sprite Detailed Inspection */}
            {slicedSprites[previewSpriteIndex] && (
              <div className="bg-[#181a1d] border border-[#242629] rounded-xl p-3 flex items-center gap-4">
                <div className="w-16 h-16 rounded-lg bg-[radial-gradient(#24272d_1px,transparent_1px)] [background-size:8px_8px] border border-[#2e3135] flex items-center justify-center overflow-hidden flex-shrink-0">
                  <img
                    src={slicedSprites[previewSpriteIndex].dataUrl}
                    alt={slicedSprites[previewSpriteIndex].name}
                    className="max-h-full max-w-full object-contain"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-semibold text-white">
                      Selected: [{slicedSprites[previewSpriteIndex].name}]
                    </span>
                    <span className="text-[10px] font-mono text-[#8e918f]">
                      Index {previewSpriteIndex + 1} of {slicedSprites.length}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-[10px] font-mono text-[#8e918f]">Tag Name:</label>
                    <input
                      type="text"
                      value={slicedSprites[previewSpriteIndex].name}
                      onChange={(e) => {
                        const val = e.target.value.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
                        setSlicedSprites((prev) =>
                          prev.map((s, idx) => (idx === previewSpriteIndex ? { ...s, name: val } : s))
                        );
                      }}
                      className="bg-[#111214] border border-[#2e3135] rounded px-2 py-0.5 text-xs font-mono text-[#c084fc] focus:outline-none focus:border-[#a855f7]"
                    />
                    <span className="text-[10px] text-[#6f7377]">
                      (Use [{slicedSprites[previewSpriteIndex].name}] in script)
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-[#242629] bg-[#111214]">
          <div className="text-xs text-[#8e918f] font-mono">
            {slicedSprites.length > 0 && `${slicedSprites.length} transparent expressions ready`}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs text-[#8e918f] hover:text-white hover:bg-[#202226] transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={slicedSprites.length === 0 || isProcessing}
              onClick={handleSave}
              className="px-5 py-2 rounded-xl text-xs font-medium bg-[#7c3aed] hover:bg-[#6d28d9] disabled:opacity-50 text-white transition flex items-center gap-1.5 cursor-pointer shadow-lg shadow-purple-500/20"
            >
              <Check className="w-3.5 h-3.5" />
              Create Character ({slicedSprites.length} Poses)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

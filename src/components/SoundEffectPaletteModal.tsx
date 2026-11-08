import React, { useState } from 'react';
import { X, Play, Plus, Volume2 } from 'lucide-react';
import { SOUND_EFFECT_PRESETS, soundEffectManager } from '../utils/soundEffects';

interface SoundEffectPaletteModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentTime: number;
  onInsertSeItem: (presetId: string, name: string, duration: number) => void;
  onApplySeToSelectedVoice?: (presetId: string) => void;
  hasSelectedVoice?: boolean;
}

export const SoundEffectPaletteModal: React.FC<SoundEffectPaletteModalProps> = ({
  isOpen,
  onClose,
  currentTime,
  onInsertSeItem,
  onApplySeToSelectedVoice,
  hasSelectedVoice,
}) => {
  const [activeCategory, setActiveCategory] = useState<'all' | 'impact' | 'telop' | 'emotion' | 'scene'>('all');
  const [search, setSearch] = useState('');

  if (!isOpen) return null;

  const categories = [
    { id: 'all', label: 'All' },
    { id: 'impact', label: 'Impact & Hits' },
    { id: 'telop', label: 'Stings & Telop' },
    { id: 'emotion', label: 'Reactions' },
    { id: 'scene', label: 'Scene & Cues' },
  ] as const;

  const filtered = SOUND_EFFECT_PRESETS.filter((p) => {
    if (activeCategory !== 'all' && p.category !== activeCategory) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q) || p.id.includes(q);
    }
    return true;
  });

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-[#101114] border border-[#26282d] rounded-xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[85vh] overflow-hidden">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-[#202226] flex items-center justify-between bg-[#14161a]">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
              <Volume2 className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-[#e3e3e3] tracking-tight">
                Sound Effects Soundboard
              </h2>
              <span className="text-[10px] font-mono text-[#808388]">
                {SOUND_EFFECT_PRESETS.length} Presets · WebAudio Zero-latency Synthesis
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-[#808388] hover:text-[#e3e3e3] rounded-lg hover:bg-white/5 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Filters */}
        <div className="p-3 border-b border-[#1c1e22] bg-[#0c0d10] flex items-center gap-2 flex-wrap">
          <input
            type="text"
            placeholder="Search sound effects (deden, pop, chime, boom...)"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-[#14161a] border border-[#26282d] rounded-lg px-3 py-1.5 text-xs text-[#e3e3e3] focus:outline-none focus:border-blue-500 flex-1 min-w-[160px]"
          />
          <div className="flex gap-1">
            {categories.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setActiveCategory(c.id)}
                className={`px-2.5 py-1 text-xs rounded-lg transition font-medium ${
                  activeCategory === c.id
                    ? 'bg-blue-600/20 text-blue-300 border border-blue-500/40 shadow-xs'
                    : 'bg-[#14161a] text-[#808388] hover:text-[#c4c7c5] border border-transparent hover:border-[#26282d]'
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>

        {/* Sound List */}
        <div className="p-4 overflow-y-auto grid grid-cols-1 md:grid-cols-2 gap-2 flex-1 min-h-[300px] bg-[#0c0d10]">
          {filtered.map((preset) => (
            <div
              key={preset.id}
              className="bg-[#14161a] hover:bg-[#181a1f] border border-[#202226] hover:border-[#32363e] rounded-lg p-2.5 flex items-center justify-between gap-2.5 transition group"
            >
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <button
                  type="button"
                  onClick={() => soundEffectManager.play(preset.id)}
                  className="w-7 h-7 rounded-lg bg-[#1f2228] hover:bg-blue-500 text-blue-400 hover:text-white border border-[#2d3038] flex items-center justify-center transition flex-shrink-0"
                  title="Preview sound"
                >
                  <Play className="w-3 h-3 fill-current ml-0.5" />
                </button>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-medium text-[#e3e3e3] truncate">
                      {preset.name}
                    </span>
                    <span className="text-[9px] font-mono text-[#606368] px-1 py-0.2 rounded bg-black/40">
                      {preset.duration}s
                    </span>
                  </div>
                  <p className="text-[10px] text-[#808388] truncate mt-0.5">
                    {preset.description}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5 flex-shrink-0">
                {hasSelectedVoice && onApplySeToSelectedVoice && (
                  <button
                    type="button"
                    onClick={() => {
                      onApplySeToSelectedVoice(preset.id);
                      soundEffectManager.play(preset.id);
                      onClose();
                    }}
                    className="px-2 py-1 text-[10px] font-mono bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 text-blue-300 rounded-md transition"
                    title="Apply this sound effect to selected dialogue"
                  >
                    Apply
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    onInsertSeItem(preset.id, preset.name, preset.duration);
                    soundEffectManager.play(preset.id);
                    onClose();
                  }}
                  className="px-2.5 py-1 text-[10px] font-mono bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 rounded-md flex items-center gap-1 transition"
                  title={`Place at current playhead (${currentTime.toFixed(2)}s)`}
                >
                  <Plus className="w-3 h-3" />
                  Place
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Footer info */}
        <div className="px-5 py-2.5 bg-[#14161a] border-t border-[#202226] flex items-center justify-between text-xs text-[#808388]">
          <span>Playhead: {currentTime.toFixed(2)}s</span>
          <span className="font-mono text-[11px]">WAV Export Ready · Royalty-Free</span>
        </div>
      </div>
    </div>
  );
};

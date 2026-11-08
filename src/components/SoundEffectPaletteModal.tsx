import React, { useState } from 'react';
import { X, Play, Plus } from 'lucide-react';
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
    { id: 'impact', label: '💥 Impact & Attack' },
    { id: 'telop', label: '✨ Telop & Intro' },
    { id: 'emotion', label: '❓ Reaction & Emotion' },
    { id: 'scene', label: '🛎️ Scene & Punchline' },
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
    <div className="fixed inset-0 z-50 bg-black/65 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-[#141619] border border-[#2e3135] rounded-lg shadow-2xl w-full max-w-2xl flex flex-col max-h-[85vh] overflow-hidden">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-[#25282c] flex items-center justify-between bg-[#191b1f]">
          <div className="flex items-center gap-2">
            <span className="text-lg">🔔</span>
            <h2 className="text-sm font-semibold text-[#e3e3e3]">
              Sound Effects Soundboard
            </h2>
            <span className="text-[11px] font-mono text-[#8e918f] ml-2">
              {SOUND_EFFECT_PRESETS.length} Presets · WebAudio Zero-latency Synthesis
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-[#8e918f] hover:text-[#e3e3e3] rounded transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Filters */}
        <div className="p-3 border-b border-[#222528] bg-[#111315] flex items-center gap-2 flex-wrap">
          <input
            type="text"
            placeholder="Search sound effects (pop, boom, chime...)"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-[#1b1d21] border border-[#2a2d32] rounded px-3 py-1.5 text-xs text-[#e3e3e3] focus:outline-none focus:border-[#8ab4f8] flex-1 min-w-[160px]"
          />
          <div className="flex gap-1">
            {categories.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setActiveCategory(c.id)}
                className={`px-2.5 py-1 text-xs rounded transition ${
                  activeCategory === c.id
                    ? 'bg-[#2a3a50] text-[#8ab4f8] border border-[#3b557a]'
                    : 'bg-[#181a1d] text-[#8e918f] hover:text-[#c4c7c5] border border-transparent'
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>

        {/* Sound List */}
        <div className="p-4 overflow-y-auto grid grid-cols-1 md:grid-cols-2 gap-2.5 flex-1 min-h-[300px]">
          {filtered.map((preset) => (
            <div
              key={preset.id}
              className="bg-[#191b1f] hover:bg-[#1e2126] border border-[#2a2d32] hover:border-[#3a3f47] rounded-md p-3 flex items-center justify-between gap-3 transition group"
            >
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <button
                  type="button"
                  onClick={() => soundEffectManager.play(preset.id)}
                  className="w-8 h-8 rounded-full bg-[#262930] hover:bg-[#8ab4f8] text-[#8ab4f8] hover:text-[#0f1115] flex items-center justify-center transition flex-shrink-0 shadow-sm"
                  title="Preview sound"
                >
                  <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                </button>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm">{preset.icon}</span>
                    <span className="text-xs font-semibold text-[#e3e3e3] truncate">
                      {preset.name}
                    </span>
                    <span className="text-[10px] font-mono text-[#8e918f]">
                      {preset.duration}s
                    </span>
                  </div>
                  <p className="text-[11px] text-[#8e918f] truncate mt-0.5">
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
                    className="px-2 py-1 text-[11px] font-mono bg-[#1c2430] hover:bg-[#233144] border border-[#2b3e57] text-[#8ab4f8] rounded transition"
                    title="Apply this sound effect to selected dialogue"
                  >
                    Apply to Voice
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    onInsertSeItem(preset.id, preset.name, preset.duration);
                    soundEffectManager.play(preset.id);
                    onClose();
                  }}
                  className="px-2.5 py-1 text-[11px] font-mono bg-[#1f2824] hover:bg-[#283931] border border-[#2e473b] text-emerald-300 rounded flex items-center gap-1 transition"
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
        <div className="px-5 py-2.5 bg-[#101214] border-t border-[#222528] flex items-center justify-between text-xs text-[#8e918f]">
          <span>Playhead: {currentTime.toFixed(2)}s</span>
          <span>WAV Export Ready · 100% Royalty-Free & Commercial Use</span>
        </div>
      </div>
    </div>
  );
};

import React, { useState } from 'react';
import { Trash2, Volume2, Loader2, Send, Sliders, Copy, Scissors } from 'lucide-react';
import { Character, VoiceItem } from '../types';
import { CustomSelect } from './CustomSelect';

interface ScriptEditorProps {
  items: VoiceItem[];
  characters: Character[];
  currentTime: number;
  onAddItem: (characterId: string, text: string, startTime: number) => Promise<void>;
  onUpdateItem: (id: string, updates: Partial<VoiceItem>) => void;
  onDeleteItem: (id: string) => void;
  onDuplicateItem: (id: string) => void;
  onSplitItem: (id: string, splitTime: number) => void;
  onSeek: (time: number) => void;
  onPlaySingle: (item: VoiceItem) => void;
  onSynthesizeItem: (id: string) => Promise<void>;
}

export const ScriptEditor: React.FC<ScriptEditorProps> = ({
  items,
  characters,
  currentTime,
  onAddItem,
  onUpdateItem,
  onDeleteItem,
  onDuplicateItem,
  onSplitItem,
  onSeek,
  onPlaySingle,
  onSynthesizeItem,
}) => {
  const [inputText, setInputText] = useState('');
  const [selectedCharacterId, setSelectedCharacterId] = useState<string>(characters[0]?.id || '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);

  const activeCharId = characters.some((c) => c.id === selectedCharacterId)
    ? selectedCharacterId
    : characters[0]?.id || '';

  const handleAdd = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputText.trim()) return;

    setIsSubmitting(true);
    try {
      let startTime = currentTime;
      if (items.length > 0) {
        const lastItem = items[items.length - 1];
        const lastEndTime = lastItem.startTime + lastItem.duration;
        startTime = Math.max(currentTime, lastEndTime);
      }

      await onAddItem(activeCharId, inputText.trim(), startTime);
      setInputText('');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleAdd();
    }
  };

  const selectedChar = characters.find((c) => c.id === activeCharId) || characters[0];

  return (
    <div className="flex flex-col h-full bg-[#1e1f20] border border-[#282a2c] rounded-2xl overflow-hidden shadow-lg">
      {/* Header */}
      <div className="px-5 py-3.5 bg-[#1e1f20] border-b border-[#282a2c] flex items-center justify-between">
        <h2 className="font-semibold text-sm text-[#e3e3e3] tracking-tight">
          Script & Captions
        </h2>
        <span className="text-xs text-[#8e918f]">
          {items.length} clips
        </span>
      </div>

      {/* Script List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {items.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-8 text-[#8e918f]">
            <p className="text-sm font-medium text-[#c4c7c5]">No captions yet</p>
            <p className="text-xs mt-1.5 text-[#8e918f] max-w-xs leading-relaxed">
              Type in the prompt bar below and hit Enter to generate voice and caption sync.
            </p>
          </div>
        ) : (
          items.map((item) => {
            const isActive = currentTime >= item.startTime && currentTime <= item.startTime + item.duration;
            const isExpanded = expandedItemId === item.id;

            return (
              <div
                key={item.id}
                className={`p-3.5 rounded-xl border transition-all duration-150 flex flex-col gap-2.5 ${
                  isActive
                    ? 'bg-[#282a2c] border-[#8ab4f8] shadow-md ring-1 ring-[#8ab4f8]/30'
                    : 'bg-[#18191b] border-[#2e3134] hover:border-[#444746]'
                }`}
              >
                {/* Row Header */}
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <CustomSelect
                      value={item.characterId}
                      options={characters.map((c) => ({
                        value: c.id,
                        label: c.name,
                        icon: c.avatar.idle,
                      }))}
                      onChange={(newCharId) => {
                        onUpdateItem(item.id, { characterId: newCharId });
                        setTimeout(() => onSynthesizeItem(item.id), 50);
                      }}
                    />

                    <button
                      onClick={() => onSeek(item.startTime)}
                      className="text-[#8e918f] hover:text-[#8ab4f8] font-mono text-[11px] transition"
                      title="Seek to this timestamp"
                    >
                      {item.startTime.toFixed(2)}s 〜 {(item.startTime + item.duration).toFixed(2)}s
                    </button>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1">
                    {/* Voice Tuning */}
                    <button
                      onClick={() => setExpandedItemId(isExpanded ? null : item.id)}
                      className={`p-1.5 rounded-full transition ${
                        isExpanded ? 'bg-[#004a77] text-[#c2e7ff]' : 'hover:bg-[#2e3134] text-[#8e918f]'
                      }`}
                      title="Voice tuning (Speed & Pitch)"
                    >
                      <Sliders className="w-3.5 h-3.5" />
                    </button>

                    {/* Play Audio */}
                    <button
                      onClick={() => onPlaySingle(item)}
                      disabled={item.isSynthesizing}
                      className="p-1.5 rounded-full hover:bg-[#2e3134] text-[#c4c7c5] hover:text-white transition disabled:opacity-40"
                      title="Play audio preview"
                    >
                      {item.isSynthesizing ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-[#8ab4f8]" />
                      ) : (
                        <Volume2 className="w-3.5 h-3.5" />
                      )}
                    </button>

                    {/* Duplicate */}
                    <button
                      onClick={() => onDuplicateItem(item.id)}
                      className="p-1.5 rounded-full hover:bg-[#2e3134] text-[#8e918f] hover:text-white transition"
                      title="Duplicate caption"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>

                    {/* Split */}
                    <button
                      onClick={() => onSplitItem(item.id, currentTime)}
                      className="p-1.5 rounded-full hover:bg-[#2e3134] text-[#8e918f] hover:text-white transition"
                      title="Split caption at playhead"
                    >
                      <Scissors className="w-3.5 h-3.5" />
                    </button>

                    {/* Delete */}
                    <button
                      onClick={() => onDeleteItem(item.id)}
                      className="p-1.5 rounded-full hover:bg-red-500/10 text-[#8e918f] hover:text-red-400 transition"
                      title="Delete"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Text Input */}
                <input
                  type="text"
                  value={item.text}
                  onChange={(e) => onUpdateItem(item.id, { text: e.target.value })}
                  onBlur={() => onSynthesizeItem(item.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      (e.target as HTMLInputElement).blur();
                    }
                  }}
                  className="w-full bg-transparent text-sm text-[#e3e3e3] border-b border-transparent focus:border-[#8ab4f8] outline-none py-0.5 transition"
                />

                {/* Voice Tuning Panel */}
                {isExpanded && (
                  <div className="pt-2 border-t border-[#2e3134] grid grid-cols-2 gap-3 text-xs text-[#c4c7c5]">
                    <div>
                      <div className="flex justify-between mb-1">
                        <span>Speed: {(item.speedScale || 1.0).toFixed(2)}x</span>
                      </div>
                      <input
                        type="range"
                        min={0.7}
                        max={1.8}
                        step={0.05}
                        value={item.speedScale || 1.0}
                        onChange={(e) => {
                          onUpdateItem(item.id, { speedScale: parseFloat(e.target.value) });
                        }}
                        onMouseUp={() => onSynthesizeItem(item.id)}
                        className="w-full accent-[#8ab4f8] h-1 bg-[#3c4043] rounded-full appearance-none cursor-pointer"
                      />
                    </div>
                    <div>
                      <div className="flex justify-between mb-1">
                        <span>Pitch: {(item.pitchScale || 0.0).toFixed(2)}</span>
                      </div>
                      <input
                        type="range"
                        min={-0.15}
                        max={0.15}
                        step={0.01}
                        value={item.pitchScale || 0.0}
                        onChange={(e) => {
                          onUpdateItem(item.id, { pitchScale: parseFloat(e.target.value) });
                        }}
                        onMouseUp={() => onSynthesizeItem(item.id)}
                        className="w-full accent-[#8ab4f8] h-1 bg-[#3c4043] rounded-full appearance-none cursor-pointer"
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Footer: Prompt Input Bar */}
      <div className="p-4 bg-[#1e1f20] border-t border-[#282a2c] space-y-2.5">
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {characters.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setSelectedCharacterId(c.id)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition flex-shrink-0 ${
                activeCharId === c.id
                  ? 'bg-[#004a77] text-[#c2e7ff]'
                  : 'bg-[#282a2c] text-[#c4c7c5] hover:text-white hover:bg-[#333538]'
              }`}
            >
              {c.name}
            </button>
          ))}
        </div>

        <form onSubmit={handleAdd} className="relative flex items-center">
          <input
            type="text"
            placeholder={`Type for ${selectedChar?.name || 'speaker'}...`}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isSubmitting}
            className="w-full bg-[#131314] border border-[#3c4043] focus:border-[#8ab4f8] rounded-full pl-4 pr-12 py-2.5 text-sm text-[#e3e3e3] placeholder-[#8e918f] outline-none transition shadow-inner"
          />
          <button
            type="submit"
            disabled={!inputText.trim() || isSubmitting}
            className="absolute right-1.5 p-2 rounded-full bg-[#8ab4f8] hover:bg-[#a8c7fa] text-[#001d35] transition disabled:opacity-30 disabled:bg-[#3c4043] disabled:text-[#8e918f] shadow-sm"
          >
            {isSubmitting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </button>
        </form>
      </div>
    </div>
  );
};

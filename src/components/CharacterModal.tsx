import React, { useState, useEffect } from 'react';
import { X, Image, SlidersHorizontal, Plus, Trash2, Upload, Sparkles, Type } from 'lucide-react';
import { Character, Speaker } from '../types';
import { ttsManager } from '../services/tts/TTSManager';
import { CustomSelect } from './CustomSelect';
import { SUBTITLE_PRESETS } from '../utils/subtitlePresets';

interface CharacterModalProps {
  isOpen: boolean;
  onClose: () => void;
  characters: Character[];
  onUpdateCharacter: (id: string, updates: Partial<Character>) => void;
  onAddCharacter: (character: Character) => void;
  onDeleteCharacter: (id: string) => void;
}

export const CharacterModal: React.FC<CharacterModalProps> = ({
  isOpen,
  onClose,
  characters,
  onUpdateCharacter,
  onAddCharacter,
  onDeleteCharacter,
}) => {
  const [selectedCharId, setSelectedCharId] = useState<string>(characters[0]?.id || '');
  const [speakers, setSpeakers] = useState<Speaker[]>([]);

  useEffect(() => {
    if (isOpen) {
      ttsManager.getAllSpeakers().then((list) => {
        const vv = list.find((item) => item.providerId === 'voicevox');
        if (vv) setSpeakers(vv.speakers);
      });
      if (!selectedCharId && characters.length > 0) {
        setSelectedCharId(characters[0].id);
      }
    }
  }, [isOpen, characters, selectedCharId]);

  if (!isOpen) return null;

  const char = characters.find((c) => c.id === selectedCharId) || characters[0];

  const handleAvatarFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && char) {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          const imgUrl = event.target.result as string;
          onUpdateCharacter(char.id, {
            avatar: {
              idle: imgUrl,
              speaking: imgUrl,
              blinking: imgUrl,
            },
          });
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleAddNewCharacter = () => {
    const newId = `char_${Date.now()}`;
    const newChar: Character = {
      id: newId,
      name: `Speaker ${characters.length + 1}`,
      ttsProviderId: 'voicevox',
      speakerId: speakers[0]?.styles[0]?.id ?? 3,
      styleId: speakers[0]?.styles[0]?.id ?? 3,
      avatar: {
        idle: '/characters/zundamon.png',
        speaking: '/characters/zundamon.png',
        blinking: '/characters/zundamon.png',
      },
      subtitleStyle: {
        ...SUBTITLE_PRESETS[0].style,
        outerStrokeColor: '#3b82f6',
      },
      position: 'right',
    };

    onAddCharacter(newChar);
    setSelectedCharId(newId);
  };

  const positions: Array<{ id: 'left' | 'right' | 'center' | 'hidden'; label: string }> = [
    { id: 'left', label: 'Left' },
    { id: 'center', label: 'Center' },
    { id: 'right', label: 'Right' },
    { id: 'hidden', label: 'Hidden' },
  ];

  const voiceOptions = speakers.flatMap((s) =>
    s.styles.map((st) => ({
      value: st.id,
      label: `${s.name} (${st.name})`,
    }))
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[#1e1f20] border border-[#282a2c] rounded-3xl w-full max-w-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#282a2c] flex items-center justify-between bg-[#1e1f20]">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="w-4 h-4 text-[#8ab4f8]" />
            <h3 className="font-semibold text-sm text-[#e3e3e3]">
              Speakers & Caption Studio
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full text-[#8e918f] hover:text-white hover:bg-[#282a2c] transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left: Speaker List */}
          <div className="w-56 border-r border-[#282a2c] bg-[#18191b] p-3 flex flex-col justify-between flex-shrink-0">
            <div className="space-y-1.5 overflow-y-auto">
              <span className="text-[10px] font-mono text-[#8e918f] uppercase px-2 mb-1 block">
                Speakers ({characters.length})
              </span>
              {characters.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setSelectedCharId(c.id)}
                  className={`w-full px-3 py-2 rounded-xl text-left text-xs font-medium flex items-center justify-between transition ${
                    selectedCharId === c.id
                      ? 'bg-[#004a77] text-[#c2e7ff] shadow-sm'
                      : 'text-[#c4c7c5] hover:text-white hover:bg-[#282a2c]'
                  }`}
                >
                  <div className="flex items-center gap-2.5 truncate">
                    <div className="w-6 h-6 rounded-full overflow-hidden bg-[#131314] flex-shrink-0 border border-white/10">
                      <img src={c.avatar.idle} alt="" className="w-full h-full object-cover" />
                    </div>
                    <span className="truncate">{c.name}</span>
                  </div>
                </button>
              ))}
            </div>

            <button
              onClick={handleAddNewCharacter}
              className="mt-3 w-full py-2 px-3 rounded-xl bg-[#282a2c] hover:bg-[#333538] text-[#8ab4f8] text-xs font-medium flex items-center justify-center gap-1.5 border border-[#3c4043] transition"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Speaker
            </button>
          </div>

          {/* Right: Speaker Config */}
          {char ? (
            <div className="flex-1 p-6 overflow-y-auto space-y-6 bg-[#1e1f20]">
              {/* Speaker Name & Voice Style */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-[#8e918f] block mb-1">Speaker Name</label>
                  <input
                    type="text"
                    value={char.name}
                    onChange={(e) => onUpdateCharacter(char.id, { name: e.target.value })}
                    className="w-full bg-[#131314] border border-[#3c4043] focus:border-[#8ab4f8] rounded-xl px-3.5 py-2 text-xs text-[#e3e3e3] outline-none"
                    placeholder="Name"
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-[#8e918f] block mb-1">TTS Voice Model</label>
                  <CustomSelect
                    className="w-full"
                    value={char.speakerId}
                    options={voiceOptions.length > 0 ? voiceOptions : [{ value: char.speakerId, label: `Voice ID ${char.speakerId}` }]}
                    onChange={(val) => onUpdateCharacter(char.id, { speakerId: parseInt(val) })}
                  />
                </div>
              </div>

              {/* Screen Position */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-[#8e918f]">Screen Position</label>
                  {characters.length > 1 && (
                    <button
                      onClick={() => {
                        onDeleteCharacter(char.id);
                        setSelectedCharId(characters.find((c) => c.id !== char.id)?.id || '');
                      }}
                      className="text-[11px] text-red-400 hover:text-red-300 flex items-center gap-1 transition"
                    >
                      <Trash2 className="w-3 h-3" /> Delete Speaker
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {positions.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => onUpdateCharacter(char.id, { position: p.id })}
                      className={`py-2 px-3 rounded-xl text-xs font-medium border text-center transition ${
                        char.position === p.id
                          ? 'bg-[#8ab4f8] text-[#001d35] border-[#8ab4f8] shadow-sm font-semibold'
                          : 'bg-[#131314] text-[#c4c7c5] border-[#3c4043] hover:border-[#8e918f]'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Avatar Image Picker */}
              <div className="space-y-2">
                <label className="text-xs font-medium text-[#8e918f] block flex items-center gap-1.5">
                  <Image className="w-3.5 h-3.5 text-[#8ab4f8]" /> Avatar Image
                </label>
                <div className="flex items-center gap-4 bg-[#131314] p-3.5 rounded-2xl border border-[#282a2c]">
                  <div className="w-14 h-16 bg-[#1e1f20] rounded-xl overflow-hidden border border-[#3c4043] flex items-center justify-center flex-shrink-0">
                    <img src={char.avatar.idle} alt="" className="w-full h-full object-contain" />
                  </div>
                  <div className="flex-1 space-y-1">
                    <p className="text-xs text-[#e3e3e3] font-medium">{char.name}'s visual avatar</p>
                    <p className="text-[11px] text-[#8e918f]">Transparent PNG or WebP</p>
                    <label className="inline-flex items-center gap-1.5 px-3 py-1 bg-[#282a2c] hover:bg-[#333538] text-[#8ab4f8] text-xs font-medium rounded-full cursor-pointer transition">
                      <Upload className="w-3 h-3" />
                      Choose Image File
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleAvatarFile}
                      />
                    </label>
                  </div>
                </div>
              </div>

              {/* Caption Presets (ワンクリックで極上テロップに) */}
              <div className="space-y-2">
                <label className="text-xs font-medium text-[#8e918f] block flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-[#8ab4f8]" /> Quick Caption Presets
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {SUBTITLE_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => {
                        onUpdateCharacter(char.id, {
                          subtitleStyle: {
                            ...preset.style,
                            // キャラクターの外側色だけ維持するかプリセット適用
                            outerStrokeColor: char.subtitleStyle.outerStrokeColor || preset.style.outerStrokeColor,
                          },
                        });
                      }}
                      className="p-2.5 rounded-xl bg-[#131314] hover:bg-[#282a2c] border border-[#3c4043] text-left transition flex flex-col gap-1"
                    >
                      <span className="text-xs font-semibold text-[#e3e3e3]">{preset.name}</span>
                      <span
                        className="text-xs font-black tracking-wide"
                        style={{
                          color: preset.style.textColor,
                          textShadow: `0 0 4px ${preset.style.strokeColor || '#000'}`,
                        }}
                      >
                        SAMPLE TEXT
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Detailed Caption Customizer */}
              <div className="space-y-3">
                <label className="text-xs font-medium text-[#8e918f] block flex items-center gap-1.5">
                  <Type className="w-3.5 h-3.5 text-[#8ab4f8]" /> Caption Styling & Colors
                </label>
                <div className="bg-[#131314] p-4 rounded-2xl border border-[#282a2c] space-y-4">
                  {/* Colors Grid */}
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <span className="text-[11px] text-[#8e918f] block mb-1">Text Color</span>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={char.subtitleStyle.textColor}
                          onChange={(e) =>
                            onUpdateCharacter(char.id, {
                              subtitleStyle: { ...char.subtitleStyle, textColor: e.target.value },
                            })
                          }
                          className="w-7 h-7 rounded-full border-0 cursor-pointer bg-transparent"
                        />
                        <span className="text-xs font-mono text-[#e3e3e3]">{char.subtitleStyle.textColor}</span>
                      </div>
                    </div>

                    <div>
                      <span className="text-[11px] text-[#8e918f] block mb-1">Inner Stroke</span>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={char.subtitleStyle.strokeColor}
                          onChange={(e) =>
                            onUpdateCharacter(char.id, {
                              subtitleStyle: { ...char.subtitleStyle, strokeColor: e.target.value },
                            })
                          }
                          className="w-7 h-7 rounded-full border-0 cursor-pointer bg-transparent"
                        />
                        <span className="text-xs font-mono text-[#e3e3e3]">{char.subtitleStyle.strokeColor}</span>
                      </div>
                    </div>

                    <div>
                      <span className="text-[11px] text-[#8e918f] block mb-1">Outer Stroke</span>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={char.subtitleStyle.outerStrokeColor || '#10b981'}
                          onChange={(e) =>
                            onUpdateCharacter(char.id, {
                              subtitleStyle: { ...char.subtitleStyle, outerStrokeColor: e.target.value },
                            })
                          }
                          className="w-7 h-7 rounded-full border-0 cursor-pointer bg-transparent"
                        />
                        <span className="text-xs font-mono text-[#e3e3e3]">
                          {char.subtitleStyle.outerStrokeColor || '#10b981'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Sliders */}
                  <div className="grid grid-cols-2 gap-4 pt-2 border-t border-[#282a2c]">
                    <div>
                      <div className="flex justify-between text-xs text-[#c4c7c5] mb-1">
                        <span>Font Size</span>
                        <span className="font-mono">{char.subtitleStyle.fontSize}px</span>
                      </div>
                      <input
                        type="range"
                        min={24}
                        max={64}
                        value={char.subtitleStyle.fontSize}
                        onChange={(e) =>
                          onUpdateCharacter(char.id, {
                            subtitleStyle: {
                              ...char.subtitleStyle,
                              fontSize: parseInt(e.target.value),
                            },
                          })
                        }
                        className="w-full accent-[#8ab4f8] h-1 bg-[#3c4043] rounded-full appearance-none cursor-pointer"
                      />
                    </div>

                    <div>
                      <div className="flex justify-between text-xs text-[#c4c7c5] mb-1">
                        <span>Outer Border Thickness</span>
                        <span className="font-mono">{char.subtitleStyle.outerStrokeWidth || 14}px</span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={24}
                        value={char.subtitleStyle.outerStrokeWidth || 14}
                        onChange={(e) =>
                          onUpdateCharacter(char.id, {
                            subtitleStyle: {
                              ...char.subtitleStyle,
                              outerStrokeWidth: parseInt(e.target.value),
                            },
                          })
                        }
                        className="w-full accent-[#8ab4f8] h-1 bg-[#3c4043] rounded-full appearance-none cursor-pointer"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-xs text-[#8e918f]">
              Select or add a speaker.
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-[#282a2c] bg-[#18191b] flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 bg-[#8ab4f8] hover:bg-[#a8c7fa] text-[#001d35] text-xs font-semibold rounded-full transition"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};

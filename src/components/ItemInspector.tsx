import React, { useEffect, useState } from 'react';
import {
  X,
  Trash2,
  Crosshair,
  Volume2,
  Image as ImageIcon,
  Music,
  Type,
  MessageSquare,
  Film,
  FolderOpen,
  Wand2,
  ChevronUp,
  ChevronDown,
  Diamond,
  Plus,
} from 'lucide-react';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import {
  AudioItem,
  Character,
  ImageItem,
  ItemAnimation,
  KeyframeEasing,
  SubtitleStyle,
  TextItem,
  TimelineItem,
  TransformKeyframe,
  VoiceItem,
} from '../types';
import { toAssetUrl } from '../utils/imageUtils';
import { SUBTITLE_PRESETS } from '../utils/subtitlePresets';
import {
  addSnapshotKeyframe,
  getItemBaseTransform,
  sampleKeyframes,
} from '../render/keyframes';

interface ItemInspectorProps {
  isOpen: boolean;
  item: TimelineItem | null;
  characters: Character[];
  /** Playhead position in seconds, used by the keyframe editor. */
  currentTime: number;
  onClose: () => void;
  onUpdate: (id: string, updates: Partial<TimelineItem>) => void;
  onDelete: (id: string) => void;
  onSeek: (time: number) => void;
  onSynthesize: (id: string) => void;
  onDuplicate: (id: string) => void;
}

const labelClass = 'text-[10px] font-mono uppercase tracking-wider text-[#8e918f]';
const inputClass =
  'w-full bg-[#0d0e10] border border-[#2a2c30] rounded-sm px-2.5 py-1.5 text-xs text-[#e3e3e3] focus:outline-none focus:border-[#8ab4f8]';

const ANIMATION_OPTIONS: Array<{ value: ItemAnimation; label: string }> = [
  { value: 'none', label: 'None' },
  { value: 'fade', label: 'Fade' },
  { value: 'slide-up', label: 'Slide up' },
  { value: 'slide-down', label: 'Slide down' },
  { value: 'slide-left', label: 'Slide left' },
  { value: 'slide-right', label: 'Slide right' },
  { value: 'zoom', label: 'Zoom' },
  { value: 'pop', label: 'Pop' },
];

const Field: React.FC<{ label: string; children: React.ReactNode; className?: string }> = ({
  label,
  children,
  className,
}) => (
  <label className={`space-y-1 block ${className || ''}`}>
    <span className={labelClass}>{label}</span>
    {children}
  </label>
);

const NumberField: React.FC<{
  label: string;
  value: number | undefined;
  onChange: (value: number) => void;
  step?: number;
  min?: number;
  max?: number;
}> = ({ label, value, onChange, step = 0.01, min, max }) => (
  <Field label={label}>
    <input
      type="number"
      value={Number.isFinite(value as number) ? value : 0}
      step={step}
      min={min}
      max={max}
      onChange={(e) => onChange(Number(e.target.value))}
      className={inputClass}
    />
  </Field>
);

const SliderField: React.FC<{
  label: string;
  value: number | undefined;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step: number;
}> = ({ label, value, onChange, min, max, step }) => (
  <Field label={`${label}  (${(value ?? 0).toFixed(2)})`}>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value ?? 0}
      onChange={(e) => onChange(Number(e.target.value))}
      className="w-full accent-[#3b82f6]"
    />
  </Field>
);

const ColorField: React.FC<{
  label: string;
  value: string | undefined;
  onChange: (value: string) => void;
}> = ({ label, value, onChange }) => (
  <Field label={label}>
    <div className="flex items-center gap-1.5">
      <input
        type="color"
        value={/^#[0-9a-fA-F]{6}$/.test(value || '') ? value : '#ffffff'}
        onChange={(e) => onChange(e.target.value)}
        className="w-7 h-7 bg-transparent border border-[#2a2c30] rounded-sm cursor-pointer p-0.5"
      />
      <input value={value || ''} onChange={(e) => onChange(e.target.value)} className={inputClass} />
    </div>
  </Field>
);

const EASING_OPTIONS: Array<{ value: KeyframeEasing; label: string }> = [
  { value: 'linear', label: 'Linear' },
  { value: 'ease-in', label: 'Ease in' },
  { value: 'ease-out', label: 'Ease out' },
  { value: 'ease-in-out', label: 'Ease in-out' },
  { value: 'hold', label: 'Hold' },
];

/**
 * YMM4-style transform keyframes. Keys store only the values the user edits;
 * the sampler fills the rest from the previous key or the item's base values.
 */
const KeyframeSection: React.FC<{
  item: TextItem | ImageItem;
  currentTime: number;
  onUpdate: (id: string, updates: Partial<TimelineItem>) => void;
  onSeek: (time: number) => void;
}> = ({ item, currentTime, onUpdate, onSeek }) => {
  const [selectedKeyId, setSelectedKeyId] = useState<string | null>(null);
  const keys = [...(item.keyframes ?? [])].sort((a, b) => a.time - b.time);
  const localTime = Math.max(0, Math.min(item.duration, currentTime - item.startTime));
  const base = getItemBaseTransform(item);
  const selected = keys.find((key) => key.id === selectedKeyId) ?? null;
  const resolved = selected ? sampleKeyframes(keys, selected.time, base) : base;
  const unit = item.type === 'text' ? '%' : 'px';
  const duration = Math.max(0.05, item.duration);

  const commit = (next: TransformKeyframe[]) => {
    const sorted = [...next].sort((a, b) => a.time - b.time);
    onUpdate(item.id, {
      keyframes: sorted.length > 0 ? sorted : undefined,
    } as Partial<TimelineItem>);
  };

  const addKeyframe = () => {
    const result = addSnapshotKeyframe(item, currentTime);
    if (!result.existed) commit(result.keyframes);
    setSelectedKeyId(result.keyframe.id);
  };

  const updateSelected = (updates: Partial<TransformKeyframe>) => {
    if (!selected) return;
    commit(keys.map((key) => (key.id === selected.id ? { ...key, ...updates } : key)));
  };

  return (
    <section className="border-t border-[#242629] pt-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <span className={labelClass}>Keyframes</span>
          <p className="text-[10px] font-mono text-[#6f7276] mt-0.5">
            Transform units: {item.type === 'text' ? 'canvas percent' : 'project pixels'}
          </p>
        </div>
        <button
          type="button"
          onClick={addKeyframe}
          title="Add a keyframe at the playhead (K)"
          className="px-2 py-1 text-[11px] font-mono bg-[#10202c] border border-[#2a3b4d] rounded-sm text-[#8ab4f8] hover:bg-[#163042] flex items-center gap-1 flex-shrink-0"
        >
          <Plus className="w-3 h-3" /> Key at {localTime.toFixed(2)}s
        </button>
      </div>

      {keys.length === 0 ? (
        <p className="text-[10px] font-mono text-[#6f7276] leading-relaxed">
          No keyframes. Place the playhead inside this item, click “Key at …”, then edit X/Y,
          scale, rotation or opacity. Values between keys are interpolated in preview and export.
        </p>
      ) : (
        <>
          <div className="relative h-7 bg-[#0b0c0e] border border-[#242629] rounded-sm overflow-hidden">
            <div
              className="absolute top-0 bottom-0 w-px bg-[#8ab4f8]/60 pointer-events-none"
              style={{ left: `${(localTime / duration) * 100}%` }}
            />
            {keys.map((key) => (
              <button
                key={key.id}
                type="button"
                title={`Seek to ${key.time.toFixed(2)}s`}
                onClick={() => {
                  setSelectedKeyId(key.id);
                  onSeek(item.startTime + key.time);
                }}
                className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 p-0.5 text-[#f8d66d] hover:text-white"
                style={{ left: `${(Math.min(duration, Math.max(0, key.time)) / duration) * 100}%` }}
              >
                <Diamond
                  className="w-3 h-3"
                  fill={key.id === selectedKeyId ? 'currentColor' : 'none'}
                />
              </button>
            ))}
          </div>

          <div className="space-y-1">
            {keys.map((key) => {
              const active = key.id === selectedKeyId;
              return (
                <div
                  key={key.id}
                  className={`flex items-center gap-1.5 rounded-sm border px-1.5 py-1 ${
                    active
                      ? 'border-[#8ab4f8]/60 bg-[#10202c]'
                      : 'border-[#2a2c30] bg-[#101113]'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedKeyId(key.id);
                      onSeek(item.startTime + key.time);
                    }}
                    className="p-0.5 text-[#f8d66d] hover:text-white"
                    title="Select and seek to this keyframe"
                  >
                    <Diamond className="w-3 h-3" fill={active ? 'currentColor' : 'none'} />
                  </button>
                  <input
                    type="number"
                    value={key.time}
                    step={0.01}
                    min={0}
                    max={duration}
                    onChange={(e) => {
                      const nextTime = Math.max(
                        0,
                        Math.min(duration, Number(e.target.value) || 0)
                      );
                      commit(
                        keys.map((entry) =>
                          entry.id === key.id ? { ...entry, time: nextTime } : entry
                        )
                      );
                    }}
                    className="w-16 bg-[#0d0e10] border border-[#2a2c30] rounded-sm px-1.5 py-0.5 text-[11px] text-[#e3e3e3] focus:outline-none focus:border-[#8ab4f8] font-mono"
                  />
                  <span className="text-[10px] font-mono text-[#6f7276]">s</span>
                  <select
                    value={key.easing || 'linear'}
                    onChange={(e) =>
                      commit(
                        keys.map((entry) =>
                          entry.id === key.id
                            ? { ...entry, easing: e.target.value as KeyframeEasing }
                            : entry
                        )
                      )
                    }
                    className="ml-auto bg-[#0d0e10] border border-[#2a2c30] rounded-sm px-1 py-0.5 text-[10px] text-[#c4c7c5] focus:outline-none focus:border-[#8ab4f8]"
                    title="Easing used from this key to the next one"
                  >
                    {EASING_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => {
                      commit(keys.filter((entry) => entry.id !== key.id));
                      if (selectedKeyId === key.id) setSelectedKeyId(null);
                    }}
                    className="p-0.5 text-[#8e918f] hover:text-rose-300"
                    title="Delete keyframe"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              );
            })}
          </div>

          {selected && (
            <div className="grid grid-cols-2 gap-3 border-t border-[#242629] pt-3">
              <NumberField
                label={`X (${unit})`}
                value={resolved.x}
                step={1}
                onChange={(value) => updateSelected({ x: value })}
              />
              <NumberField
                label={`Y (${unit})`}
                value={resolved.y}
                step={1}
                onChange={(value) => updateSelected({ y: value })}
              />
              <NumberField
                label="Scale"
                value={resolved.scale}
                step={0.05}
                min={0.01}
                onChange={(value) => updateSelected({ scale: Math.max(0.01, value) })}
              />
              <NumberField
                label="Rotation (°)"
                value={resolved.rotation}
                step={1}
                onChange={(value) => updateSelected({ rotation: value })}
              />
              <SliderField
                label="Opacity"
                value={resolved.opacity}
                min={0}
                max={1}
                step={0.01}
                onChange={(value) => updateSelected({ opacity: value })}
              />
              <p className="col-span-2 text-[10px] text-[#6f7276] font-mono leading-relaxed">
                Editing a field writes it to the selected key. Untouched fields keep inheriting
                the previous key, so you only animate what you need.
              </p>
            </div>
          )}
        </>
      )}
    </section>
  );
};

const TypeBadge: React.FC<{ type: TimelineItem['type'] }> = ({ type }) => {
  const map: Record<string, { icon: React.ComponentType<{ className?: string }>; label: string }> = {
    voice: { icon: MessageSquare, label: 'Voice / Subtitle' },
    text: { icon: Type, label: 'Text / Telop' },
    image: { icon: ImageIcon, label: 'Image' },
    audio: { icon: Music, label: 'BGM / SE' },
    video: { icon: Film, label: 'Video' },
  };
  const entry = map[type];
  const Icon = entry.icon;
  return (
    <span className="inline-flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-[#8ab4f8] border border-[#2a3b4d] bg-[#10202c] rounded px-2 py-0.5">
      <Icon className="w-3 h-3" />
      {entry.label}
    </span>
  );
};

export const ItemInspector: React.FC<ItemInspectorProps> = ({
  isOpen,
  item,
  characters,
  currentTime,
  onClose,
  onUpdate,
  onDelete,
  onSeek,
  onSynthesize,
  onDuplicate,
}) => {
  const [terminalCmd, setTerminalCmd] = useState('');
  const [terminalOutput, setTerminalOutput] = useState('');

  useEffect(() => {
    if (item?.type === 'voice') {
      setTerminalCmd(item.terminal?.cmd || '');
      setTerminalOutput(item.terminal?.output || '');
    }
  }, [item?.id, item?.type, item?.type === 'voice' ? item.terminal?.cmd : '']);

  if (!isOpen || !item) return null;

  const patch = (updates: Partial<TimelineItem>) => onUpdate(item.id, updates);

  const pickSource = async (kind: 'image' | 'audio') => {
    try {
      const picked = await openDialog({
        title: kind === 'image' ? 'Select image' : 'Select audio',
        multiple: false,
        filters:
          kind === 'image'
            ? [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'] }]
            : [{ name: 'Audio', extensions: ['wav', 'mp3', 'ogg', 'flac', 'm4a', 'aac', 'opus'] }],
      });
      if (picked && typeof picked === 'string') {
        patch({ src: picked } as Partial<TimelineItem>);
      }
    } catch (err) {
      console.warn('File picker failed:', err);
    }
  };

  return (
    <div className="geo-backdrop fixed inset-0 z-50 bg-black/65 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="geo-panel w-full max-w-2xl max-h-[92vh] overflow-hidden bg-[#141517] border border-[#2c2e32] rounded-none shadow-2xl flex flex-col">
        <div className="px-4 py-3 border-b border-[#242629] flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <TypeBadge type={item.type} />
            <span className="text-xs font-mono text-[#6f7276] truncate">{item.id}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded hover:bg-[#24272b] text-[#8e918f] hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <section className="grid grid-cols-2 gap-3">
            <Field label="Name" className="col-span-2">
              <input
                value={item.name}
                onChange={(e) => patch({ name: e.target.value })}
                className={inputClass}
              />
            </Field>
            <NumberField
              label="Start (s)"
              value={item.startTime}
              step={0.01}
              min={0}
              onChange={(value) => patch({ startTime: Math.max(0, value) })}
            />
            <NumberField
              label="Duration (s)"
              value={item.duration}
              step={0.01}
              min={0.05}
              onChange={(value) => patch({ duration: Math.max(0.05, value) })}
            />
            <Field label="Layer (higher renders in front)" className="col-span-2">
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  value={item.layer}
                  onChange={(e) => patch({ layer: Number(e.target.value) })}
                  className={inputClass}
                />
                <button
                  type="button"
                  title="Move one layer forward"
                  onClick={() => patch({ layer: item.layer + 1 })}
                  className="px-2 py-1.5 bg-[#181a1d] border border-[#2a2c30] rounded-sm text-[#c4c7c5] hover:text-white"
                >
                  <ChevronUp className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  title="Move one layer backward"
                  onClick={() => patch({ layer: Math.max(0, item.layer - 1) })}
                  className="px-2 py-1.5 bg-[#181a1d] border border-[#2a2c30] rounded-sm text-[#c4c7c5] hover:text-white"
                >
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>
              </div>
            </Field>
            <div className="col-span-2 flex flex-wrap items-center gap-3 pt-1">
              <button
                type="button"
                onClick={() => onSeek(item.startTime)}
                className="px-2 py-1 text-[11px] font-mono bg-[#181a1d] border border-[#2a2c30] rounded-sm text-[#c4c7c5] hover:text-white flex items-center gap-1"
              >
                <Crosshair className="w-3 h-3" /> Seek to start
              </button>
              <label className="flex items-center gap-1.5 text-[11px] font-mono text-[#c4c7c5] cursor-pointer">
                <input
                  type="checkbox"
                  checked={Boolean(item.hidden)}
                  onChange={(e) => patch({ hidden: e.target.checked })}
                  className="accent-[#3b82f6]"
                />
                Hidden
              </label>
              <label className="flex items-center gap-1.5 text-[11px] font-mono text-[#c4c7c5] cursor-pointer">
                <input
                  type="checkbox"
                  checked={Boolean(item.locked)}
                  onChange={(e) => patch({ locked: e.target.checked })}
                  className="accent-[#3b82f6]"
                />
                Locked
              </label>
              <button
                type="button"
                onClick={() => onDuplicate(item.id)}
                className="ml-auto px-2 py-1 text-[11px] font-mono bg-[#181a1d] border border-[#2a2c30] rounded-sm text-[#c4c7c5] hover:text-white"
              >
                Duplicate
              </button>
              <button
                type="button"
                onClick={() => {
                  onDelete(item.id);
                  onClose();
                }}
                className="px-2 py-1 text-[11px] font-mono bg-[#2a1518] border border-[#4c1d24] rounded-sm text-rose-300 hover:text-rose-200 flex items-center gap-1"
              >
                <Trash2 className="w-3 h-3" /> Delete
              </button>
            </div>
          </section>

          {item.type === 'voice' && (() => {
            const voice = item as VoiceItem;
            return (
              <>
                <section className="border-t border-[#242629] pt-4 grid grid-cols-2 gap-3">
                  <Field label="Character" className="col-span-2">
                    <select
                      value={voice.characterId}
                      onChange={(e) => {
                        const character = characters.find((c) => c.id === e.target.value);
                        patch({
                          characterId: e.target.value,
                          name: character
                            ? `${character.name}: ${voice.text.slice(0, 12)}`
                            : voice.name,
                        } as Partial<TimelineItem>);
                      }}
                      className={inputClass}
                    >
                      {!characters.some((c) => c.id === voice.characterId) && (
                        <option value={voice.characterId}>{voice.characterId || '—'}</option>
                      )}
                      {characters.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label={`Dialogue  (${voice.text.length} chars)`} className="col-span-2">
                    <textarea
                      value={voice.text}
                      onChange={(e) => patch({ text: e.target.value } as Partial<TimelineItem>)}
                      rows={3}
                      className={`${inputClass} resize-y leading-relaxed`}
                    />
                  </Field>
                  <Field label="Subtitle override (optional)" className="col-span-2">
                    <textarea
                      value={voice.subtitleText || ''}
                      onChange={(e) =>
                        patch({ subtitleText: e.target.value || undefined } as Partial<TimelineItem>)
                      }
                      rows={2}
                      className={`${inputClass} resize-y`}
                      placeholder="Leave empty to use the dialogue text"
                    />
                  </Field>
                  <Field label="Expression">
                    <input
                      list="voix-expressions"
                      value={voice.expression || 'default'}
                      onChange={(e) => patch({ expression: e.target.value } as Partial<TimelineItem>)}
                      className={inputClass}
                    />
                    <datalist id="voix-expressions">
                      <option value="default" />
                      <option value="smile" />
                      <option value="shock" />
                      <option value="trouble" />
                      <option value="angry" />
                    </datalist>
                  </Field>
                  <Field label="Animation">
                    <select
                      value={voice.anim || 'bounce'}
                      onChange={(e) => patch({ anim: e.target.value } as Partial<TimelineItem>)}
                      className={inputClass}
                    >
                      {['bounce', 'pop', 'shake', 'nod', 'slide', 'fade', 'none'].map((a) => (
                        <option key={a} value={a}>
                          {a}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <SliderField
                    label="Speed"
                    value={voice.speedScale ?? 1}
                    min={0.5}
                    max={2}
                    step={0.01}
                    onChange={(value) => patch({ speedScale: value } as Partial<TimelineItem>)}
                  />
                  <SliderField
                    label="Pitch"
                    value={voice.pitchScale ?? 0}
                    min={-0.3}
                    max={0.3}
                    step={0.01}
                    onChange={(value) => patch({ pitchScale: value } as Partial<TimelineItem>)}
                  />
                  <SliderField
                    label="Volume"
                    value={voice.volumeScale ?? 1}
                    min={0}
                    max={2}
                    step={0.01}
                    onChange={(value) => patch({ volumeScale: value } as Partial<TimelineItem>)}
                  />
                  <NumberField
                    label="Tachie scale"
                    value={voice.scale ?? 1}
                    step={0.02}
                    min={0.1}
                    max={4}
                    onChange={(value) => patch({ scale: value } as Partial<TimelineItem>)}
                  />
                  <Field label="Sound effect">
                    <input
                      value={voice.se || ''}
                      onChange={(e) => patch({ se: e.target.value || undefined } as Partial<TimelineItem>)}
                      className={inputClass}
                      placeholder="pop / chime / typing"
                    />
                  </Field>
                  <label className="flex items-center gap-1.5 text-[11px] font-mono text-[#c4c7c5] self-end pb-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={Boolean(voice.flipH)}
                      onChange={(e) => patch({ flipH: e.target.checked } as Partial<TimelineItem>)}
                      className="accent-[#3b82f6]"
                    />
                    Flip tachie horizontally
                  </label>
                  <div className="col-span-2 flex items-center justify-between bg-[#101113] border border-[#242629] rounded-sm px-3 py-2">
                    <div className="text-[11px] font-mono text-[#8e918f] flex items-center gap-1.5">
                      <Volume2 className="w-3.5 h-3.5" />
                      {voice.audioBlobUrl
                        ? `Audio ready${voice.audioKey ? ` · cache ${voice.audioKey.slice(0, 8)}` : ''}`
                        : voice.isSynthesizing
                        ? 'Synthesizing...'
                        : 'Audio not generated'}
                    </div>
                    <button
                      type="button"
                      onClick={() => onSynthesize(voice.id)}
                      disabled={voice.isSynthesizing || !voice.text.trim()}
                      className="px-2 py-1 text-[11px] font-mono bg-[#13251c] border border-[#1d4d33] rounded-sm text-emerald-300 hover:text-emerald-200 flex items-center gap-1 disabled:opacity-40"
                    >
                      <Wand2 className="w-3 h-3" /> Re-synthesize
                    </button>
                  </div>
                </section>

                <section className="border-t border-[#242629] pt-4 space-y-2">
                  <div className="text-[10px] font-mono uppercase tracking-wider text-[#8e918f]">
                    Terminal overlay (optional)
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Command">
                      <input
                        value={terminalCmd}
                        onChange={(e) => {
                          setTerminalCmd(e.target.value);
                          patch({
                            terminal: { cmd: e.target.value, output: terminalOutput },
                          } as Partial<TimelineItem>);
                        }}
                        className={`${inputClass} font-mono`}
                        placeholder="neofetch"
                      />
                    </Field>
                    <Field label="Output">
                      <input
                        value={terminalOutput}
                        onChange={(e) => {
                          setTerminalOutput(e.target.value);
                          patch({
                            terminal: { cmd: terminalCmd, output: e.target.value },
                          } as Partial<TimelineItem>);
                        }}
                        className={`${inputClass} font-mono`}
                        placeholder="Arch Linux x86_64"
                      />
                    </Field>
                  </div>
                  <p className="text-[10px] text-[#6f7276] font-mono">
                    Rendered above the tachie for the duration of this line.
                  </p>
                </section>
              </>
            );
          })()}

          {item.type === 'text' && (() => {
            const text = item as TextItem;
            const style = text.style;
            const patchStyle = (updates: Partial<SubtitleStyle>) =>
              patch({ style: { ...style, ...updates } } as Partial<TimelineItem>);
            return (
              <>
                <section className="border-t border-[#242629] pt-4 space-y-3">
                  <Field label="Text">
                    <textarea
                      value={text.text}
                      onChange={(e) => patch({ text: e.target.value } as Partial<TimelineItem>)}
                      rows={3}
                      className={`${inputClass} resize-y leading-relaxed`}
                    />
                  </Field>
                  <div className="grid grid-cols-2 gap-3">
                    <NumberField
                      label="X (%)"
                      value={text.xPercent ?? 50}
                      step={1}
                      min={0}
                      max={100}
                      onChange={(value) => patch({ xPercent: value } as Partial<TimelineItem>)}
                    />
                    <NumberField
                      label="Y (%)"
                      value={text.yPercent ?? 50}
                      step={1}
                      min={0}
                      max={100}
                      onChange={(value) => patch({ yPercent: value } as Partial<TimelineItem>)}
                    />
                    <NumberField
                      label="Width (%)"
                      value={text.widthPercent ?? 80}
                      step={1}
                      min={5}
                      max={100}
                      onChange={(value) => patch({ widthPercent: value } as Partial<TimelineItem>)}
                    />
                    <NumberField
                      label="Rotation (°)"
                      value={text.rotation ?? 0}
                      step={1}
                      onChange={(value) => patch({ rotation: value } as Partial<TimelineItem>)}
                    />
                    <SliderField
                      label="Opacity"
                      value={text.opacity ?? 1}
                      min={0}
                      max={1}
                      step={0.01}
                      onChange={(value) => patch({ opacity: value } as Partial<TimelineItem>)}
                    />
                    <Field label="Alignment">
                      <select
                        value={text.align || 'center'}
                        onChange={(e) => patch({ align: e.target.value } as Partial<TimelineItem>)}
                        className={inputClass}
                      >
                        <option value="left">left</option>
                        <option value="center">center</option>
                        <option value="right">right</option>
                      </select>
                    </Field>
                  </div>
                </section>

                <section className="border-t border-[#242629] pt-4 space-y-3">
                  <span className={labelClass}>Motion</span>
                  <div className="grid grid-cols-2 gap-3">
                    <NumberField
                      label="Fade in (s)"
                      value={text.fadeIn ?? 0}
                      step={0.05}
                      min={0}
                      onChange={(value) => patch({ fadeIn: value } as Partial<TimelineItem>)}
                    />
                    <NumberField
                      label="Fade out (s)"
                      value={text.fadeOut ?? 0}
                      step={0.05}
                      min={0}
                      onChange={(value) => patch({ fadeOut: value } as Partial<TimelineItem>)}
                    />
                    <Field label="In animation">
                      <select
                        value={text.animIn || 'none'}
                        onChange={(e) => {
                          const value = e.target.value as ItemAnimation;
                          patch({
                            animIn: value,
                            fadeIn: value === 'none' ? text.fadeIn : text.fadeIn || 0.35,
                          } as Partial<TimelineItem>);
                        }}
                        className={inputClass}
                      >
                        {ANIMATION_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Out animation">
                      <select
                        value={text.animOut || 'none'}
                        onChange={(e) => {
                          const value = e.target.value as ItemAnimation;
                          patch({
                            animOut: value,
                            fadeOut: value === 'none' ? text.fadeOut : text.fadeOut || 0.35,
                          } as Partial<TimelineItem>);
                        }}
                        className={inputClass}
                      >
                        {ANIMATION_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </Field>
                  </div>
                  <p className="text-[10px] text-[#6f7276] font-mono">
                    Fade duration drives the enter/exit motion. Preview and export share this timing.
                  </p>
                </section>

                <section className="border-t border-[#242629] pt-4 space-y-3">
                  <div className="space-y-1.5">
                    <span className={labelClass}>Subtitle preset</span>
                    <div className="flex flex-wrap gap-1.5">
                      {SUBTITLE_PRESETS.map((preset) => (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() => patch({ style: { ...preset.style } } as Partial<TimelineItem>)}
                          className="px-2 py-1 text-[10px] font-mono bg-[#181a1d] border border-[#2a2c30] rounded-sm text-[#c4c7c5] hover:text-white hover:border-[#8ab4f8]/60"
                          title={`Apply ${preset.name} style`}
                        >
                          {preset.name}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                  <NumberField
                    label="Font size"
                    value={style.fontSize}
                    step={1}
                    min={8}
                    max={300}
                    onChange={(value) => patchStyle({ fontSize: value })}
                  />
                  <Field label="Font family">
                    <input
                      value={style.fontFamily}
                      onChange={(e) => patchStyle({ fontFamily: e.target.value })}
                      className={inputClass}
                    />
                  </Field>
                  <ColorField
                    label="Fill"
                    value={style.textColor}
                    onChange={(value) => patchStyle({ textColor: value })}
                  />
                  <ColorField
                    label="Inner stroke"
                    value={style.strokeColor}
                    onChange={(value) => patchStyle({ strokeColor: value })}
                  />
                  <NumberField
                    label="Inner stroke width"
                    value={style.strokeWidth}
                    step={1}
                    min={0}
                    max={40}
                    onChange={(value) => patchStyle({ strokeWidth: value })}
                  />
                  <ColorField
                    label="Outer stroke"
                    value={style.outerStrokeColor}
                    onChange={(value) => patchStyle({ outerStrokeColor: value })}
                  />
                  <NumberField
                    label="Outer stroke width"
                    value={style.outerStrokeWidth ?? 0}
                    step={1}
                    min={0}
                    max={60}
                    onChange={(value) => patchStyle({ outerStrokeWidth: value })}
                  />
                  <Field label="Background plate">
                    <select
                      value={style.bgStyle}
                      onChange={(e) =>
                        patchStyle({ bgStyle: e.target.value as SubtitleStyle['bgStyle'] })
                      }
                      className={inputClass}
                    >
                      <option value="none">none</option>
                      <option value="pill">pill</option>
                      <option value="banner">banner</option>
                    </select>
                  </Field>
                  <ColorField
                    label="Plate color"
                    value={style.bgColor || '#0c0d11'}
                    onChange={(value) => patchStyle({ bgColor: value })}
                  />
                  <Field label="Ruby display">
                    <select
                      value={style.rubyDisplay || 'above'}
                      onChange={(e) =>
                        patchStyle({
                          rubyDisplay: e.target.value as SubtitleStyle['rubyDisplay'],
                        })
                      }
                      className={inputClass}
                    >
                      <option value="above">above</option>
                      <option value="inline">inline</option>
                      <option value="hidden">hidden</option>
                    </select>
                  </Field>
                  <label className="flex items-center gap-1.5 text-[11px] font-mono text-[#c4c7c5] self-end pb-1.5 cursor-pointer col-span-2">
                    <input
                      type="checkbox"
                      checked={Boolean(style.hasShadow)}
                      onChange={(e) => patchStyle({ hasShadow: e.target.checked })}
                      className="accent-[#3b82f6]"
                    />
                    Drop shadow
                  </label>
                  </div>
                </section>
              </>
            );
          })()}

          {item.type === 'image' && (() => {
            const image = item as ImageItem;
            return (
              <section className="border-t border-[#242629] pt-4 space-y-3">
                <Field label="Source">
                  <div className="flex gap-2">
                    <input
                      value={image.src}
                      onChange={(e) => patch({ src: e.target.value } as Partial<TimelineItem>)}
                      className={`${inputClass} font-mono`}
                    />
                    <button
                      type="button"
                      onClick={() => pickSource('image')}
                      className="px-2 bg-[#181a1d] border border-[#2a2c30] rounded-sm text-[#c4c7c5]"
                    >
                      <FolderOpen className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </Field>
                {image.src && (
                  <div className="bg-[#0b0c0e] border border-[#242629] rounded-sm flex items-center justify-center p-2 h-32 overflow-hidden">
                    <img
                      src={toAssetUrl(image.src)}
                      alt={image.name}
                      className="max-h-full max-w-full object-contain"
                    />
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <NumberField
                    label="X (px)"
                    value={image.x}
                    step={1}
                    onChange={(value) => patch({ x: value } as Partial<TimelineItem>)}
                  />
                  <NumberField
                    label="Y (px)"
                    value={image.y}
                    step={1}
                    onChange={(value) => patch({ y: value } as Partial<TimelineItem>)}
                  />
                  <NumberField
                    label="Width (px)"
                    value={image.width}
                    step={1}
                    min={1}
                    onChange={(value) => patch({ width: value } as Partial<TimelineItem>)}
                  />
                  <NumberField
                    label="Height (px)"
                    value={image.height}
                    step={1}
                    min={1}
                    onChange={(value) => patch({ height: value } as Partial<TimelineItem>)}
                  />
                  <NumberField
                    label="Rotation (°)"
                    value={image.rotation ?? 0}
                    step={1}
                    onChange={(value) => patch({ rotation: value } as Partial<TimelineItem>)}
                  />
                  <SliderField
                    label="Opacity"
                    value={image.opacity ?? 1}
                    min={0}
                    max={1}
                    step={0.01}
                    onChange={(value) => patch({ opacity: value } as Partial<TimelineItem>)}
                  />
                  <label className="flex items-center gap-1.5 text-[11px] font-mono text-[#c4c7c5] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={Boolean(image.flipH)}
                      onChange={(e) => patch({ flipH: e.target.checked } as Partial<TimelineItem>)}
                      className="accent-[#3b82f6]"
                    />
                    Flip horizontally
                  </label>
                </div>
                <div className="border-t border-[#242629] pt-4 space-y-3">
                  <span className={labelClass}>Motion</span>
                  <div className="grid grid-cols-2 gap-3">
                    <NumberField
                      label="Fade in (s)"
                      value={image.fadeIn ?? 0}
                      step={0.05}
                      min={0}
                      onChange={(value) => patch({ fadeIn: value } as Partial<TimelineItem>)}
                    />
                    <NumberField
                      label="Fade out (s)"
                      value={image.fadeOut ?? 0}
                      step={0.05}
                      min={0}
                      onChange={(value) => patch({ fadeOut: value } as Partial<TimelineItem>)}
                    />
                    <Field label="In animation">
                      <select
                        value={image.animIn || 'none'}
                        onChange={(e) => {
                          const value = e.target.value as ItemAnimation;
                          patch({
                            animIn: value,
                            fadeIn: value === 'none' ? image.fadeIn : image.fadeIn || 0.35,
                          } as Partial<TimelineItem>);
                        }}
                        className={inputClass}
                      >
                        {ANIMATION_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Out animation">
                      <select
                        value={image.animOut || 'none'}
                        onChange={(e) => {
                          const value = e.target.value as ItemAnimation;
                          patch({
                            animOut: value,
                            fadeOut: value === 'none' ? image.fadeOut : image.fadeOut || 0.35,
                          } as Partial<TimelineItem>);
                        }}
                        className={inputClass}
                      >
                        {ANIMATION_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </Field>
                  </div>
                </div>
              </section>
            );
          })()}

          {(item.type === 'text' || item.type === 'image') && (
            <KeyframeSection
              item={item as TextItem | ImageItem}
              currentTime={currentTime}
              onUpdate={onUpdate}
              onSeek={onSeek}
            />
          )}

          {item.type === 'audio' && (() => {
            const audio = item as AudioItem;
            return (
              <section className="border-t border-[#242629] pt-4 space-y-3">
                <Field label="Source">
                  <div className="flex gap-2">
                    <input
                      value={audio.src}
                      onChange={(e) => patch({ src: e.target.value } as Partial<TimelineItem>)}
                      className={`${inputClass} font-mono`}
                    />
                    <button
                      type="button"
                      onClick={() => pickSource('audio')}
                      className="px-2 bg-[#181a1d] border border-[#2a2c30] rounded-sm text-[#c4c7c5]"
                    >
                      <FolderOpen className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <SliderField
                    label="Volume"
                    value={audio.volume}
                    min={0}
                    max={2}
                    step={0.01}
                    onChange={(value) => patch({ volume: value } as Partial<TimelineItem>)}
                  />
                  <NumberField
                    label="Speed (×)"
                    value={audio.speed ?? 1}
                    step={0.05}
                    min={0.25}
                    max={4}
                    onChange={(value) =>
                      patch({
                        speed: Math.max(0.25, Math.min(4, value)),
                      } as Partial<TimelineItem>)
                    }
                  />
                  <NumberField
                    label="Source offset (s)"
                    value={audio.offset ?? 0}
                    step={0.01}
                    min={0}
                    onChange={(value) => patch({ offset: value } as Partial<TimelineItem>)}
                  />
                  <NumberField
                    label="Fade in (s)"
                    value={audio.fadeIn ?? 0}
                    step={0.05}
                    min={0}
                    onChange={(value) => patch({ fadeIn: value } as Partial<TimelineItem>)}
                  />
                  <NumberField
                    label="Fade out (s)"
                    value={audio.fadeOut ?? 0}
                    step={0.05}
                    min={0}
                    onChange={(value) => patch({ fadeOut: value } as Partial<TimelineItem>)}
                  />
                  <label className="flex items-center gap-1.5 text-[11px] font-mono text-[#c4c7c5] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={Boolean(audio.loop)}
                      onChange={(e) => patch({ loop: e.target.checked } as Partial<TimelineItem>)}
                      className="accent-[#3b82f6]"
                    />
                    Loop
                  </label>
                  <label className="flex items-center gap-1.5 text-[11px] font-mono text-[#c4c7c5] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={Boolean(audio.isBgm)}
                      onChange={(e) => patch({ isBgm: e.target.checked } as Partial<TimelineItem>)}
                      className="accent-[#3b82f6]"
                    />
                    BGM
                  </label>
                </div>
              </section>
            );
          })()}

          {item.type === 'video' && (
            <section className="border-t border-[#242629] pt-4 grid grid-cols-2 gap-3">
              <Field label="Source" className="col-span-2">
                <input
                  value={item.src}
                  onChange={(e) => patch({ src: e.target.value } as Partial<TimelineItem>)}
                  className={`${inputClass} font-mono`}
                />
              </Field>
              <SliderField
                label="Volume"
                value={item.volume}
                min={0}
                max={2}
                step={0.01}
                onChange={(value) => patch({ volume: value } as Partial<TimelineItem>)}
              />
              <NumberField
                label="Source offset (s)"
                value={item.offsetTime}
                step={0.01}
                min={0}
                onChange={(value) => patch({ offsetTime: value } as Partial<TimelineItem>)}
              />
            </section>
          )}
        </div>

        <div className="px-4 py-3 border-t border-[#242629] flex items-center justify-between flex-shrink-0">
          <span className="text-[10px] font-mono text-[#6f7276]">
            {item.type} · layer {item.layer} · {item.duration.toFixed(2)}s
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-xs text-[#c4c7c5] hover:text-white border border-[#2a2c30] rounded-sm hover:bg-[#1e2023]"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};

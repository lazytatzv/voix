import React, { useEffect, useMemo, useState } from 'react';
import {
  X,
  Settings2,
  Monitor,
  Film,
  Volume2,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  VolumeX,
  Trash2,
  Check,
  FileText,
  Copy,
  Download,
  Code2,
} from 'lucide-react';
import { TimelineItem, TrackKind, TrackState, VoixProject, DuckingSettings } from '../types';
import { DEFAULT_DUCKING } from '../utils/audioDucking';
import { projectToYaml } from '../utils/projectYaml';
import {
  BACKGROUND_MOTION_PRESETS,
  DEFAULT_BACKGROUND_MOTION_AMOUNT,
  normalizeBackgroundMotion,
  normalizeBackgroundMotionAmount,
} from '../utils/backgroundMotion';

interface ProjectSettingsModalProps {
  isOpen: boolean;
  project: VoixProject;
  computedDuration: number;
  onClose: () => void;
  onApply: (next: {
    name: string;
    timeline: VoixProject['timeline'];
    tracks: TrackState[];
    items: TimelineItem[];
    notes?: string;
  }) => void;
}

const RESOLUTIONS = [
  { label: '1920 × 1080 (FHD)', width: 1920, height: 1080 },
  { label: '2560 × 1440 (QHD)', width: 2560, height: 1440 },
  { label: '1280 × 720 (HD)', width: 1280, height: 720 },
  { label: '1080 × 1920 (Shorts)', width: 1080, height: 1920 },
  { label: '3840 × 2160 (4K)', width: 3840, height: 2160 },
];

const inputClass =
  'w-full bg-[#0d0e10] border border-[#2a2c30] rounded-sm px-2.5 py-1.5 text-xs text-[#e3e3e3] focus:outline-none focus:border-[#8ab4f8]';

const TRACK_LABELS: Record<TrackKind, string> = {
  video: 'Video',
  character: 'Characters',
  voice: 'Voice / Captions',
  text: 'Text / Telop',
  image: 'Images',
  shape: 'Shapes',
  audio: 'BGM / SE',
};

function patchTrack(tracks: TrackState[], id: TrackKind, updates: Partial<TrackState>): TrackState[] {
  return tracks.map((track) => (track.id === id ? { ...track, ...updates } : track));
}

function scaleItems(items: TimelineItem[], scaleX: number, scaleY: number): TimelineItem[] {
  const fontScale = Math.min(scaleX, scaleY);
  return items.map((item) => {
    if (item.type === 'image') {
      return {
        ...item,
        x: Math.round(item.x * scaleX),
        y: Math.round(item.y * scaleY),
        width: Math.max(4, Math.round(item.width * scaleX)),
        height: Math.max(4, Math.round(item.height * scaleY)),
      };
    }
    if (item.type === 'shape') {
      return {
        ...item,
        x: Math.round(item.x * scaleX),
        y: Math.round(item.y * scaleY),
        width: Math.max(4, Math.round(item.width * scaleX)),
        height: Math.max(4, Math.round(item.height * scaleY)),
        strokeWidth:
          item.strokeWidth !== undefined
            ? Math.max(0, Math.round(item.strokeWidth * fontScale))
            : undefined,
        cornerRadius:
          item.cornerRadius !== undefined
            ? Math.max(0, Math.round(item.cornerRadius * fontScale))
            : undefined,
      };
    }
    if (item.type === 'text') {
      const style = item.style;
      return {
        ...item,
        style: {
          ...style,
          fontSize: Math.max(8, Math.round(style.fontSize * fontScale)),
          strokeWidth: Math.max(0, Math.round(style.strokeWidth * fontScale)),
          outerStrokeWidth:
            style.outerStrokeWidth !== undefined
              ? Math.max(0, Math.round(style.outerStrokeWidth * fontScale))
              : undefined,
          shadowBlur: style.shadowBlur !== undefined ? Math.round(style.shadowBlur * fontScale) : undefined,
          shadowOffsetY:
            style.shadowOffsetY !== undefined ? Math.round(style.shadowOffsetY * fontScale) : undefined,
        },
      };
    }
    return item;
  });
}

export const ProjectSettingsModal: React.FC<ProjectSettingsModalProps> = ({
  isOpen,
  project,
  computedDuration,
  onClose,
  onApply,
}) => {
  const [name, setName] = useState(project.name);
  const [timeline, setTimeline] = useState(project.timeline);
  const [tracks, setTracks] = useState<TrackState[]>(project.tracks || []);
  const [scaleContent, setScaleContent] = useState(true);
  const [notes, setNotes] = useState(project.notes || '');
  const [activeTab, setActiveTab] = useState<'settings' | 'dump'>('settings');
  const [copiedDump, setCopiedDump] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setName(project.name);
    setTimeline(project.timeline);
    setTracks(project.tracks || []);
    setNotes(project.notes || '');
    setScaleContent(true);
    setActiveTab('settings');
    setCopiedDump(false);
  }, [isOpen, project]);

  const projectDump = useMemo(() => {
    return {
      format: project.formatVersion || 'voix-project 1.1.0',
      exportedAt: new Date().toISOString(),
      name: name,
      timeline: {
        width: timeline.width,
        height: timeline.height,
        fps: timeline.fps,
        overlayFps: timeline.overlayFps,
        durationSeconds: computedDuration,
        backgroundColor: timeline.backgroundColor,
        videoPath: timeline.videoPath || null,
        videoVolume: timeline.videoVolume ?? 1,
        videoSpeed: timeline.videoSpeed ?? 1,
        videoFit: timeline.videoFit || 'contain',
        ducking: timeline.ducking ?? DEFAULT_DUCKING,
      },
      tracks: tracks.map((t) => ({
        id: t.id,
        name: t.name,
        visible: t.visible,
        muted: t.muted,
        locked: t.locked,
      })),
      characters: project.characters.map((c) => ({
        id: c.id,
        name: c.name,
        ttsProviderId: c.ttsProviderId,
        speakerId: c.speakerId,
        styleId: c.styleId,
        position: c.position,
        scale: c.scale ?? 1,
        voiceVolume: c.voiceVolume ?? 1,
        subtitleStyle: c.subtitleStyle,
      })),
      itemStats: {
        total: project.items.length,
        voices: project.items.filter((i) => i.type === 'voice').length,
        videos: project.items.filter((i) => i.type === 'video').length,
        audios: project.items.filter((i) => i.type === 'audio').length,
        texts: project.items.filter((i) => i.type === 'text').length,
        images: project.items.filter((i) => i.type === 'image').length,
        shapes: project.items.filter((i) => i.type === 'shape').length,
      },
      items: project.items.map((it) => {
        const { audioBlob: _b, audioBlobUrl: _u, ...clean } = it as any;
        return clean;
      }),
      notes: notes || undefined,
    };
  }, [name, timeline, computedDuration, tracks, project.characters, project.items, notes, project.formatVersion]);

  const handleCopyDump = async (format: 'json' | 'yaml') => {
    try {
      const text =
        format === 'json'
          ? JSON.stringify(projectDump, null, 2)
          : projectToYaml(project);
      await navigator.clipboard.writeText(text);
      setCopiedDump(true);
      setTimeout(() => setCopiedDump(false), 2000);
    } catch (err) {
      console.warn('Copy dump failed:', err);
    }
  };

  const handleDownloadDump = () => {
    try {
      const json = JSON.stringify(projectDump, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${name.replace(/[^\w-]/g, '_')}_settings_dump.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.warn('Download dump failed:', err);
    }
  };

  const resolutionIndex = useMemo(
    () => RESOLUTIONS.findIndex((r) => r.width === timeline.width && r.height === timeline.height),
    [timeline.width, timeline.height]
  );

  const ducking = timeline.ducking ?? DEFAULT_DUCKING;
  const patchDucking = (updates: Partial<DuckingSettings>) => {
    setTimeline((prev) => ({
      ...prev,
      ducking: { ...(prev.ducking ?? DEFAULT_DUCKING), ...updates },
    }));
  };

  if (!isOpen) return null;

  const setResolution = (index: number) => {
    const resolution = RESOLUTIONS[index];
    if (!resolution) return;
    setTimeline((prev) => ({ ...prev, width: resolution.width, height: resolution.height }));
  };

  const handleApply = () => {
    const width = Math.max(320, Math.round(timeline.width / 2) * 2);
    const height = Math.max(240, Math.round(timeline.height / 2) * 2);
    const nextTimeline = {
      ...timeline,
      width,
      height,
      fps: timeline.fps === 60 ? 60 : 30,
      overlayFps: Math.max(1, Math.min(60, Number(timeline.overlayFps) || 15)),
      videoVolume:
        timeline.videoVolume !== undefined ? Math.max(0, Math.min(2, timeline.videoVolume)) : 1,
      videoSpeed: Math.max(0.25, Math.min(4, Number(timeline.videoSpeed) || 1)),
      videoOffset: Math.max(0, Number(timeline.videoOffset) || 0),
      videoFit:
        timeline.videoFit === 'cover' || timeline.videoFit === 'stretch'
          ? timeline.videoFit
          : 'contain',
      videoMotion: normalizeBackgroundMotion(timeline.videoMotion),
      videoMotionAmount: normalizeBackgroundMotionAmount(timeline.videoMotionAmount),
      ducking: {
        enabled: Boolean(timeline.ducking?.enabled ?? DEFAULT_DUCKING.enabled),
        level: Math.max(0, Math.min(1, Number(timeline.ducking?.level ?? DEFAULT_DUCKING.level))),
        attack: Math.max(0, Math.min(5, Number(timeline.ducking?.attack ?? DEFAULT_DUCKING.attack))),
        release: Math.max(0, Math.min(5, Number(timeline.ducking?.release ?? DEFAULT_DUCKING.release))),
      },
    } as VoixProject['timeline'];
    const scaleX = width / project.timeline.width;
    const scaleY = height / project.timeline.height;
    const items =
      scaleContent && (scaleX !== 1 || scaleY !== 1)
        ? scaleItems(project.items, scaleX, scaleY)
        : project.items;
    onApply({
      name: name.trim() || 'Untitled Project',
      timeline: nextTimeline,
      tracks,
      items,
      notes: notes.trim() || undefined,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
      <div className="w-full max-w-3xl max-h-[92vh] overflow-hidden bg-[#141517] border border-[#2c2e32] rounded-none flex flex-col">
        <div className="px-4 py-2.5 border-b border-[#242629] flex items-center justify-between flex-shrink-0 bg-[#16171a]">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <Settings2 className="w-4 h-4 text-[#8ab4f8]" />
              <h2 className="text-xs font-semibold text-[#e3e3e3]">Project Settings</h2>
            </div>
            <div className="flex items-center gap-1 bg-[#101113] p-0.5 rounded border border-[#26282c]">
              <button
                type="button"
                onClick={() => setActiveTab('settings')}
                className={`px-2.5 py-1 text-[11px] font-mono rounded transition cursor-pointer ${
                  activeTab === 'settings'
                    ? 'bg-[#212429] text-[#8ab4f8] font-semibold shadow-xs'
                    : 'text-[#8e918f] hover:text-[#e3e3e3]'
                }`}
              >
                Configuration
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('dump')}
                className={`px-2.5 py-1 text-[11px] font-mono rounded transition flex items-center gap-1.5 cursor-pointer ${
                  activeTab === 'dump'
                    ? 'bg-[#212429] text-[#8ab4f8] font-semibold shadow-xs'
                    : 'text-[#8e918f] hover:text-[#e3e3e3]'
                }`}
              >
                <Code2 className="w-3 h-3 text-[#34d399]" />
                Dump & Diagnostics
              </button>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded hover:bg-[#24272b] text-[#8e918f] hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {activeTab === 'dump' ? (
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* Quick Diagnostic Summary Cards */}
            <div className="grid grid-cols-4 gap-2">
              <div className="bg-[#101113] border border-[#242629] rounded p-2.5 space-y-0.5">
                <span className="text-[10px] font-mono text-[#8e918f]">Canvas & Rate</span>
                <p className="text-xs font-mono font-semibold text-white">
                  {timeline.width}×{timeline.height} @ {timeline.fps}fps
                </p>
              </div>
              <div className="bg-[#101113] border border-[#242629] rounded p-2.5 space-y-0.5">
                <span className="text-[10px] font-mono text-[#8e918f]">Project Duration</span>
                <p className="text-xs font-mono font-semibold text-[#8ab4f8]">
                  {computedDuration.toFixed(2)}s
                </p>
              </div>
              <div className="bg-[#101113] border border-[#242629] rounded p-2.5 space-y-0.5">
                <span className="text-[10px] font-mono text-[#8e918f]">Timeline Items</span>
                <p className="text-xs font-mono font-semibold text-emerald-400">
                  {project.items.length} items ({projectDump.itemStats.voices} lines)
                </p>
              </div>
              <div className="bg-[#101113] border border-[#242629] rounded p-2.5 space-y-0.5">
                <span className="text-[10px] font-mono text-[#8e918f]">Characters</span>
                <p className="text-xs font-mono font-semibold text-purple-400">
                  {project.characters.length} registered
                </p>
              </div>
            </div>

            {/* Actions Bar */}
            <div className="flex items-center justify-between gap-2 p-2.5 bg-[#121417] border border-[#22252a] rounded">
              <span className="text-xs text-[#c4c7c5] font-mono">
                Full YMM4-Class Project Configuration Dump (JSON)
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleCopyDump('json')}
                  className="px-2.5 py-1 bg-[#1a2330] hover:bg-[#223042] border border-[#2d4057] text-[#8ab4f8] rounded text-xs font-mono inline-flex items-center gap-1 transition cursor-pointer"
                >
                  <Copy className="w-3 h-3" />
                  {copiedDump ? 'Copied!' : 'Copy JSON'}
                </button>
                <button
                  type="button"
                  onClick={() => handleCopyDump('yaml')}
                  className="px-2.5 py-1 bg-[#1a2330] hover:bg-[#223042] border border-[#2d4057] text-[#8ab4f8] rounded text-xs font-mono inline-flex items-center gap-1 transition cursor-pointer"
                >
                  <Copy className="w-3 h-3" />
                  Copy YAML
                </button>
                <button
                  type="button"
                  onClick={handleDownloadDump}
                  className="px-2.5 py-1 bg-[#16291e] hover:bg-[#1f3b2a] border border-[#264b34] text-emerald-300 rounded text-xs font-mono inline-flex items-center gap-1 transition cursor-pointer"
                >
                  <Download className="w-3 h-3" />
                  Download .json
                </button>
              </div>
            </div>

            {/* Monospace JSON Dump View */}
            <pre className="bg-[#0b0c0e] border border-[#202226] rounded p-3 text-[11px] font-mono text-[#a8b1bd] max-h-96 overflow-y-auto leading-relaxed select-text">
              {JSON.stringify(projectDump, null, 2)}
            </pre>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-4 space-y-5">
          <section className="grid grid-cols-2 gap-3">
            <label className="space-y-1 col-span-2">
              <span className="text-[10px] font-mono uppercase tracking-wider text-[#8e918f]">Project name</span>
              <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
            </label>

            <div className="space-y-1">
              <span className="text-[10px] font-mono uppercase tracking-wider text-[#8e918f]">Resolution</span>
              <select
                value={resolutionIndex >= 0 ? resolutionIndex : -1}
                onChange={(e) => setResolution(Number(e.target.value))}
                className={inputClass}
              >
                {resolutionIndex < 0 && (
                  <option value={-1}>
                    Custom {timeline.width} × {timeline.height}
                  </option>
                )}
                {RESOLUTIONS.map((r, i) => (
                  <option key={r.label} value={i}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <label className="space-y-1">
                <span className="text-[10px] font-mono uppercase tracking-wider text-[#8e918f]">Width</span>
                <input
                  type="number"
                  min={320}
                  max={7680}
                  step={2}
                  value={timeline.width}
                  onChange={(e) => setTimeline((prev) => ({ ...prev, width: Number(e.target.value) }))}
                  className={inputClass}
                />
              </label>
              <label className="space-y-1">
                <span className="text-[10px] font-mono uppercase tracking-wider text-[#8e918f]">Height</span>
                <input
                  type="number"
                  min={240}
                  max={4320}
                  step={2}
                  value={timeline.height}
                  onChange={(e) => setTimeline((prev) => ({ ...prev, height: Number(e.target.value) }))}
                  className={inputClass}
                />
              </label>
            </div>
          </section>

          <section className="border-t border-[#242629] pt-4 grid grid-cols-3 gap-3">
            <label className="space-y-1">
              <span className="text-[10px] font-mono uppercase tracking-wider text-[#8e918f]">
                <Film className="w-3 h-3 inline mr-1" />
                Timeline FPS
              </span>
              <select
                value={timeline.fps}
                onChange={(e) =>
                  setTimeline((prev) => ({ ...prev, fps: Number(e.target.value) === 60 ? 60 : 30 }))
                }
                className={inputClass}
              >
                <option value={30}>30 fps</option>
                <option value={60}>60 fps</option>
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-[10px] font-mono uppercase tracking-wider text-[#8e918f]">
                Overlay FPS (export)
              </span>
              <input
                type="number"
                min={5}
                max={60}
                value={timeline.overlayFps ?? 15}
                onChange={(e) =>
                  setTimeline((prev) => ({ ...prev, overlayFps: Number(e.target.value) }))
                }
                className={inputClass}
              />
            </label>
            <div className="space-y-1">
              <span className="text-[10px] font-mono uppercase tracking-wider text-[#8e918f]">Duration</span>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono text-[#c4c7c5] flex-1">{computedDuration.toFixed(2)}s</span>
                <button
                  type="button"
                  onClick={() =>
                    setTimeline((prev) => ({
                      ...prev,
                      duration: Math.max(prev.duration || 0, computedDuration),
                    }))
                  }
                  className="px-2 py-1 text-[10px] font-mono bg-[#181a1d] border border-[#2a2c30] rounded-sm text-[#8ab4f8]"
                  title="Store the current computed duration in the project"
                >
                  Fit
                </button>
              </div>
            </div>
          </section>

          <section className="border-t border-[#242629] pt-4 grid grid-cols-2 gap-3">
            <label className="space-y-1">
              <span className="text-[10px] font-mono uppercase tracking-wider text-[#8e918f]">
                <Monitor className="w-3 h-3 inline mr-1" />
                Background color
              </span>
              <div className="flex items-center gap-1.5">
                <input
                  type="color"
                  value={/^#[0-9a-fA-F]{6}$/.test(timeline.backgroundColor || '') ? timeline.backgroundColor : '#0f0f11'}
                  onChange={(e) => setTimeline((prev) => ({ ...prev, backgroundColor: e.target.value }))}
                  className="w-8 h-8 bg-transparent border border-[#2a2c30] rounded-sm cursor-pointer p-0.5"
                />
                <input
                  value={timeline.backgroundColor || '#0f0f11'}
                  onChange={(e) => setTimeline((prev) => ({ ...prev, backgroundColor: e.target.value }))}
                  className={inputClass}
                />
              </div>
            </label>

            <label className="space-y-1">
              <span className="text-[10px] font-mono uppercase tracking-wider text-[#8e918f]">
                <Volume2 className="w-3 h-3 inline mr-1" />
                Background video volume ({(timeline.videoVolume ?? 1).toFixed(2)})
              </span>
              <input
                type="range"
                min={0}
                max={2}
                step={0.01}
                value={timeline.videoVolume ?? 1}
                onChange={(e) =>
                  setTimeline((prev) => ({ ...prev, videoVolume: Number(e.target.value) }))
                }
                className="w-full accent-[#3b82f6]"
              />
            </label>

            <label className="space-y-1">
              <span className="text-[10px] font-mono uppercase tracking-wider text-[#8e918f]">
                Video speed ({(timeline.videoSpeed ?? 1).toFixed(2)}×)
              </span>
              <input
                type="range"
                min={0.25}
                max={4}
                step={0.05}
                value={timeline.videoSpeed ?? 1}
                onChange={(e) =>
                  setTimeline((prev) => ({ ...prev, videoSpeed: Number(e.target.value) }))
                }
                className="w-full accent-[#3b82f6]"
              />
            </label>

            <label className="space-y-1">
              <span className="text-[10px] font-mono uppercase tracking-wider text-[#8e918f]">
                Video start offset (s)
              </span>
              <input
                type="number"
                min={0}
                step={0.1}
                value={timeline.videoOffset ?? 0}
                onChange={(e) =>
                  setTimeline((prev) => ({
                    ...prev,
                    videoOffset: Math.max(0, Number(e.target.value) || 0),
                  }))
                }
                className={inputClass}
              />
            </label>

            <label className="space-y-1">
              <span className="text-[10px] font-mono uppercase tracking-wider text-[#8e918f]">
                Video fit
              </span>
              <select
                value={timeline.videoFit ?? 'contain'}
                onChange={(e) =>
                  setTimeline((prev) => ({
                    ...prev,
                    videoFit: e.target.value as 'contain' | 'cover' | 'stretch',
                  }))
                }
                className={inputClass}
              >
                <option value="contain">Contain (letterbox)</option>
                <option value="cover">Cover (crop edges)</option>
                <option value="stretch">Stretch to frame</option>
              </select>
            </label>

            <label className="space-y-1">
              <span className="text-[10px] font-mono uppercase tracking-wider text-[#8e918f]">
                Video motion
              </span>
              <select
                value={timeline.videoMotion ?? 'none'}
                onChange={(e) =>
                  setTimeline((prev) => ({
                    ...prev,
                    videoMotion: e.target.value as VoixProject['timeline']['videoMotion'],
                  }))
                }
                className={inputClass}
              >
                {BACKGROUND_MOTION_PRESETS.map((preset) => (
                  <option key={preset.id} value={preset.id} title={preset.description}>
                    {preset.name}
                  </option>
                ))}
              </select>
            </label>

            <label
              className={`space-y-1 ${
                (timeline.videoMotion ?? 'none') === 'none' ? 'opacity-45' : ''
              }`}
            >
              <span className="text-[10px] font-mono uppercase tracking-wider text-[#8e918f]">
                Motion strength (
                {Math.round(
                  (timeline.videoMotionAmount ?? DEFAULT_BACKGROUND_MOTION_AMOUNT) * 100
                )}
                %)
              </span>
              <input
                type="range"
                min={0.02}
                max={0.5}
                step={0.01}
                value={timeline.videoMotionAmount ?? DEFAULT_BACKGROUND_MOTION_AMOUNT}
                disabled={(timeline.videoMotion ?? 'none') === 'none'}
                onChange={(e) =>
                  setTimeline((prev) => ({
                    ...prev,
                    videoMotionAmount: Number(e.target.value),
                  }))
                }
                className="w-full accent-[#3b82f6]"
              />
            </label>
            <p className="col-span-2 text-[10px] font-mono text-[#6f7276] -mt-1">
              Camera moves crop the video to fill the frame. Preview and export use the same
              timeline pacing.
            </p>

            <div className="col-span-2 flex items-center justify-between bg-[#101113] border border-[#242629] rounded-sm px-3 py-2">
              <div className="min-w-0">
                <div className="text-[10px] font-mono uppercase tracking-wider text-[#8e918f]">
                  Background video
                </div>
                <div className="text-[11px] font-mono text-[#c4c7c5] truncate">
                  {timeline.videoPath || 'None (solid color background)'}
                </div>
              </div>
              {timeline.videoPath && (
                <button
                  type="button"
                  onClick={() => setTimeline((prev) => ({ ...prev, videoPath: undefined }))}
                  className="px-2 py-1 text-[10px] font-mono bg-[#2a1518] border border-[#4c1d24] rounded-sm text-rose-300 hover:text-rose-200 flex items-center gap-1"
                >
                  <Trash2 className="w-3 h-3" /> Clear
                </button>
              )}
            </div>
          </section>

          <section className="border-t border-[#242629] pt-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[10px] font-mono uppercase tracking-wider text-[#8e918f] flex items-center gap-1">
                  <Volume2 className="w-3 h-3" /> Audio ducking
                </div>
                <p className="text-[10px] text-[#6f7276] font-mono mt-0.5">
                  Lower BGM automatically while a voice line is playing.
                </p>
              </div>
              <label className="flex items-center gap-2 text-[11px] font-mono text-[#c4c7c5] cursor-pointer flex-shrink-0">
                <input
                  type="checkbox"
                  checked={ducking.enabled}
                  onChange={(e) => patchDucking({ enabled: e.target.checked })}
                  className="accent-[#3b82f6]"
                />
                Enabled
              </label>
            </div>
            <div className={`grid grid-cols-3 gap-3 ${ducking.enabled ? '' : 'opacity-45'}`}>
              <label className="space-y-1">
                <span className="text-[10px] font-mono text-[#8e918f]">
                  BGM level ({Math.round(ducking.level * 100)}%)
                </span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={ducking.level}
                  disabled={!ducking.enabled}
                  onChange={(e) => patchDucking({ level: Number(e.target.value) })}
                  className="w-full accent-[#3b82f6]"
                />
              </label>
              <label className="space-y-1">
                <span className="text-[10px] font-mono text-[#8e918f]">Attack (s)</span>
                <input
                  type="number"
                  min={0}
                  max={5}
                  step={0.05}
                  value={ducking.attack}
                  disabled={!ducking.enabled}
                  onChange={(e) => patchDucking({ attack: Number(e.target.value) })}
                  className={inputClass}
                />
              </label>
              <label className="space-y-1">
                <span className="text-[10px] font-mono text-[#8e918f]">Release (s)</span>
                <input
                  type="number"
                  min={0}
                  max={5}
                  step={0.05}
                  value={ducking.release}
                  disabled={!ducking.enabled}
                  onChange={(e) => patchDucking({ release: Number(e.target.value) })}
                  className={inputClass}
                />
              </label>
            </div>
          </section>

          <section className="border-t border-[#242629] pt-4 space-y-2">
            <div className="text-[10px] font-mono uppercase tracking-wider text-[#8e918f]">Tracks</div>
            <div className="grid grid-cols-2 gap-1.5">
              {tracks.map((track) => (
                <div
                  key={track.id}
                  className="flex items-center gap-1.5 bg-[#101113] border border-[#242629] rounded-sm px-2 py-1.5"
                >
                  <span className="text-[11px] font-mono text-[#c4c7c5] flex-1 truncate">
                    {TRACK_LABELS[track.id] || track.name}
                  </span>
                  <button
                    type="button"
                    onClick={() => setTracks((prev) => patchTrack(prev, track.id, { visible: !track.visible }))}
                    className="p-1 rounded hover:bg-[#24272b] text-[#8e918f]"
                    title={track.visible ? 'Hide track' : 'Show track'}
                  >
                    {track.visible ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3 text-rose-400" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => setTracks((prev) => patchTrack(prev, track.id, { muted: !track.muted }))}
                    className="p-1 rounded hover:bg-[#24272b] text-[#8e918f]"
                    title={track.muted ? 'Unmute track' : 'Mute track'}
                  >
                    {track.muted ? <VolumeX className="w-3 h-3 text-rose-400" /> : <Volume2 className="w-3 h-3" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => setTracks((prev) => patchTrack(prev, track.id, { locked: !track.locked }))}
                    className="p-1 rounded hover:bg-[#24272b] text-[#8e918f]"
                    title={track.locked ? 'Unlock track' : 'Lock track'}
                  >
                    {track.locked ? <Lock className="w-3 h-3 text-amber-400" /> : <Unlock className="w-3 h-3" />}
                  </button>
                </div>
              ))}
            </div>
          </section>

          <section className="border-t border-[#242629] pt-4 space-y-2">
            <label className="flex items-center gap-2 text-[11px] font-mono text-[#c4c7c5] cursor-pointer">
              <input
                type="checkbox"
                checked={scaleContent}
                onChange={(e) => setScaleContent(e.target.checked)}
                className="accent-[#3b82f6]"
              />
              Scale image positions/sizes and text font sizes when resolution changes
            </label>
            <label className="space-y-1 block">
              <span className="text-[10px] font-mono uppercase tracking-wider text-[#8e918f]">
                <FileText className="w-3 h-3 inline mr-1" />
                Notes (saved in project YAML)
              </span>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className={`${inputClass} resize-y`}
                placeholder="Project memo, script links, asset credits..."
              />
            </label>
          </section>
        </div>
      )}

        <div className="px-4 py-3 border-t border-[#242629] flex items-center justify-end gap-2 flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-xs text-[#c4c7c5] hover:text-white border border-[#2a2c30] rounded-sm hover:bg-[#1e2023]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleApply}
            className="px-5 py-1.5 bg-[#004a77] hover:bg-[#005a92] text-[#c2e7ff] border border-[#005a92] rounded-none text-xs font-mono font-semibold flex items-center gap-1.5"
          >
            <Check className="w-3.5 h-3.5" /> Apply
          </button>
        </div>
      </div>
    </div>
  );
};

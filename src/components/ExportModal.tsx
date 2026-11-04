import React, { useEffect, useMemo, useState } from 'react';
import {
  X,
  Download,
  Film,
  CheckCircle2,
  Loader2,
  AlertCircle,
  FolderOpen,
  Terminal,
  Gauge,
} from 'lucide-react';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { save as saveDialog } from '@tauri-apps/plugin-dialog';
import { ExportSettings, VoixProject } from '../types';
import { executeExportVideo, ExportProgressEvent } from '../services/exportService';
import { AppSettings, DEFAULT_APP_SETTINGS, loadSettingsFromConfig } from '../services/configService';
import { isTauriRuntime } from '../services/audioCache';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: VoixProject;
  videoPath: string | null;
  videoDuration: number;
}

const RESOLUTIONS = [
  { label: '1920 × 1080 (FHD)', width: 1920, height: 1080 },
  { label: '2560 × 1440 (QHD)', width: 2560, height: 1440 },
  { label: '1280 × 720 (HD)', width: 1280, height: 720 },
  { label: '1080 × 1920 (Shorts)', width: 1080, height: 1920 },
  { label: '3840 × 2160 (4K)', width: 3840, height: 2160 },
];

function settingsFromApp(app: AppSettings, project: VoixProject): ExportSettings {
  return {
    outputPath: app.exportOutputPath || '~/voix_output.mp4',
    fps: (app.exportFps === 60 ? 60 : project.timeline.fps || 30) as 30 | 60,
    width: app.exportWidth || project.timeline.width || 1920,
    height: app.exportHeight || project.timeline.height || 1080,
    overlayFps: app.overlayFps || project.timeline.overlayFps || 15,
    crf: app.exportCrf ?? 20,
    preset: app.exportPreset || 'medium',
    hardwareAcceleration: app.hardwareAcceleration || 'auto',
    format: 'mp4',
  };
}

export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  onClose,
  project,
  videoPath,
  videoDuration,
}) => {
  const [outputPath, setOutputPath] = useState('');
  const [settings, setSettings] = useState<ExportSettings>(() =>
    settingsFromApp(DEFAULT_APP_SETTINGS, project)
  );
  const [isExporting, setIsExporting] = useState(false);
  const [percent, setPercent] = useState(0);
  const [phase, setPhase] = useState('');
  const [status, setStatus] = useState('');
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [includeBackgroundAudio, setIncludeBackgroundAudio] = useState(true);
  const [showTerminalOverlay, setShowTerminalOverlay] = useState(true);

  const duration = Math.max(project.timeline.duration, videoDuration || 0, 0.5);
  const estimatedFrames = Math.ceil(duration * settings.overlayFps);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    (async () => {
      const app = await loadSettingsFromConfig();
      if (cancelled) return;
      const next = settingsFromApp(app, project);
      setSettings(next);
      setShowTerminalOverlay(app.enableTerminalOverlay !== false);
      if (!outputPath) {
        let suggested = next.outputPath;
        if (suggested.startsWith('~/') && isTauriRuntime()) {
          try {
            const home = await invoke<string>('get_home_dir_path');
            suggested = `${home}/${suggested.slice(2)}`;
          } catch {}
        }
        setOutputPath(suggested);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !isTauriRuntime()) return;
    let unlisten: UnlistenFn | undefined;
    listen<{ phase: string; percent: number; message: string }>('export-progress', (event) => {
      const payload = event.payload;
      setPhase(payload.phase);
      setStatus(payload.message);
      if (payload.phase === 'encoding') {
        setPercent(65 + Math.max(0, Math.min(100, payload.percent)) * 0.34);
      } else if (payload.phase === 'done') {
        setPercent(100);
      }
    })
      .then((un) => {
        unlisten = un;
      })
      .catch(() => {});
    return () => {
      unlisten?.();
    };
  }, [isOpen]);

  const resolutionIndex = useMemo(
    () =>
      RESOLUTIONS.findIndex(
        (r) => r.width === settings.width && r.height === settings.height
      ),
    [settings.width, settings.height]
  );

  if (!isOpen) return null;

  const browseOutput = async () => {
    try {
      const picked = await saveDialog({
        title: 'Export video to...',
        defaultPath: outputPath || 'voix_output.mp4',
        filters: [
          { name: 'MP4 Video', extensions: ['mp4'] },
          { name: 'Matroska Video', extensions: ['mkv'] },
          { name: 'WebM Video', extensions: ['webm'] },
        ],
      });
      if (picked) setOutputPath(picked);
    } catch (err) {
      console.warn('Save dialog failed:', err);
    }
  };

  const handleStartExport = async () => {
    if (!outputPath.trim()) {
      setErrorMessage('Choose an output file first.');
      return;
    }
    setIsExporting(true);
    setResultMessage(null);
    setErrorMessage(null);
    setPercent(0);
    setPhase('preparing');
    setStatus('Preparing project...');

    const onProgress = (event: ExportProgressEvent) => {
      setPhase(event.phase);
      setStatus(event.message);
      setPercent(Math.max(0, Math.min(100, event.percent)));
    };

    try {
      const result = await executeExportVideo({
        project: {
          ...project,
          timeline: {
            ...project.timeline,
            width: settings.width,
            height: settings.height,
            fps: settings.fps,
            overlayFps: settings.overlayFps,
            duration,
          },
        },
        settings,
        outputPath,
        backgroundPath: videoPath,
        backgroundVolume: includeBackgroundAudio ? project.timeline.videoVolume ?? 1 : 0,
        showTerminal: showTerminalOverlay,
        onProgress,
      });
      setResultMessage(result);
      setPercent(100);
      setPhase('done');
      setStatus('Export complete');
    } catch (err) {
      setErrorMessage(String(err));
      setPhase('error');
    } finally {
      setIsExporting(false);
    }
  };

  const setResolution = (index: number) => {
    const resolution = RESOLUTIONS[index];
    if (!resolution) return;
    setSettings((prev) => ({
      ...prev,
      width: resolution.width,
      height: resolution.height,
    }));
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-3xl max-h-[92vh] overflow-hidden bg-[#141517] border border-[#2c2e32] rounded-sm shadow-2xl flex flex-col">
        <div className="px-4 py-3 border-b border-[#242629] flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2">
            <Film className="w-4 h-4 text-[#8ab4f8]" />
            <h2 className="text-sm font-semibold text-[#e3e3e3]">Export Video</h2>
            <span className="text-[10px] font-mono text-[#8e918f] border border-[#2e3135] rounded px-1.5 py-0.5">
              FFmpeg · frame compositor
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isExporting}
            className="p-1 rounded hover:bg-[#24272b] text-[#8e918f] hover:text-white disabled:opacity-30"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <section className="space-y-2">
            <label className="text-[11px] font-mono uppercase tracking-wider text-[#8e918f]">
              Output file
            </label>
            <div className="flex gap-2">
              <input
                value={outputPath}
                onChange={(e) => setOutputPath(e.target.value)}
                disabled={isExporting}
                className="flex-1 bg-[#0d0e10] border border-[#2a2c30] rounded-sm px-3 py-2 text-xs font-mono text-[#e3e3e3] focus:outline-none focus:border-[#8ab4f8]"
                placeholder="/home/user/voix_output.mp4"
              />
              <button
                type="button"
                onClick={browseOutput}
                disabled={isExporting}
                className="px-3 py-2 bg-[#1a1c1f] hover:bg-[#24272b] border border-[#2a2c30] rounded-sm text-xs text-[#c4c7c5] flex items-center gap-1.5 disabled:opacity-30"
              >
                <FolderOpen className="w-3.5 h-3.5" />
                Browse
              </button>
            </div>
            <p className="text-[10px] text-[#6f7276] font-mono">
              Extension selects the container: .mp4 / .mkv → H.264 + AAC, .webm → VP9 + Opus.
            </p>
          </section>

          <div className="grid grid-cols-2 gap-3">
            <section className="space-y-2">
              <label className="text-[11px] font-mono uppercase tracking-wider text-[#8e918f]">
                Resolution
              </label>
              <select
                value={resolutionIndex >= 0 ? resolutionIndex : 0}
                onChange={(e) => setResolution(Number(e.target.value))}
                disabled={isExporting}
                className="w-full bg-[#0d0e10] border border-[#2a2c30] rounded-sm px-2.5 py-2 text-xs text-[#e3e3e3] focus:outline-none focus:border-[#8ab4f8]"
              >
                {resolutionIndex < 0 && (
                  <option value={0}>
                    Custom {settings.width} × {settings.height}
                  </option>
                )}
                {RESOLUTIONS.map((r, i) => (
                  <option key={r.label} value={i}>
                    {r.label}
                  </option>
                ))}
              </select>
            </section>

            <section className="space-y-2">
              <label className="text-[11px] font-mono uppercase tracking-wider text-[#8e918f]">
                Output FPS
              </label>
              <select
                value={settings.fps}
                onChange={(e) =>
                  setSettings((prev) => ({ ...prev, fps: Number(e.target.value) as 30 | 60 }))
                }
                disabled={isExporting}
                className="w-full bg-[#0d0e10] border border-[#2a2c30] rounded-sm px-2.5 py-2 text-xs text-[#e3e3e3] focus:outline-none focus:border-[#8ab4f8]"
              >
                <option value={30}>30 fps</option>
                <option value={60}>60 fps</option>
              </select>
            </section>

            <section className="space-y-2">
              <label className="text-[11px] font-mono uppercase tracking-wider text-[#8e918f]">
                Overlay FPS (tachie/text)
              </label>
              <select
                value={settings.overlayFps}
                onChange={(e) =>
                  setSettings((prev) => ({ ...prev, overlayFps: Number(e.target.value) }))
                }
                disabled={isExporting}
                className="w-full bg-[#0d0e10] border border-[#2a2c30] rounded-sm px-2.5 py-2 text-xs text-[#e3e3e3] focus:outline-none focus:border-[#8ab4f8]"
              >
                {[10, 12, 15, 20, 24, 30].map((f) => (
                  <option key={f} value={f}>
                    {f} fps
                  </option>
                ))}
              </select>
            </section>

            <section className="space-y-2">
              <label className="text-[11px] font-mono uppercase tracking-wider text-[#8e918f]">
                Quality (CRF)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min={0}
                  max={35}
                  value={settings.crf}
                  onChange={(e) =>
                    setSettings((prev) => ({ ...prev, crf: Number(e.target.value) }))
                  }
                  disabled={isExporting}
                  className="flex-1 accent-[#3b82f6]"
                />
                <span className="text-xs font-mono text-[#c4c7c5] w-7 text-right">{settings.crf}</span>
              </div>
            </section>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <section className="space-y-2">
              <label className="text-[11px] font-mono uppercase tracking-wider text-[#8e918f]">
                x264 Preset
              </label>
              <select
                value={settings.preset}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    preset: e.target.value as ExportSettings['preset'],
                  }))
                }
                disabled={isExporting}
                className="w-full bg-[#0d0e10] border border-[#2a2c30] rounded-sm px-2.5 py-2 text-xs text-[#e3e3e3] focus:outline-none focus:border-[#8ab4f8]"
              >
                <option value="ultrafast">ultrafast</option>
                <option value="fast">fast</option>
                <option value="medium">medium</option>
                <option value="slow">slow</option>
              </select>
            </section>

            <label className="flex items-center gap-2 text-xs text-[#c4c7c5] bg-[#101113] border border-[#26282c] rounded-sm px-3 py-2 self-end cursor-pointer">
              <input
                type="checkbox"
                checked={includeBackgroundAudio}
                onChange={(e) => setIncludeBackgroundAudio(e.target.checked)}
                disabled={isExporting}
                className="accent-[#3b82f6]"
              />
              Include background video audio
            </label>
          </div>

          <div className="bg-[#0d0e10] border border-[#242629] rounded-sm p-3 grid grid-cols-3 gap-3 text-xs font-mono">
            <div>
              <div className="text-[10px] text-[#6f7276] uppercase">Duration</div>
              <div className="text-[#e3e3e3]">{duration.toFixed(2)}s</div>
            </div>
            <div>
              <div className="text-[10px] text-[#6f7276] uppercase">Overlay frames</div>
              <div className="text-[#e3e3e3]">{estimatedFrames}</div>
            </div>
            <div>
              <div className="text-[10px] text-[#6f7276] uppercase">Estimated size</div>
              <div className="text-[#e3e3e3]">
                ~{Math.max(1, Math.round((duration * settings.width * settings.height) / 7_000_000))} MB
              </div>
            </div>
          </div>

          {(isExporting || percent > 0 || errorMessage || resultMessage) && (
            <section className="bg-[#0d0e10] border border-[#242629] rounded-sm p-3 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 text-[#c4c7c5] font-mono uppercase">
                  {errorMessage ? (
                    <AlertCircle className="w-3.5 h-3.5 text-rose-400" />
                  ) : resultMessage ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <Loader2 className="w-3.5 h-3.5 text-[#8ab4f8] animate-spin" />
                  )}
                  {phase || 'idle'}
                </span>
                <span className="font-mono text-[#8e918f]">{Math.round(percent)}%</span>
              </div>
              <div className="h-1.5 w-full bg-[#222428] rounded-sm overflow-hidden">
                <div
                  className={`h-full transition-all ${
                    errorMessage ? 'bg-rose-500' : resultMessage ? 'bg-emerald-500' : 'bg-[#3b82f6]'
                  }`}
                  style={{ width: `${Math.max(percent, isExporting ? 2 : 0)}%` }}
                />
              </div>
              <p className="text-[11px] text-[#8e918f] font-mono break-words">{status || 'Ready.'}</p>
              {resultMessage && (
                <p className="text-[11px] text-emerald-300 font-mono break-all">{resultMessage}</p>
              )}
              {errorMessage && (
                <pre className="text-[11px] text-rose-300 font-mono whitespace-pre-wrap break-words max-h-40 overflow-auto">
                  {errorMessage}
                </pre>
              )}
            </section>
          )}

          <div className="text-[10px] text-[#6f7276] font-mono flex items-center gap-1.5">
            <Terminal className="w-3 h-3" />
            Frames are rendered by the shared canvas compositor, then encoded by Rust/FFmpeg.
            <Gauge className="w-3 h-3 ml-auto" />
            {videoPath ? 'background video attached' : 'solid background'}
          </div>
        </div>

        <div className="px-4 py-3 border-t border-[#242629] flex items-center justify-end gap-2 flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={isExporting}
            className="px-3 py-1.5 text-xs text-[#c4c7c5] hover:text-white border border-[#2a2c30] rounded-sm hover:bg-[#1e2023] disabled:opacity-30"
          >
            Close
          </button>
          <button
            type="button"
            onClick={handleStartExport}
            disabled={isExporting || project.items.length === 0}
            className="px-4 py-1.5 bg-[#004a77] hover:bg-[#005a92] text-[#c2e7ff] border border-[#005a92] rounded-sm text-xs font-mono font-semibold flex items-center gap-1.5 disabled:opacity-30"
          >
            {isExporting ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Download className="w-3.5 h-3.5" />
            )}
            {isExporting ? 'Exporting...' : 'Start Export'}
          </button>
        </div>
      </div>
    </div>
  );
};

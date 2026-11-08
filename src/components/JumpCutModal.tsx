import React, { useState, useEffect } from 'react';
import { X, Loader2, Flag, MessageSquare, Check, Scissors } from 'lucide-react';
import { detectSpeechFromVideo } from '../services/exportService';

interface JumpCutModalProps {
  isOpen: boolean;
  onClose: () => void;
  videoPath: string | null;
  videoDuration: number;
  onApplySpeechMarkers: (segments: { start: number; end: number }[]) => void;
  onApplyVoicePlaceholders: (segments: { start: number; end: number }[]) => void;
}

export const JumpCutModal: React.FC<JumpCutModalProps> = ({
  isOpen,
  onClose,
  videoPath,
  videoDuration,
  onApplySpeechMarkers,
  onApplyVoicePlaceholders,
}) => {
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [segments, setSegments] = useState<{ start: number; end: number }[]>([]);
  const [appliedAction, setAppliedAction] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setSegments([]);
      setError(null);
      setAppliedAction(null);
      return;
    }

    if (!videoPath) {
      setError('No background video loaded. Please select a background video first.');
      return;
    }

    let cancelled = false;
    setAnalyzing(true);
    setError(null);

    detectSpeechFromVideo(videoPath)
      .then((segs) => {
        if (cancelled) return;
        setSegments(segs);
        setAnalyzing(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(`Audio speech detection failed: ${String(err)}`);
        setAnalyzing(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, videoPath]);

  if (!isOpen) return null;

  // Statistics
  const speechDuration = segments.reduce((acc, s) => acc + Math.max(0, s.end - s.start), 0);
  const silenceDuration = Math.max(0, videoDuration - speechDuration);
  const silencePercent = videoDuration > 0 ? Math.round((silenceDuration / videoDuration) * 100) : 0;

  return (
    <div className="fixed inset-0 z-50 bg-black/65 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-[#141619] border border-[#2e3135] rounded-lg shadow-2xl w-full max-w-xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-[#25282c] flex items-center justify-between bg-[#191b1f]">
          <div className="flex items-center gap-2">
            <Scissors className="w-4 h-4 text-[#8ab4f8]" />
            <h2 className="text-sm font-semibold text-[#e3e3e3]">
              Auto Silence Cut & Speech Detection (Jump Cut Assistant)
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-[#8e918f] hover:text-[#e3e3e3] rounded transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4">
          {analyzing ? (
            <div className="py-12 flex flex-col items-center justify-center text-center space-y-3">
              <Loader2 className="w-8 h-8 text-[#8ab4f8] animate-spin" />
              <div className="text-sm font-medium text-[#e3e3e3]">
                Analyzing audio track (FFmpeg silencedetect)...
              </div>
              <p className="text-xs text-[#8e918f]">
                Detecting silent intervals, game audio, and speech segments...
              </p>
            </div>
          ) : error ? (
            <div className="p-4 bg-[#2a171a] border border-[#4c1d24] rounded text-rose-300 text-xs">
              {error}
            </div>
          ) : (
            <>
              {/* Stats Bar */}
              <div className="bg-[#181a1e] border border-[#26292f] rounded-lg p-3.5 space-y-2.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[#8e918f]">Detected speech & sound segments:</span>
                  <span className="font-mono text-[#8ab4f8] font-semibold">
                    {segments.length} segments ({speechDuration.toFixed(1)}s)
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[#8e918f]">Silence / cut candidates:</span>
                  <span className="font-mono text-amber-300 font-semibold">
                    approx. {silenceDuration.toFixed(1)}s ({silencePercent}% of video)
                  </span>
                </div>

                {/* Progress bar */}
                <div className="h-2 w-full bg-[#0d0e11] rounded-full overflow-hidden flex">
                  <div
                    style={{ width: `${Math.min(100, (speechDuration / (videoDuration || 1)) * 100)}%` }}
                    className="bg-emerald-500 h-full"
                    title="Speech & sound segment"
                  />
                  <div
                    style={{ width: `${silencePercent}%` }}
                    className="bg-amber-600/70 h-full"
                    title="Silent segment"
                  />
                </div>
              </div>

              {/* Action Cards */}
              <div className="space-y-2.5">
                <div className="text-[11px] font-mono uppercase tracking-wider text-[#8e918f]">
                  Apply Editing Assist
                </div>

                {/* Action 1: Add Markers */}
                <button
                  type="button"
                  onClick={() => {
                    onApplySpeechMarkers(segments);
                    setAppliedAction('markers');
                  }}
                  disabled={segments.length === 0}
                  className="w-full text-left p-3 rounded-md bg-[#181b1f] hover:bg-[#1f2329] border border-[#2c3038] hover:border-[#3d4450] transition flex items-start gap-3 group"
                >
                  <div className="w-8 h-8 rounded bg-[#262c36] text-amber-300 flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition">
                    <Flag className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold text-[#e3e3e3] flex items-center gap-1.5">
                      Place speech segment markers on timeline
                      {appliedAction === 'markers' && (
                        <span className="text-emerald-400 text-[10px] flex items-center gap-0.5">
                          <Check className="w-3 h-3" /> Done
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-[#8e918f] mt-0.5">
                      Adds timeline flags at speech start points for quick seeking and chapter navigation.
                    </p>
                  </div>
                </button>

                {/* Action 2: Place Voice Items */}
                <button
                  type="button"
                  onClick={() => {
                    onApplyVoicePlaceholders(segments);
                    setAppliedAction('voices');
                  }}
                  disabled={segments.length === 0}
                  className="w-full text-left p-3 rounded-md bg-[#181b1f] hover:bg-[#1f2329] border border-[#2c3038] hover:border-[#3d4450] transition flex items-start gap-3 group"
                >
                  <div className="w-8 h-8 rounded bg-[#1f3328] text-emerald-300 flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition">
                    <MessageSquare className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold text-[#e3e3e3] flex items-center gap-1.5">
                      Batch create dialogue placeholder items for speech segments
                      {appliedAction === 'voices' && (
                        <span className="text-emerald-400 text-[10px] flex items-center gap-0.5">
                          <Check className="w-3 h-3" /> Done
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-[#8e918f] mt-0.5">
                      Auto-generates dialogue items matching speech timings. Simply type lines to finish editing.
                    </p>
                  </div>
                </button>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-[#111315] border-t border-[#222528] flex items-center justify-between">
          <span className="text-xs text-[#8e918f]">
            Threshold: -30dB / Min silence duration: 0.35s
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-[#25282c] hover:bg-[#30343a] text-xs text-[#e3e3e3] rounded transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

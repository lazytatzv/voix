import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ZoomIn,
  ZoomOut,
  Film,
  MessageSquare,
  Type,
  Image as ImageIcon,
  Music,
  Plus,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  VolumeX,
  Volume2,
  Trash2,
  SlidersHorizontal,
  Maximize2,
  Scissors,
  Flag,
  Copy,
  ChevronLeft,
  ChevronRight,
  ArrowLeftToLine,
} from 'lucide-react';
import { Character, ItemType, Marker, TimelineItem, TrackKind, TrackState } from '../types';
import { getSubtitleDisplayText } from '../utils/pronunciation';
import { getWaveformPeaks } from '../services/waveformCache';
import { snapTimelineTime, snapTimelineTimeDetailed } from '../utils/timelineSnap';

interface TimelineProps {
  items: TimelineItem[];
  characters: Character[];
  currentTime: number;
  duration: number;
  isPlaying?: boolean;
  selectedItemId?: string | null;
  selectedItemIds?: string[];
  tracks: TrackState[];
  hasVideo?: boolean;
  videoName?: string;
  onPickVideo?: () => void;
  onFileDrop?: (fileOrPath: File | string) => void;
  onSeek: (time: number) => void;
  onUpdateItem: (id: string, updates: Partial<TimelineItem>, record?: boolean) => void;
  onBeginTransform?: () => void;
  onSelectItem: (id: string | null, additive?: boolean) => void;
  onDeleteItem: (id: string) => void;
  onDeleteItems?: (ids: string[]) => void;
  onRippleDeleteSelected?: () => void;
  onNudgeSelected?: (direction: -1 | 1) => void;
  onDuplicateSelected?: () => void;
  onAddItem: (type: ItemType) => void;
  onUpdateTrack: (id: TrackKind, updates: Partial<TrackState>) => void;
  onInspectItem: (id: string) => void;
  onSplitSelected?: () => void;
  markers?: Marker[];
  onAddMarker?: () => void;
  onDeleteMarker?: (id: string) => void;
}

interface RowDef {
  kind: TrackKind;
  label: string;
  height: number;
  icon: React.ComponentType<{ className?: string }>;
  addType?: ItemType;
}

const ROWS: RowDef[] = [
  { kind: 'video', label: 'Video', height: 38, icon: Film },
  { kind: 'character', label: 'Characters', height: 38, icon: MessageSquare },
  { kind: 'voice', label: 'Voice', height: 46, icon: MessageSquare, addType: 'voice' },
  { kind: 'text', label: 'Text', height: 38, icon: Type, addType: 'text' },
  { kind: 'image', label: 'Images', height: 38, icon: ImageIcon, addType: 'image' },
  { kind: 'audio', label: 'BGM / SE', height: 38, icon: Music, addType: 'audio' },
];

const RULER_HEIGHT = 24;
const HEADER_WIDTH = 184;

const ITEM_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  voice: { bg: '#1e3341', border: '#4f7386', text: '#e3e3e3' },
  text: { bg: '#2c2438', border: '#6b5a80', text: '#eeeeee' },
  image: { bg: '#1f3532', border: '#5b7f79', text: '#eeeeee' },
  audio: { bg: '#3a2c1c', border: '#7a6548', text: '#f0e6d2' },
  video: { bg: '#24272b', border: '#5f6368', text: '#e3e3e3' },
};

function snapTime(time: number, enabled: boolean, markers: Marker[] = []): number {
  return snapTimelineTime(time, enabled, markers);
}

function rulerStep(pxPerSecond: number): number {
  const candidates = [0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300];
  return candidates.find((step) => step * pxPerSecond >= 62) || 600;
}

interface WaveformProps {
  cacheKey: string;
  src: string;
  blob?: Blob;
  color: string;
}

const Waveform: React.FC<WaveformProps> = ({ cacheKey, src, blob, color }) => {
  const [peaks, setPeaks] = useState<number[]>([]);

  useEffect(() => {
    let cancelled = false;
    setPeaks([]);
    void getWaveformPeaks(cacheKey, src, blob).then((next) => {
      if (!cancelled) setPeaks(next);
    });
    return () => {
      cancelled = true;
    };
  }, [cacheKey, src, blob]);

  if (peaks.length === 0) return null;

  const path = peaks
    .map((peak, index) => {
      const x = peaks.length === 1 ? 50 : (index / (peaks.length - 1)) * 100;
      const height = Math.max(2, peak * 92);
      return `M${x.toFixed(2)} ${(50 - height / 2).toFixed(2)}V${(50 + height / 2).toFixed(2)}`;
    })
    .join('');

  return (
    <svg
      className="absolute inset-0 w-full h-full pointer-events-none"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path
        d={path}
        stroke={color}
        strokeWidth={1}
        strokeLinecap="round"
        opacity={0.55}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
};

export const Timeline: React.FC<TimelineProps> = ({
  items,
  characters,
  currentTime,
  duration,
  isPlaying = false,
  selectedItemId,
  selectedItemIds = [],
  tracks,
  hasVideo,
  videoName,
  onPickVideo,
  onFileDrop,
  onSeek,
  onUpdateItem,
  onBeginTransform,
  onSelectItem,
  onDeleteItem,
  onDeleteItems,
  onRippleDeleteSelected,
  onNudgeSelected,
  onDuplicateSelected,
  onAddItem,
  onUpdateTrack,
  onInspectItem,
  onSplitSelected,
  markers = [],
  onAddMarker,
  onDeleteMarker,
}) => {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [draggingItemId, setDraggingItemId] = useState<string | null>(null);
  const [hoveredItemId, setHoveredItemId] = useState<string | null>(null);
  const [snapGuideTime, setSnapGuideTime] = useState<number | null>(null);

  const totalDuration = Math.max(duration, 10);
  const pxPerSecond = 50 * zoom;
  const timelineWidth = Math.max(totalDuration * pxPerSecond + 40, 900);
  const step = rulerStep(pxPerSecond);
  const totalRowsHeight = ROWS.reduce((sum, row) => sum + row.height, 0);

  const timeToX = (time: number) => time * pxPerSecond;
  const xToTime = (x: number) => Math.max(0, Math.min(x / pxPerSecond, totalDuration));

  const charColor = useCallback(
    (characterId: string) => {
      const char = characters.find((c) => c.id === characterId);
      return char?.subtitleStyle?.outerStrokeColor || char?.subtitleStyle?.textColor || '#38bdf8';
    },
    [characters]
  );

  const seekFromClientX = useCallback(
    (clientX: number, disableSnap = false) => {
      const container = scrollRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const x = clientX - rect.left + container.scrollLeft - HEADER_WIDTH; // label column width
      onSeek(snapTime(xToTime(x), !disableSnap, markers));
    },
    [onSeek, pxPerSecond, markers]
  );

  const beginScrub = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    if (!e.ctrlKey && !e.metaKey && !e.shiftKey) onSelectItem(null);
    seekFromClientX(e.clientX, e.altKey);
    const onMove = (event: MouseEvent) => seekFromClientX(event.clientX, event.altKey);
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const selectedItems = items.filter((item) => selectedItemIds.includes(item.id));
  const selectedAllHidden =
    selectedItems.length > 0 && selectedItems.every((item) => item.hidden);

  const collectSnapTargets = useCallback(
    (excludeIds: Set<string>) => {
      const targets: number[] = [0, currentTime];
      markers.forEach((marker) => targets.push(marker.time));
      items.forEach((entry) => {
        if (excludeIds.has(entry.id)) return;
        targets.push(entry.startTime);
        targets.push(entry.startTime + entry.duration);
      });
      return targets;
    },
    [currentTime, items, markers]
  );

  const beginItemDrag = (e: React.MouseEvent, item: TimelineItem, mode: 'move' | 'resize') => {
    e.stopPropagation();
    e.preventDefault();
    if (e.button !== 0) return;
    const additive = e.ctrlKey || e.metaKey || e.shiftKey;
    const wasSelected = selectedItemIds.includes(item.id);
    if (!wasSelected) onSelectItem(item.id, additive);

    const trackKind: TrackKind = item.type === 'voice' ? 'voice' : item.type;
    if (item.locked || tracks.find((track) => track.id === trackKind)?.locked) return;

    const activeIds = new Set(
      wasSelected
        ? selectedItemIds
        : additive
          ? [...selectedItemIds, item.id]
          : [item.id]
    );
    const movableItems = items.filter((entry) => {
      if (!activeIds.has(entry.id)) return false;
      const kind: TrackKind = entry.type === 'voice' ? 'voice' : entry.type;
      return !entry.locked && !tracks.find((track) => track.id === kind)?.locked;
    });
    if (!movableItems.some((entry) => entry.id === item.id)) movableItems.push(item);

    const startTimes = new Map(movableItems.map((entry) => [entry.id, entry.startTime]));
    const minStart = Math.min(...startTimes.values());
    const startX = e.clientX;
    const primaryStart = item.startTime;
    const startDuration = item.duration;
    const snapTargets = collectSnapTargets(new Set(movableItems.map((entry) => entry.id)));
    let moved = false;
    let historyStarted = false;

    const onMove = (event: MouseEvent) => {
      const delta = (event.clientX - startX) / pxPerSecond;
      if (!moved && Math.abs(event.clientX - startX) > 2) {
        moved = true;
        setDraggingItemId(item.id);
      }
      if (!moved) return;
      if (!historyStarted) {
        historyStarted = true;
        onBeginTransform?.();
      }
      if (mode === 'move') {
        const snap = snapTimelineTimeDetailed(
          primaryStart + delta,
          !event.altKey,
          markers,
          snapTargets,
          8 / pxPerSecond
        );
        const applied = Math.max(snap.time - primaryStart, -minStart);
        setSnapGuideTime(snap.snappedTo);
        startTimes.forEach((start, id) => {
          onUpdateItem(
            id,
            { startTime: Number(Math.max(0, start + applied).toFixed(3)) },
            false
          );
        });
      } else {
        const rawEnd = primaryStart + Math.max(0.1, startDuration + delta);
        const snap = snapTimelineTimeDetailed(
          rawEnd,
          !event.altKey,
          markers,
          snapTargets,
          8 / pxPerSecond
        );
        setSnapGuideTime(snap.snappedTo);
        onUpdateItem(
          item.id,
          { duration: Number(Math.max(0.1, snap.time - primaryStart).toFixed(3)) },
          false
        );
      }
    };
    const onUp = () => {
      setDraggingItemId(null);
      setSnapGuideTime(null);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      if (!moved) {
        onSeek(item.startTime);
        if (wasSelected) onSelectItem(item.id, additive);
      }
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const fitToWindow = () => {
    const width = scrollRef.current?.clientWidth || 1000;
    setZoom(Math.max(0.15, Math.min(8, (width - 180) / Math.max(totalDuration, 1) / 50)));
  };

  useEffect(() => {
    const container = scrollRef.current;
    if (!container || !isPlaying) return;
    const x = HEADER_WIDTH + timeToX(currentTime);
    const visibleStart = container.scrollLeft + HEADER_WIDTH;
    const visibleEnd = container.scrollLeft + container.clientWidth;
    if (x < visibleStart + 24 || x > visibleEnd - 48) {
      container.scrollLeft = Math.max(0, x - container.clientWidth * 0.35);
    }
  }, [currentTime, isPlaying, pxPerSecond]);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    const handleWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const rect = container.getBoundingClientRect();
      const pointerX = event.clientX - rect.left + container.scrollLeft - HEADER_WIDTH;
      const timeAtPointer = Math.max(0, pointerX / pxPerSecond);
      const factor = event.deltaY < 0 ? 1.15 : 1 / 1.15;
      setZoom((previous) => {
        const next = Math.max(0.15, Math.min(8, previous * factor));
        const nextPx = 50 * next;
        requestAnimationFrame(() => {
          container.scrollLeft = Math.max(
            0,
            HEADER_WIDTH + timeAtPointer * nextPx - (event.clientX - rect.left)
          );
        });
        return next;
      });
    };
    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, [pxPerSecond]);

  const renderItem = (item: TimelineItem, rowKind: TrackKind) => {
    const left = timeToX(item.startTime);
    const width = Math.max(timeToX(item.duration), 18);
    const color = ITEM_COLORS[item.type];
    const isSelected = selectedItemIds.includes(item.id) || selectedItemId === item.id;
    const isPrimary = selectedItemId === item.id;
    const isDragging = draggingItemId === item.id;
    const locked = item.locked || tracks.find((track) => track.id === rowKind)?.locked;

    let label = item.name;
    if (item.type === 'voice') label = getSubtitleDisplayText(item.text);
    if (item.type === 'text') label = item.text;
    if (item.type === 'audio') label = item.name || item.src.split('/').pop() || 'Audio';
    if (item.type === 'image') label = item.name || item.src.split('/').pop() || 'Image';

    const waveform =
      item.type === 'voice' && item.audioBlob ? (
        <Waveform
          cacheKey={item.audioKey || item.audioBlobUrl || item.id}
          src={item.audioBlobUrl || ''}
          blob={item.audioBlob}
          color="#e0f2fe"
        />
      ) : item.type === 'audio' && item.src ? (
        <Waveform
          cacheKey={item.audioKey || item.src}
          src={item.src}
          blob={item.audioBlob}
          color="#fef3c7"
        />
      ) : null;

    return (
      <div
        key={`${rowKind}_${item.id}`}
        onMouseDown={(e) => beginItemDrag(e, item, 'move')}
        onDoubleClick={(e) => {
          e.stopPropagation();
          onInspectItem(item.id);
        }}
        onMouseEnter={() => setHoveredItemId(item.id)}
        onMouseLeave={() => setHoveredItemId(null)}
        className={`group absolute top-1 bottom-1 rounded-[2px] flex items-center px-1.5 text-xs select-none overflow-hidden ${
          locked ? 'cursor-not-allowed' : 'cursor-grab active:cursor-grabbing'
        } ${
          isDragging
            ? 'ring-2 ring-white z-30'
            : isPrimary
              ? 'ring-2 ring-[#c4c7c5] z-20'
              : isSelected
                ? 'ring-1 ring-white/80 z-20'
                : 'z-10'
        }`}
        style={{
          left,
          width,
          backgroundColor: color.bg,
          color: color.text,
          border: `1px solid ${item.type === 'voice' ? charColor(item.characterId) : color.border}`,
          opacity: item.hidden ? 0.35 : 1,
        }}
        title={`${label}\n${item.startTime.toFixed(2)}s → ${(item.startTime + item.duration).toFixed(2)}s\n${
          locked
            ? 'Track is locked — unlock it in the track header to edit'
            : 'Drag to move / right edge to resize / double-click to inspect'
        }`}
      >
        {waveform}
        {(item.type === 'text' || item.type === 'image') &&
          (item.keyframes?.length ?? 0) > 0 && (
            <div className="absolute inset-x-0 bottom-0.5 z-20 h-2 pointer-events-none">
              {item.keyframes!.map((key) => (
                <span
                  key={key.id}
                  className="absolute bottom-0 w-1.5 h-1.5 rotate-45 bg-[#f8d66d] border border-black/50"
                  style={{
                    left: `${(Math.min(item.duration, Math.max(0, key.time)) /
                      Math.max(0.01, item.duration)) *
                      100}%`,
                  }}
                  title={`Keyframe +${key.time.toFixed(2)}s`}
                />
              ))}
            </div>
          )}
        {item.type === 'voice' && (
          <span
            className="relative z-10 w-1 self-stretch mr-1 flex-shrink-0"
            style={{ backgroundColor: charColor(item.characterId) }}
          />
        )}
        <span className="relative z-10 truncate font-mono text-[11px]">{label}</span>
        {(hoveredItemId === item.id || isSelected) && !locked && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDeleteItem(item.id);
            }}
            className="relative z-10 ml-auto p-0.5 text-white/70 hover:text-white flex-shrink-0"
            title="Delete item"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        )}
        {!locked && (
          <div
            onMouseDown={(e) => beginItemDrag(e, item, 'resize')}
            className="absolute right-0 top-0 bottom-0 w-1.5 cursor-ew-resize hover:bg-white/40"
            title="Resize duration"
          />
        )}
      </div>
    );
  };

  const visibleItemsForRow = (kind: TrackKind): TimelineItem[] => {
    if (kind === 'character' || kind === 'voice') return items.filter((item) => item.type === 'voice');
    if (kind === 'text') return items.filter((item) => item.type === 'text');
    if (kind === 'image') return items.filter((item) => item.type === 'image');
    if (kind === 'audio') return items.filter((item) => item.type === 'audio');
    if (kind === 'video') return items.filter((item) => item.type === 'video');
    return [];
  };

  return (
    <div className="flex flex-col bg-[#141517] border border-[#242629] rounded-none overflow-hidden select-none h-full">
      <div className="px-3 py-1.5 bg-[#141517] border-b border-[#222426] flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3 text-xs text-[#c4c7c5]">
          <span className="font-semibold text-xs font-mono uppercase tracking-wider text-[#e3e3e3]">Timeline</span>
          <span className="text-[#8e918f] font-mono text-[11px]">
            {items.length} items / {totalDuration.toFixed(2)}s
          </span>
          {selectedItemIds.length > 0 && (
            <div className="flex items-center gap-1">
              <span className="font-mono text-[10px] text-[#c4c7c5] bg-[#222528] border border-[#3a3f46] rounded px-1">
                {selectedItemIds.length} selected
              </span>
              <button
                type="button"
                onClick={() => {
                  if (selectedItems.length === 0) return;
                  const nextHidden = !selectedAllHidden;
                  onBeginTransform?.();
                  selectedItems.forEach((item) =>
                    onUpdateItem(item.id, { hidden: nextHidden }, false)
                  );
                }}
                className="px-1.5 py-0.5 rounded text-[10px] bg-[#1a1c1e] text-[#8e918f] hover:text-[#c4c7c5] border border-[#2e3135] flex items-center gap-1"
                title="Toggle visibility for all selected items"
              >
                {selectedAllHidden ? (
                  <EyeOff className="w-3 h-3" />
                ) : (
                  <Eye className="w-3 h-3" />
                )}
                {selectedItemIds.length > 1 ? 'Items' : 'Item'}
              </button>
              {selectedItemId && (
                <button
                  type="button"
                  onClick={() => onInspectItem(selectedItemId)}
                  className="px-1.5 py-0.5 rounded text-[10px] bg-[#1a1c1e] text-[#8ab4f8] hover:text-white border border-[#2e3135] flex items-center gap-1"
                >
                  <SlidersHorizontal className="w-3 h-3" />
                  Inspect
                </button>
              )}
              {onDuplicateSelected && (
                <button
                  type="button"
                  onClick={onDuplicateSelected}
                  className="px-1.5 py-0.5 rounded text-[10px] bg-[#1a1c1e] text-[#c4c7c5] hover:text-white border border-[#2e3135] flex items-center gap-1"
                  title="Duplicate selected items (Ctrl+D)"
                >
                  <Copy className="w-3 h-3" />
                  Duplicate
                </button>
              )}
              {onNudgeSelected && (
                <>
                  <button
                    type="button"
                    onClick={() => onNudgeSelected(-1)}
                    className="px-1 py-0.5 rounded text-[10px] bg-[#1a1c1e] text-[#c4c7c5] hover:text-white border border-[#2e3135]"
                    title="Nudge selected items left by one frame (Alt+←)"
                  >
                    <ChevronLeft className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onNudgeSelected(1)}
                    className="px-1 py-0.5 rounded text-[10px] bg-[#1a1c1e] text-[#c4c7c5] hover:text-white border border-[#2e3135]"
                    title="Nudge selected items right by one frame (Alt+→)"
                  >
                    <ChevronRight className="w-3 h-3" />
                  </button>
                </>
              )}
              {onSplitSelected && selectedItemIds.length === 1 && (
                <button
                  type="button"
                  onClick={onSplitSelected}
                  className="px-1.5 py-0.5 rounded text-[10px] bg-[#1a1c1e] text-[#c4c7c5] hover:text-white border border-[#2e3135] flex items-center gap-1"
                  title="Split selected item at the playhead (S)"
                >
                  <Scissors className="w-3 h-3" />
                  Split
                </button>
              )}
              {onRippleDeleteSelected && (
                <button
                  type="button"
                  onClick={onRippleDeleteSelected}
                  className="px-1.5 py-0.5 rounded text-[10px] bg-[#1a1c1e] text-rose-400 hover:text-rose-300 border border-[#2e3135] flex items-center gap-1"
                  title="Ripple delete selected items and close the gap (Shift+Delete)"
                >
                  <ArrowLeftToLine className="w-3 h-3" />
                  Ripple
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  if (onDeleteItems && selectedItemIds.length > 1) {
                    onDeleteItems(selectedItemIds);
                  } else {
                    onDeleteItem(selectedItemId ?? selectedItemIds[0]);
                  }
                }}
                className="px-1.5 py-0.5 rounded text-[10px] bg-[#1a1c1e] text-rose-400 hover:text-rose-300 border border-[#2e3135] flex items-center gap-1"
                title="Delete selected items (Delete)"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          )}
          {onAddMarker && (
            <button
              type="button"
              onClick={onAddMarker}
              className="px-1.5 py-0.5 rounded text-[10px] bg-[#1a1c1e] text-amber-300/90 hover:text-amber-200 border border-[#2e3135] flex items-center gap-1"
              title="Add a marker at the playhead (M)"
            >
              <Flag className="w-3 h-3" />
              Marker
              {markers.length > 0 && (
                <span className="font-mono text-[#8e918f]">{markers.length}</span>
              )}
            </button>
          )}
        </div>

        <div className="flex items-center gap-1.5 bg-[#0e0f11] px-2 py-0.5 rounded-sm border border-[#242629]">
          <button
            onClick={() => setZoom((z) => Math.max(0.15, z - 0.15))}
            className="p-1 rounded-sm hover:bg-[#202226] text-[#8e918f] hover:text-white transition"
            title="Zoom Out"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <span className="text-[10px] font-mono text-[#c4c7c5] w-9 text-center">
            {Math.round(zoom * 100)}%
          </span>
          <button
            onClick={() => setZoom((z) => Math.min(8, z + 0.15))}
            className="p-1 rounded-sm hover:bg-[#202226] text-[#8e918f] hover:text-white transition"
            title="Zoom In"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={fitToWindow}
            className="p-1 rounded-sm hover:bg-[#202226] text-[#8e918f] hover:text-white transition"
            title="Fit timeline to window"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="flex-1 overflow-auto min-h-0 relative"
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          const file = e.dataTransfer.files?.[0];
          if (file) {
            const path = (file as unknown as { path?: string }).path;
            onFileDrop?.(path || file);
          }
        }}
      >
        <div className="flex" style={{ width: HEADER_WIDTH + timelineWidth }}>
          {/* Left sticky track headers */}
          <div
            className="sticky left-0 z-40 flex-shrink-0 bg-[#111214] border-r border-[#222426]"
            style={{ width: HEADER_WIDTH }}
          >
            <div className="h-6 border-b border-[#222426] px-3 flex items-center text-[10px] font-mono text-[#8e918f] uppercase">
              Tracks
            </div>
            {ROWS.map((row) => {
              const track = tracks.find((t) => t.id === row.kind);
              const Icon = row.icon;
              const dimmed = track?.visible === false;
              return (
                <div
                  key={row.kind}
                  className={`border-b border-[#222426] px-1.5 flex items-center gap-1 text-[11px] font-mono text-[#c4c7c5] ${
                    dimmed ? 'opacity-55' : ''
                  }`}
                  style={{ height: row.height }}
                >
                  <Icon className="w-3 h-3 text-[#8e918f] flex-shrink-0" />
                  <span className="truncate flex-1 min-w-0 text-[10px]">{row.label}</span>
                  {row.addType ? (
                    <button
                      type="button"
                      onClick={() => onAddItem(row.addType!)}
                      className="w-5 h-5 flex items-center justify-center rounded hover:bg-[#25272a] text-[#8ab4f8] flex-shrink-0"
                      title={`Add ${row.label} item at playhead`}
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  ) : row.kind === 'video' && onPickVideo ? (
                    <button
                      type="button"
                      onClick={onPickVideo}
                      className="w-5 h-5 flex items-center justify-center rounded hover:bg-[#25272a] text-[#8ab4f8] flex-shrink-0"
                      title={hasVideo ? 'Change video file' : 'Select video file'}
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  ) : null}
                  {track && (
                    <>
                      <button
                        type="button"
                        onClick={() => onUpdateTrack(row.kind, { visible: !track.visible })}
                        className="w-5 h-5 flex items-center justify-center rounded hover:bg-[#25272a] text-[#8e918f] flex-shrink-0"
                        title={track.visible ? 'Hide track in preview/export' : 'Show track'}
                      >
                        {track.visible ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3 text-rose-400" />}
                      </button>
                      <button
                        type="button"
                        onClick={() => onUpdateTrack(row.kind, { muted: !track.muted })}
                        className="w-5 h-5 flex items-center justify-center rounded hover:bg-[#25272a] text-[#8e918f] flex-shrink-0"
                        title={track.muted ? 'Unmute track' : 'Mute track'}
                      >
                        {track.muted ? <VolumeX className="w-3 h-3 text-rose-400" /> : <Volume2 className="w-3 h-3" />}
                      </button>
                      <button
                        type="button"
                        onClick={() => onUpdateTrack(row.kind, { locked: !track.locked })}
                        className="w-5 h-5 flex items-center justify-center rounded hover:bg-[#25272a] text-[#8e918f] flex-shrink-0"
                        title={track.locked ? 'Unlock track' : 'Lock track (prevent edits)'}
                      >
                        {track.locked ? <Lock className="w-3 h-3 text-amber-400" /> : <Unlock className="w-3 h-3" />}
                      </button>
                    </>
                  )}
                </div>
              );
            })}
          </div>

          {/* Sequence */}
          <div className="relative flex-1 bg-[#0a0a0c]" style={{ width: timelineWidth }}>
            {/* Ruler */}
            <div
              className="h-6 w-full border-b border-[#222426] relative bg-[#111214] cursor-ew-resize"
              onMouseDown={beginScrub}
              title="Click or drag to scrub"
            >
              {Array.from({ length: Math.floor(totalDuration / step) + 2 }).map((_, index) => {
                const time = index * step;
                if (time > totalDuration) return null;
                return (
                  <div
                    key={index}
                    className="absolute top-0 bottom-0 border-l border-[#2e3134] flex flex-col justify-between pl-1 select-none pointer-events-none"
                    style={{ left: timeToX(time) }}
                  >
                    <span className="text-[9px] font-mono text-[#8e918f] leading-3">
                      {time >= 60
                        ? `${Math.floor(time / 60)}:${String(Math.floor(time % 60)).padStart(2, '0')}`
                        : `${time.toFixed(step < 1 ? 1 : 0)}s`}
                    </span>
                    <div className="h-1.5 w-0.5 bg-[#444746]" />
                  </div>
                );
              })}
              {markers.map((marker) => (
                <button
                  key={marker.id}
                  type="button"
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSeek(marker.time);
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onDeleteMarker?.(marker.id);
                  }}
                  className="absolute top-0 z-20 -translate-x-1/2 p-0.5 text-amber-300 hover:text-amber-100"
                  style={{ left: timeToX(marker.time) }}
                  title={`${marker.label || 'Marker'} · ${marker.time.toFixed(2)}s\nClick to seek · Right-click to delete`}
                >
                  <Flag className="w-3 h-3 fill-current" />
                </button>
              ))}
            </div>

            {/* Track lanes */}
            {ROWS.map((row) => (
              <div
                key={row.kind}
                className="border-b border-[#1d1f22] relative"
                style={{ height: row.height }}
                onMouseDown={beginScrub}
              >
                {row.kind === 'video' && (
                  <div
                    onClick={(e) => {
                      e.stopPropagation();
                      onPickVideo?.();
                    }}
                    className={`absolute top-1 bottom-1 rounded-[2px] flex items-center px-2 text-xs font-mono overflow-hidden whitespace-nowrap cursor-pointer transition-colors ${
                      hasVideo ? 'hover:brightness-125' : 'hover:bg-[#26282c]'
                    }`}
                    style={{
                      left: 0,
                      width: `${Math.min(totalDuration, totalDuration) * pxPerSecond}px`,
                      backgroundColor: '#1b1d20',
                      color: hasVideo ? '#e3e3e3' : '#8e918f',
                      border: '1px solid #33363a',
                    }}
                    title={hasVideo ? `${videoName || 'Video'} (Click to change video)` : 'Click to select video file'}
                  >
                    <Film className="w-3 h-3 mr-1.5 flex-shrink-0 text-[#8e918f]" />
                    <span className="text-[11px]">
                      {hasVideo ? videoName || 'Background video' : 'Click to add video'}
                    </span>
                  </div>
                )}
                {visibleItemsForRow(row.kind).map((item) => (
                  <React.Fragment key={`${row.kind}_${item.id}`}>
                    {renderItem(item, row.kind)}
                  </React.Fragment>
                ))}
              </div>
            ))}

            {markers.map((marker) => (
              <div
                key={`line_${marker.id}`}
                className="absolute w-px pointer-events-none z-20 opacity-40"
                style={{
                  left: timeToX(marker.time),
                  top: RULER_HEIGHT,
                  height: totalRowsHeight,
                  backgroundColor: marker.color || '#fbbf24',
                }}
              />
            ))}

            {snapGuideTime !== null && (
              <div
                className="absolute top-0 w-px bg-amber-300 z-40 pointer-events-none"
                style={{ left: timeToX(snapGuideTime), height: RULER_HEIGHT + totalRowsHeight }}
              />
            )}

            {/* Playhead */}
            <div
              className="absolute top-0 w-[2px] bg-[#c4c7c5] z-30 pointer-events-none"
              style={{ left: timeToX(currentTime), height: RULER_HEIGHT + totalRowsHeight }}
            >
              <div className="w-2.5 h-3 bg-[#c4c7c5] -translate-x-[4px]" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

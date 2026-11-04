import React, { useCallback, useRef, useState } from 'react';
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
} from 'lucide-react';
import { Character, ItemType, TimelineItem, TrackKind, TrackState } from '../types';
import { getSubtitleDisplayText } from '../utils/pronunciation';

interface TimelineProps {
  items: TimelineItem[];
  characters: Character[];
  currentTime: number;
  duration: number;
  selectedItemId?: string | null;
  tracks: TrackState[];
  hasVideo?: boolean;
  videoName?: string;
  onSeek: (time: number) => void;
  onUpdateItem: (id: string, updates: Partial<TimelineItem>) => void;
  onSelectItem: (id: string | null) => void;
  onDeleteItem: (id: string) => void;
  onAddItem: (type: ItemType) => void;
  onUpdateTrack: (id: TrackKind, updates: Partial<TrackState>) => void;
  onInspectItem: (id: string) => void;
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

const ITEM_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  voice: { bg: '#075985', border: '#0ea5e9', text: '#e0f2fe' },
  text: { bg: '#4c1d95', border: '#8b5cf6', text: '#f5f3ff' },
  image: { bg: '#134e4a', border: '#14b8a6', text: '#ccfbf1' },
  audio: { bg: '#78350f', border: '#f59e0b', text: '#fef3c7' },
  video: { bg: '#1f2937', border: '#64748b', text: '#e2e8f0' },
};

function snapTime(time: number, enabled: boolean): number {
  if (!enabled) return Math.max(0, Number(time.toFixed(3)));
  return Math.max(0, Math.round(time * 20) / 20);
}

function rulerStep(pxPerSecond: number): number {
  const candidates = [0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300];
  return candidates.find((step) => step * pxPerSecond >= 62) || 600;
}

export const Timeline: React.FC<TimelineProps> = ({
  items,
  characters,
  currentTime,
  duration,
  selectedItemId,
  tracks,
  hasVideo,
  videoName,
  onSeek,
  onUpdateItem,
  onSelectItem,
  onDeleteItem,
  onAddItem,
  onUpdateTrack,
  onInspectItem,
}) => {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [draggingItemId, setDraggingItemId] = useState<string | null>(null);
  const [hoveredItemId, setHoveredItemId] = useState<string | null>(null);

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
      const x = clientX - rect.left + container.scrollLeft - 128; // label column width
      onSeek(snapTime(xToTime(x), !disableSnap));
    },
    [onSeek, pxPerSecond]
  );

  const beginScrub = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    seekFromClientX(e.clientX, e.altKey);
    const onMove = (event: MouseEvent) => seekFromClientX(event.clientX, event.altKey);
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const beginItemDrag = (e: React.MouseEvent, item: TimelineItem, mode: 'move' | 'resize') => {
    e.stopPropagation();
    e.preventDefault();
    if (e.button !== 0) return;
    const startX = e.clientX;
    const startTime = item.startTime;
    const startDuration = item.duration;
    let moved = false;

    const onMove = (event: MouseEvent) => {
      const delta = (event.clientX - startX) / pxPerSecond;
      if (!moved && Math.abs(event.clientX - startX) > 3) {
        moved = true;
        setDraggingItemId(item.id);
      }
      if (!moved) return;
      if (mode === 'move') {
        onUpdateItem(item.id, { startTime: snapTime(startTime + delta, !event.altKey) });
      } else {
        onUpdateItem(item.id, {
          duration: Math.max(0.1, snapTime(startDuration + delta, !event.altKey)),
        });
      }
    };
    const onUp = () => {
      setDraggingItemId(null);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      if (!moved) {
        onSeek(item.startTime);
        onSelectItem(item.id);
      }
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const fitToWindow = () => {
    const width = scrollRef.current?.clientWidth || 1000;
    setZoom(Math.max(0.15, Math.min(8, (width - 180) / Math.max(totalDuration, 1) / 50)));
  };

  const renderItem = (item: TimelineItem, rowKind: TrackKind) => {
    const left = timeToX(item.startTime);
    const width = Math.max(timeToX(item.duration), 18);
    const color = ITEM_COLORS[item.type];
    const isSelected = selectedItemId === item.id;
    const isDragging = draggingItemId === item.id;

    let label = item.name;
    if (item.type === 'voice') label = getSubtitleDisplayText(item.text);
    if (item.type === 'text') label = item.text;
    if (item.type === 'audio') label = item.name || item.src.split('/').pop() || 'Audio';
    if (item.type === 'image') label = item.name || item.src.split('/').pop() || 'Image';

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
        className={`group absolute top-1 bottom-1 rounded-[2px] flex items-center px-1.5 text-xs cursor-grab active:cursor-grabbing select-none overflow-hidden ${
          isDragging ? 'ring-2 ring-white z-30 shadow-lg' : isSelected ? 'ring-1 ring-white z-20' : 'z-10'
        }`}
        style={{
          left,
          width,
          backgroundColor: item.type === 'voice' ? color.bg : color.bg,
          color: color.text,
          border: `1px solid ${item.type === 'voice' ? charColor(item.characterId) : color.border}`,
          opacity: item.hidden ? 0.35 : 1,
          boxShadow: isSelected ? `0 0 0 1px ${color.border}` : undefined,
        }}
        title={`${label}\n${item.startTime.toFixed(2)}s → ${(item.startTime + item.duration).toFixed(2)}s\nDrag to move / right edge to resize / double-click to inspect`}
      >
        {item.type === 'voice' && (
          <span
            className="w-1 self-stretch mr-1 flex-shrink-0"
            style={{ backgroundColor: charColor(item.characterId) }}
          />
        )}
        <span className="truncate font-mono text-[11px]">{label}</span>
        {(hoveredItemId === item.id || isSelected) && item.type !== 'voice' && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDeleteItem(item.id);
            }}
            className="ml-auto p-0.5 text-white/70 hover:text-white flex-shrink-0"
            title="Delete item"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        )}
        <div
          onMouseDown={(e) => beginItemDrag(e, item, 'resize')}
          className="absolute right-0 top-0 bottom-0 w-1.5 cursor-ew-resize hover:bg-white/40"
          title="Resize duration"
        />
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
    <div className="flex flex-col bg-[#141517] border border-[#242629] rounded-sm overflow-hidden shadow-lg select-none h-full">
      <div className="px-3 py-1.5 bg-[#141517] border-b border-[#222426] flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3 text-xs text-[#c4c7c5]">
          <span className="font-semibold text-xs font-mono uppercase tracking-wider text-[#e3e3e3]">Timeline</span>
          <span className="text-[#8e918f] font-mono text-[11px]">
            {items.length} items / {totalDuration.toFixed(2)}s
          </span>
          {selectedItemId && (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  const item = items.find((it) => it.id === selectedItemId);
                  if (item) onUpdateItem(item.id, { hidden: !item.hidden });
                }}
                className="px-1.5 py-0.5 rounded text-[10px] bg-[#1a1c1e] text-[#8e918f] hover:text-[#c4c7c5] border border-[#2e3135] flex items-center gap-1"
                title="Toggle selected item visibility"
              >
                {items.find((it) => it.id === selectedItemId)?.hidden ? (
                  <EyeOff className="w-3 h-3" />
                ) : (
                  <Eye className="w-3 h-3" />
                )}
                Item
              </button>
              <button
                type="button"
                onClick={() => onInspectItem(selectedItemId)}
                className="px-1.5 py-0.5 rounded text-[10px] bg-[#1a1c1e] text-[#8ab4f8] hover:text-white border border-[#2e3135] flex items-center gap-1"
              >
                <SlidersHorizontal className="w-3 h-3" />
                Inspect
              </button>
              <button
                type="button"
                onClick={() => onDeleteItem(selectedItemId)}
                className="px-1.5 py-0.5 rounded text-[10px] bg-[#1a1c1e] text-rose-400 hover:text-rose-300 border border-[#2e3135] flex items-center gap-1"
                title="Delete selected (Delete)"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
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

      <div ref={scrollRef} className="flex-1 overflow-auto min-h-0 relative">
        <div className="flex" style={{ width: 128 + timelineWidth }}>
          {/* Left sticky track headers */}
          <div className="sticky left-0 z-40 w-32 flex-shrink-0 bg-[#111214] border-r border-[#222426]">
            <div className="h-6 border-b border-[#222426] px-3 flex items-center text-[10px] font-mono text-[#8e918f] uppercase">
              Tracks
            </div>
            {ROWS.map((row) => {
              const track = tracks.find((t) => t.id === row.kind);
              const Icon = row.icon;
              return (
                <div
                  key={row.kind}
                  className="border-b border-[#222426] px-2 flex items-center gap-1.5 text-[11px] font-mono text-[#c4c7c5]"
                  style={{ height: row.height }}
                >
                  <Icon className="w-3 h-3 text-[#8e918f] flex-shrink-0" />
                  <span className="truncate flex-1">{row.label}</span>
                  {row.addType && (
                    <button
                      type="button"
                      onClick={() => onAddItem(row.addType!)}
                      className="p-0.5 rounded hover:bg-[#25272a] text-[#8ab4f8]"
                      title={`Add ${row.label} item at playhead`}
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  )}
                  {track && (
                    <>
                      <button
                        type="button"
                        onClick={() => onUpdateTrack(row.kind, { visible: !track.visible })}
                        className="p-0.5 rounded hover:bg-[#25272a] text-[#8e918f]"
                        title={track.visible ? 'Hide track in preview/export' : 'Show track'}
                      >
                        {track.visible ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3 text-rose-400" />}
                      </button>
                      <button
                        type="button"
                        onClick={() => onUpdateTrack(row.kind, { muted: !track.muted })}
                        className="p-0.5 rounded hover:bg-[#25272a] text-[#8e918f]"
                        title={track.muted ? 'Unmute track' : 'Mute track'}
                      >
                        {track.muted ? <VolumeX className="w-3 h-3 text-rose-400" /> : <Volume2 className="w-3 h-3" />}
                      </button>
                      <button
                        type="button"
                        onClick={() => onUpdateTrack(row.kind, { locked: !track.locked })}
                        className="p-0.5 rounded hover:bg-[#25272a] text-[#8e918f]"
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
                    className="absolute top-1 bottom-1 rounded-[2px] flex items-center px-2 text-xs font-mono overflow-hidden whitespace-nowrap"
                    style={{
                      left: 0,
                      width: `${Math.min(totalDuration, totalDuration) * pxPerSecond}px`,
                      backgroundColor: '#111827',
                      color: hasVideo ? '#e2e8f0' : '#4b5563',
                      border: '1px solid #334155',
                    }}
                  >
                    <Film className="w-3 h-3 mr-1.5 flex-shrink-0 text-[#38bdf8]" />
                    <span className="text-[11px]">
                      {hasVideo ? videoName || 'Background video' : 'No background video'}
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

            {/* Playhead */}
            <div
              className="absolute top-0 w-[2px] bg-[#38bdf8] z-30 pointer-events-none"
              style={{ left: timeToX(currentTime), height: RULER_HEIGHT + totalRowsHeight }}
            >
              <div className="w-2.5 h-3 bg-[#38bdf8] -translate-x-[4px]" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

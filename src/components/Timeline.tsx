import React, { useRef, useState } from 'react';
import { Character, TimelineItem, VoiceItem } from '../types';
import { ZoomIn, ZoomOut, Film, MessageSquare } from 'lucide-react';
import { getSubtitleDisplayText } from '../utils/pronunciation';

interface TimelineProps {
  items: TimelineItem[];
  characters?: Character[];
  currentTime: number;
  duration: number;
  onSeek: (time: number) => void;
  onUpdateItemTime: (id: string, startTime: number) => void;
  selectedItemId?: string | null;
  onSelectItem?: (id: string) => void;
}

export const Timeline: React.FC<TimelineProps> = ({
  items,
  currentTime,
  duration,
  onSeek,
  onUpdateItemTime,
  selectedItemId,
  onSelectItem,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [draggingItemId, setDraggingItemId] = useState<string | null>(null);

  const totalDuration = Math.max(duration, 10);
  const basePixelsPerSecond = 50 * zoom;
  const timelineWidth = Math.max(totalDuration * basePixelsPerSecond, 1000);

  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (draggingItemId) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const clickX = e.clientX - rect.left + (containerRef.current?.scrollLeft || 0);
    const newTime = Math.max(0, Math.min(clickX / basePixelsPerSecond, totalDuration));
    onSeek(newTime);
  };

  const handleMouseDownItem = (e: React.MouseEvent, item: TimelineItem) => {
    e.stopPropagation();
    const startX = e.clientX;
    let isDragging = false;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!isDragging && Math.abs(moveEvent.clientX - startX) > 3) {
        isDragging = true;
        setDraggingItemId(item.id);
      }
      if (isDragging) {
        const deltaX = moveEvent.clientX - startX;
        const deltaTime = deltaX / basePixelsPerSecond;
        const newStartTime = Math.max(0, item.startTime + deltaTime);
        onUpdateItemTime(item.id, newStartTime);
      }
    };

    const handleMouseUp = () => {
      setDraggingItemId(null);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);

      // ドラッグせずにタップ・クリックした場合は、カードやYAMLの該当セクションへジャンプ
      if (!isDragging) {
        onSeek(item.startTime);
        onSelectItem?.(item.id);
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const renderRuler = () => {
    const marks = [];
    const step = zoom > 1.3 ? 1 : 2;
    for (let s = 0; s <= totalDuration; s += step) {
      const x = s * basePixelsPerSecond;
      marks.push(
        <div
          key={s}
          className="absolute top-0 bottom-0 border-l border-[#2e3134] flex flex-col justify-between pl-1.5 select-none pointer-events-none"
          style={{ left: `${x}px` }}
        >
          <span className="text-[10px] font-mono text-[#8e918f]">
            {Math.floor(s / 60)}:{(s % 60).toString().padStart(2, '0')}
          </span>
          <div className="h-1.5 w-0.5 bg-[#444746]" />
        </div>
      );
    }
    return marks;
  };

  return (
    <div className="flex flex-col bg-[#141517] border border-[#242629] rounded-sm overflow-hidden shadow-lg select-none">
      {/* Toolbar */}
      <div className="px-4 py-2 bg-[#141517] border-b border-[#222426] flex items-center justify-between">
        <div className="flex items-center gap-3 text-xs text-[#c4c7c5]">
          <span className="font-semibold text-xs font-mono uppercase tracking-wider text-[#e3e3e3]">Timeline</span>
          <span className="text-[#8e918f] font-mono text-[11px]">Duration: {totalDuration.toFixed(2)}s</span>
        </div>

        <div className="flex items-center gap-1.5 bg-[#0e0f11] px-2 py-0.5 rounded-sm border border-[#242629]">
          <button
            onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))}
            className="p-1 rounded-sm hover:bg-[#202226] text-[#8e918f] hover:text-white transition"
            title="Zoom Out"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <span className="text-[10px] font-mono text-[#c4c7c5] w-9 text-center">
            {Math.round(zoom * 100)}%
          </span>
          <button
            onClick={() => setZoom((z) => Math.min(3, z + 0.25))}
            className="p-1 rounded-sm hover:bg-[#202226] text-[#8e918f] hover:text-white transition"
            title="Zoom In"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Tracks */}
      <div className="flex">
        {/* Track Labels */}
        <div className="w-32 bg-[#111214] border-r border-[#222426] flex-shrink-0 select-none">
          <div className="h-6 border-b border-[#222426] px-3 flex items-center text-[10px] font-mono text-[#8e918f] uppercase">
            Tracks
          </div>
          <div className="h-11 border-b border-[#222426] px-3 flex items-center text-xs font-mono text-[#c4c7c5]">
            Voice/Sub
          </div>
          <div className="h-10 border-b border-[#222426] px-3 flex items-center text-xs font-mono text-[#c4c7c5]">
            Video
          </div>
        </div>

        {/* Sequence Area */}
        <div
          ref={containerRef}
          onClick={handleTimelineClick}
          className="relative flex-1 h-27 overflow-x-auto overflow-y-hidden bg-[#0a0a0c] cursor-pointer select-none"
        >
          <div style={{ width: `${timelineWidth}px` }} className="relative h-full">
            {/* Ruler */}
            <div className="h-6 w-full border-b border-[#222426] relative bg-[#111214]">
              {renderRuler()}
            </div>

            {/* Captions Track (吹き出しタップで該当カード/YAMLセクションへジャンプ) */}
            <div className="h-11 border-b border-[#222426] relative flex items-center bg-[#0a0a0c]">
              {items
                .filter((item): item is VoiceItem => item.type === 'voice')
                .map((item) => {
                  const left = item.startTime * basePixelsPerSecond;
                  const width = Math.max(item.duration * basePixelsPerSecond, 24);
                  const isDragging = draggingItemId === item.id;
                  const isSelected = selectedItemId === item.id;

                  return (
                    <div
                      key={item.id}
                      onMouseDown={(e) => handleMouseDownItem(e, item)}
                      className={`absolute h-8 rounded-xs flex items-center px-2 text-xs cursor-pointer active:cursor-grabbing transition-all select-none shadow-xs ${
                        isDragging
                          ? 'ring-2 ring-white z-20 shadow-lg'
                          : isSelected
                          ? 'ring-1 ring-[#38bdf8] bg-[#005c94] brightness-125 z-20 shadow-md'
                          : 'hover:brightness-110 z-10'
                      }`}
                      style={{
                        left: `${left}px`,
                        width: `${width}px`,
                        backgroundColor: isSelected ? '#0369a1' : '#075985',
                        color: '#f0f9ff',
                        border: isSelected ? '1px solid #38bdf8' : '1px solid #0284c7',
                      }}
                      title={`${item.text} (Click to jump to card/YAML)`}
                    >
                      <MessageSquare
                        className={`w-3 h-3 mr-1 flex-shrink-0 ${
                          isSelected ? 'text-[#38bdf8] opacity-100' : 'opacity-70'
                        }`}
                      />
                      <span className="truncate font-mono text-[11px]">{getSubtitleDisplayText(item.text)}</span>
                    </div>
                  );
                })}
            </div>

            {/* Video Track */}
            <div className="h-10 border-b border-[#222426] relative flex items-center px-2 bg-[#0a0a0c]">
              <div
                className="absolute h-7 rounded-xs flex items-center px-2 text-xs font-mono overflow-hidden whitespace-nowrap"
                style={{
                  left: 0,
                  width: `${Math.min(duration, totalDuration) * basePixelsPerSecond}px`,
                  backgroundColor: '#1f242c',
                  color: '#e2e8f0',
                  border: '1px solid #334155',
                }}
              >
                <Film className="w-3 h-3 mr-1.5 flex-shrink-0 text-[#38bdf8]" />
                <span className="text-[11px]">Video Track ({duration.toFixed(1)}s)</span>
              </div>
            </div>

            {/* Playhead */}
            <div
              className="absolute top-0 bottom-0 w-[2px] bg-[#38bdf8] z-30 pointer-events-none"
              style={{ left: `${currentTime * basePixelsPerSecond}px` }}
            >
              <div className="w-2.5 h-3 bg-[#38bdf8] rounded-none -translate-x-[4px]" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

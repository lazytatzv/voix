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
}

export const Timeline: React.FC<TimelineProps> = ({
  items,
  currentTime,
  duration,
  onSeek,
  onUpdateItemTime,
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
    setDraggingItemId(item.id);

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - e.clientX;
      const deltaTime = deltaX / basePixelsPerSecond;
      const newStartTime = Math.max(0, item.startTime + deltaTime);
      onUpdateItemTime(item.id, newStartTime);
    };

    const handleMouseUp = () => {
      setDraggingItemId(null);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
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
    <div className="flex flex-col bg-[#1e1f20] border border-[#282a2c] rounded-2xl overflow-hidden shadow-lg">
      {/* Toolbar */}
      <div className="px-5 py-2.5 bg-[#1e1f20] border-b border-[#282a2c] flex items-center justify-between">
        <div className="flex items-center gap-3 text-xs text-[#c4c7c5]">
          <span className="font-semibold text-[#e3e3e3]">Timeline</span>
          <span className="text-[#8e918f] font-mono">Duration: {totalDuration.toFixed(1)}s</span>
        </div>

        <div className="flex items-center gap-1.5 bg-[#131314] px-2 py-1 rounded-full border border-[#2e3134]">
          <button
            onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))}
            className="p-1 rounded-full hover:bg-[#282a2c] text-[#8e918f] hover:text-white transition"
            title="Zoom Out"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <span className="text-[10px] font-mono text-[#c4c7c5] w-9 text-center">
            {Math.round(zoom * 100)}%
          </span>
          <button
            onClick={() => setZoom((z) => Math.min(3, z + 0.25))}
            className="p-1 rounded-full hover:bg-[#282a2c] text-[#8e918f] hover:text-white transition"
            title="Zoom In"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Tracks */}
      <div className="flex">
        {/* Track Labels */}
        <div className="w-36 bg-[#18191b] border-r border-[#282a2c] flex-shrink-0 select-none">
          <div className="h-6 border-b border-[#282a2c] px-3 flex items-center text-[10px] font-mono text-[#8e918f]">
            TRACKS
          </div>
          <div className="h-11 border-b border-[#282a2c] px-3 flex items-center text-xs text-[#c4c7c5]">
            Captions
          </div>
          <div className="h-10 border-b border-[#282a2c] px-3 flex items-center text-xs text-[#c4c7c5]">
            Video
          </div>
        </div>

        {/* Sequence Area */}
        <div
          ref={containerRef}
          onClick={handleTimelineClick}
          className="relative flex-1 h-27 overflow-x-auto overflow-y-hidden bg-[#131314] cursor-pointer select-none"
        >
          <div style={{ width: `${timelineWidth}px` }} className="relative h-full">
            {/* Ruler */}
            <div className="h-6 w-full border-b border-[#282a2c] relative bg-[#18191b]">
              {renderRuler()}
            </div>

            {/* Captions Track */}
            <div className="h-11 border-b border-[#282a2c] relative flex items-center bg-[#131314]">
              {items
                .filter((item): item is VoiceItem => item.type === 'voice')
                .map((item) => {
                  const left = item.startTime * basePixelsPerSecond;
                  const width = Math.max(item.duration * basePixelsPerSecond, 24);
                  const isDragging = draggingItemId === item.id;

                  return (
                    <div
                      key={item.id}
                      onMouseDown={(e) => handleMouseDownItem(e, item)}
                      className={`absolute h-8 rounded-lg flex items-center px-2.5 text-xs cursor-grab active:cursor-grabbing transition-all select-none shadow-sm ${
                        isDragging
                          ? 'ring-2 ring-white z-20 shadow-lg'
                          : 'hover:brightness-110 z-10'
                      }`}
                      style={{
                        left: `${left}px`,
                        width: `${width}px`,
                        backgroundColor: '#004a77',
                        color: '#c2e7ff',
                        border: '1px solid #005c94',
                      }}
                      title={item.text}
                    >
                      <MessageSquare className="w-3 h-3 mr-1.5 flex-shrink-0 opacity-70" />
                      <span className="truncate font-medium text-[11px]">{getSubtitleDisplayText(item.text)}</span>
                    </div>
                  );
                })}
            </div>

            {/* Video Track */}
            <div className="h-10 border-b border-[#282a2c] relative flex items-center px-2 bg-[#131314]">
              <div
                className="absolute h-7 rounded-lg flex items-center px-2 text-xs font-mono overflow-hidden whitespace-nowrap"
                style={{
                  left: 0,
                  width: `${Math.min(duration, totalDuration) * basePixelsPerSecond}px`,
                  backgroundColor: '#282a2c',
                  color: '#e3e3e3',
                  border: '1px solid #3c4043',
                }}
              >
                <Film className="w-3 h-3 mr-1.5 flex-shrink-0 text-[#8ab4f8]" />
                <span className="text-[11px]">Video Track ({duration.toFixed(1)}s)</span>
              </div>
            </div>

            {/* Playhead */}
            <div
              className="absolute top-0 bottom-0 w-[2px] bg-[#8ab4f8] z-30 pointer-events-none"
              style={{ left: `${currentTime * basePixelsPerSecond}px` }}
            >
              <div className="w-2.5 h-3 bg-[#8ab4f8] rounded-b -translate-x-[4px]" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

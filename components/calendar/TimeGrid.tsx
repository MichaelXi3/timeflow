'use client';

import React, { useState, useRef, useEffect } from 'react';
import { TimeSlot, Tag } from '@/lib/types';
import { SlotBox } from './SlotBox';
import { useAppStore } from '@/lib/store';
import { dbHelpers } from '@/lib/db';
import { snapToGrid, getStartOfDay } from '@/lib/utils/date';

interface TimeGridProps {
  date: Date;
  slots: TimeSlot[];
  tags: Tag[];
  onSlotSelect: (slotId: string | null) => void;
}

export const TimeGrid: React.FC<TimeGridProps> = ({ date, slots, tags, onSlotSelect }) => {
  const gridInterval = useAppStore((state) => state.settings.gridInterval);
  const selectedSlotId = useAppStore((state) => state.selectedSlotId);
  const activeFlow = useAppStore((state) => state.activeFlow);

  const [isCreating, setIsCreating] = useState(false);
  const [createStart, setCreateStart] = useState<number | null>(null);
  const [createEnd, setCreateEnd] = useState<number | null>(null);
  const [resizingSlot, setResizingSlot] = useState<{ id: string; edge: 'top' | 'bottom' } | null>(
    null
  );
  const [dragIntent, setDragIntent] = useState<{
    slotId: string;
    startX: number;
    startY: number;
    startTime: number;
  } | null>(null);
  const [draggingSlot, setDraggingSlot] = useState<{
    id: string;
    offsetY: number;
    mouseX: number;
    mouseY: number;
  } | null>(null);
  const [dragTargetTime, setDragTargetTime] = useState<number | null>(null);
  const [createIntent, setCreateIntent] = useState<{
    startX: number;
    startY: number;
    timestamp: number;
  } | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());

  const gridRef = useRef<HTMLDivElement>(null);
  const timeLabelsRef = useRef<HTMLDivElement>(null);

  const hourHeight = 60; // pixels per hour
  const slotHeight = (hourHeight * gridInterval) / 60;
  const slotsPerDay = (24 * 60) / gridInterval;
  const dayStart = getStartOfDay(date).getTime();

  // Update current time every second (for flow tracking)
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Sync scroll between time labels and grid
  useEffect(() => {
    const grid = gridRef.current;
    const timeLabels = timeLabelsRef.current;

    if (!grid || !timeLabels) return;

    const syncScroll = () => {
      timeLabels.scrollTop = grid.scrollTop;
    };

    grid.addEventListener('scroll', syncScroll);
    return () => grid.removeEventListener('scroll', syncScroll);
  }, []);

  // Mouse position to timestamp
  const getTimestampFromY = (y: number): number => {
    const rect = gridRef.current?.getBoundingClientRect();
    if (!rect) return 0;

    const relativeY = y - rect.top + (gridRef.current?.scrollTop || 0);
    const minutes = (relativeY / hourHeight) * 60;
    const timestamp = dayStart + minutes * 60 * 1000;

    return snapToGrid(timestamp, gridInterval);
  };

  // Handle slot mouse down (prepare for potential drag or click)
  const handleSlotMouseDown = (e: React.MouseEvent, slotId: string) => {
    e.stopPropagation();

    // Check if it's a resize handle
    const target = e.target as HTMLElement;
    if (target.classList.contains('resize-handle')) return;

    // Record intent to drag, but don't start dragging yet
    setDragIntent({
      slotId,
      startX: e.clientX,
      startY: e.clientY,
      startTime: Date.now(),
    });
  };

  // Handle drag to create
  const handleMouseDown = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    // Only create on empty grid space, not on existing slots
    if (
      !target.classList.contains('day-grid-content') &&
      !target.classList.contains('day-grid-cell')
    ) {
      return;
    }

    const timestamp = getTimestampFromY(e.clientY);
    
    // Record intent to create, don't start creating yet
    setCreateIntent({
      startX: e.clientX,
      startY: e.clientY,
      timestamp,
    });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    // Check if we should start creating (moved >3px downward)
    if (createIntent && !isCreating) {
      const dy = e.clientY - createIntent.startY;

      if (dy > 3) {
        // Start creating
        setIsCreating(true);
        setCreateStart(createIntent.timestamp);
        setCreateEnd(createIntent.timestamp + gridInterval * 60 * 1000);
        setCreateIntent(null);
      }
    }

    // Check if we should start dragging slot (moved >8px from start)
    if (dragIntent && !draggingSlot) {
      const dx = e.clientX - dragIntent.startX;
      const dy = e.clientY - dragIntent.startY;
      const distance = Math.sqrt(dx * dx + dy * dy);

      // Require more movement to start drag (reduce false positives)
      if (distance > 8) {
        // Start actual dragging
        const slot = slots.find((s) => s.id === dragIntent.slotId);
        if (slot) {
          const slotStartDate = new Date(slot.start);
          const startMinutes = slotStartDate.getHours() * 60 + slotStartDate.getMinutes();
          const slotTop = (startMinutes / 60) * hourHeight;

          const rect = gridRef.current?.getBoundingClientRect();
          if (rect) {
            const scrollTop = gridRef.current?.scrollTop || 0;
            const relativeY = dragIntent.startY - rect.top + scrollTop;
            const offsetY = relativeY - slotTop;

            setDraggingSlot({
              id: dragIntent.slotId,
              offsetY,
              mouseX: e.clientX,
              mouseY: e.clientY,
            });
          }
        }
        setDragIntent(null);
      }
    }

    if (isCreating && createStart) {
      const timestamp = getTimestampFromY(e.clientY);
      if (timestamp > createStart) {
        setCreateEnd(timestamp);
      }
    }

    if (resizingSlot) {
      const timestamp = getTimestampFromY(e.clientY);
      const slot = slots.find((s) => s.id === resizingSlot.id);
      if (!slot) return;

      if (resizingSlot.edge === 'top') {
        if (timestamp < slot.end) {
          dbHelpers.updateTimeSlot(slot.id, { start: timestamp });
        }
      } else {
        if (timestamp > slot.start) {
          dbHelpers.updateTimeSlot(slot.id, { end: timestamp });
        }
      }
    }

    if (draggingSlot) {
      const timestamp = getTimestampFromY(e.clientY);
      if (timestamp !== null) {
        setDraggingSlot({
          ...draggingSlot,
          mouseX: e.clientX,
          mouseY: e.clientY,
        });
        setDragTargetTime(timestamp);
      }
    }
  };

  const handleMouseUp = async () => {
    // Handle click on slot (if no drag happened)
    if (dragIntent && !draggingSlot) {
      // Any mouseup without dragging is a click
      onSlotSelect(dragIntent.slotId);
      setDragIntent(null);
      return;
    }

    // Handle click on empty space (if no creation happened)
    if (createIntent && !isCreating) {
      // Just a click, not a drag - do nothing
      setCreateIntent(null);
      return;
    }

    if (isCreating && createStart && createEnd) {
      const newSlot = await dbHelpers.createTimeSlot({
        start: createStart,
        end: createEnd,
        tagIds: [],
        note: '',
      });
      setIsCreating(false);
      setCreateStart(null);
      setCreateEnd(null);

      // Automatically select and open edit sidebar for the new slot
      onSlotSelect(newSlot.id);
    }

    setCreateIntent(null);

    if (resizingSlot) {
      setResizingSlot(null);
    }

    if (draggingSlot && dragTargetTime !== null) {
      // Move slot to new time
      const slot = slots.find((s) => s.id === draggingSlot.id);
      if (slot) {
        const duration = slot.end - slot.start;
        const newStart = dragTargetTime;
        const newEnd = newStart + duration;

        await dbHelpers.updateTimeSlot(slot.id, {
          start: newStart,
          end: newEnd,
        });
      }
    }

    setDragIntent(null);
    setDraggingSlot(null);
    setDragTargetTime(null);
  };

  useEffect(() => {
    if (isCreating || resizingSlot || draggingSlot || dragIntent || createIntent) {
      window.addEventListener('mouseup', handleMouseUp);
      return () => window.removeEventListener('mouseup', handleMouseUp);
    }
  }, [
    isCreating,
    resizingSlot,
    draggingSlot,
    dragIntent,
    createIntent,
    createStart,
    createEnd,
    dragTargetTime,
  ]);

  // Create virtual slot for active flow
  const activeFlowSlot: TimeSlot | null = React.useMemo(() => {
    if (!activeFlow) return null;

    const now = Date.now();
    const elapsed = now - activeFlow.startTime;

    let endTime: number;
    if (activeFlow.mode === 'count-down' && activeFlow.targetDuration) {
      // For count-down, show the full target duration
      endTime = activeFlow.startTime + activeFlow.targetDuration * 60 * 1000;
    } else {
      // For count-up, round up to nearest 15-minute increment
      const minIncrement = 15 * 60 * 1000; // 15 minutes in ms
      const increments = Math.ceil(elapsed / minIncrement);
      endTime = activeFlow.startTime + Math.max(1, increments) * minIncrement;
    }

    return {
      id: '__active_flow__',
      start: activeFlow.startTime,
      end: endTime,
      tagIds: activeFlow.tagIds,
      note: activeFlow.note || '',
      energy: activeFlow.energy,
      mood: activeFlow.mood,
      version: 0,
      createdAt: activeFlow.startTime,
      updatedAt: now,
    };
  }, [activeFlow, currentTime]);

  // Filter and process slots for this day
  const processedSlots = React.useMemo(() => {
    const dayStartMs = getStartOfDay(date).getTime();
    const dayEndMs = dayStartMs + 24 * 60 * 60 * 1000;

    // Combine real slots and active flow
    const allAvailableSlots = [...slots];
    if (activeFlowSlot) {
      allAvailableSlots.push(activeFlowSlot);
    }

    // Filter for slots that intersect with this day
    return allAvailableSlots.filter((s) => s.start < dayEndMs && s.end > dayStartMs);
  }, [slots, activeFlowSlot, date]);

  // Calculate current time position if today
  const isToday = new Date().toDateString() === date.toDateString();
  const currentMinutes = isToday ? currentTime.getHours() * 60 + currentTime.getMinutes() : -1;
  const currentTimeTop = (currentMinutes / 60) * hourHeight;

  return (
    <div className="flex h-full overflow-hidden">
      {/* Grid container with synchronized scroll */}
      <div className="flex-1 flex overflow-hidden">
        {/* Time labels (scrollable) */}
        <div
          ref={timeLabelsRef}
          className="flex-shrink-0 w-16 overflow-y-auto scrollbar-hide"
          style={{
            borderRight: '1px solid rgba(184, 203, 224, 0.3)',
            boxShadow: '2px 0 10px -2px rgba(74, 140, 199, 0.08)',
          }}
        >
          <div style={{ height: `${24 * hourHeight}px` }}>
            {Array.from({ length: 24 }).map((_, hour) => (
              <div
                key={hour}
                className="text-right pr-3 text-[11px] text-gray-400 font-light relative"
                style={{ height: `${hourHeight}px` }}
              >
                <span className="absolute right-3" style={{ top: hour === 0 ? '0px' : '-8px' }}>
                  {hour === 0
                    ? '12a'
                    : hour < 12
                      ? `${hour}a`
                      : hour === 12
                        ? '12p'
                        : `${hour - 12}p`}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Grid */}
        <div
          ref={gridRef}
          className="flex-1 relative overflow-y-auto day-grid-content"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          role="grid"
          aria-label={`Time grid for ${date.toDateString()}`}
        >
          <div className="relative day-grid-cell" style={{ height: `${24 * hourHeight}px` }}>
            {/* Grid lines */}
            {Array.from({ length: slotsPerDay }).map((_, index) => (
              <div
                key={index}
                className="absolute left-0 right-0 border-t border-gray-100 day-grid-cell"
                style={{ top: `${index * slotHeight}px` }}
              />
            ))}

            {/* Hour lines (darker) */}
            {Array.from({ length: 24 }).map((_, hour) => (
              <div
                key={`hour-${hour}`}
                className="absolute left-0 right-0 border-t border-gray-300 day-grid-cell"
                style={{ top: `${hour * hourHeight}px` }}
              />
            ))}

            {/* Time slots */}
            <div className="relative">
              {processedSlots.map((slot) => {
                const isActiveFlow = slot.id === '__active_flow__';
                const isDragging = draggingSlot?.id === slot.id;
                
                // Don't render the slot normally if it's being dragged
                if (isDragging) return null;

                return (
                  <SlotBox
                    key={slot.id}
                    slot={slot}
                    tags={tags}
                    gridInterval={gridInterval}
                    isSelected={slot.id === selectedSlotId}
                    isResizing={resizingSlot?.id === slot.id}
                    onClick={() => !isActiveFlow && onSlotSelect(slot.id)}
                    onMouseDown={(e) => !isActiveFlow && handleSlotMouseDown(e, slot.id)}
                    onResizeStart={(edge) =>
                      !isActiveFlow && setResizingSlot({ id: slot.id, edge })
                    }
                    dayStart={getStartOfDay(date).getTime()}
                  />
                );
              })}
            </div>

            {/* Preview while creating */}
            {isCreating && createStart && createEnd && (
              <div
                className="absolute left-0 right-0 rounded pointer-events-none"
                style={{
                  backgroundColor: 'rgba(165, 200, 225, 0.2)',
                  border: '2px solid var(--primary)',
                  top: `${((createStart - dayStart) / (60 * 1000)) * (hourHeight / 60)}px`,
                  height: `${((createEnd - createStart) / (60 * 1000)) * (hourHeight / 60)}px`,
                  zIndex: 30,
                }}
              />
            )}

            {/* Target time indicator while dragging */}
            {draggingSlot && dragTargetTime !== null && (
              <div
                className="absolute left-0 right-0 border-2 border-dashed rounded pointer-events-none"
                style={{
                  borderColor: 'var(--primary)',
                  top: `${((dragTargetTime - dayStart) / (60 * 1000)) * (hourHeight / 60)}px`,
                  height: `${
                    ((slots.find((s) => s.id === draggingSlot.id)?.end || dragTargetTime) -
                      (slots.find((s) => s.id === draggingSlot.id)?.start || dragTargetTime)) /
                    (60 * 1000) *
                    (hourHeight / 60)
                  }px`,
                  zIndex: 40,
                  opacity: 0.5,
                }}
              />
            )}

            {/* Current time indicator */}
            {isToday && currentMinutes >= 0 && (
              <div
                className="absolute left-0 right-0 pointer-events-none"
                style={{
                  top: `${currentTimeTop}px`,
                  zIndex: 5,
                }}
              >
                <div className="relative flex items-center">
                  <div
                    className="w-2 h-2 rounded-full absolute -left-1"
                    style={{ backgroundColor: 'var(--primary)' }}
                  />
                  <div
                    className="w-full"
                    style={{
                      borderTop: '2px dashed var(--primary)',
                      opacity: 0.7,
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Floating dragged slot */}
      {draggingSlot && (() => {
        const slot = slots.find((s) => s.id === draggingSlot.id);
        if (!slot) return null;

        const rect = gridRef.current?.getBoundingClientRect();
        if (!rect) return null;

        const slotDuration = slot.end - slot.start;
        const slotHeightPx = (slotDuration / (60 * 1000)) * (hourHeight / 60);

        // Create a virtual slot at mouse position for rendering
        const virtualSlot = { ...slot };

        return (
          <div
            className="fixed pointer-events-none z-[100]"
            style={{
              left: `${rect.left}px`,
              top: `${draggingSlot.mouseY - draggingSlot.offsetY}px`,
              width: `${rect.width}px`,
              height: `${slotHeightPx}px`,
            }}
          >
            <div
              className="absolute left-0 right-0 rounded border-l-4 bg-opacity-90 p-1 text-xs overflow-hidden"
              style={{
                top: 0,
                height: `${slotHeightPx}px`,
                borderLeftColor: tags.find(t => t.id === slot.tagIds[0])?.color || '#6b7280',
                backgroundColor: `${tags.find(t => t.id === slot.tagIds[0])?.color || '#6b7280'}20`,
                boxShadow: '0 20px 60px rgba(0, 0, 0, 0.25), 0 10px 30px rgba(0, 0, 0, 0.15), 0 0 0 1px rgba(0, 0, 0, 0.05)',
              }}
            >
              <div className="text-[10px] font-semibold text-gray-700 truncate">
                {new Date(slot.start).toLocaleTimeString('en-US', {
                  hour: 'numeric',
                  minute: '2-digit',
                  hour12: true,
                })}
              </div>
              <div className="text-[10px] text-gray-600 truncate">
                {slot.tagIds.map(id => tags.find(t => t.id === id)?.name).filter(Boolean).join(', ')}
              </div>
              {slot.note && (
                <div className="text-[9px] text-gray-500 truncate mt-0.5">{slot.note}</div>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
};

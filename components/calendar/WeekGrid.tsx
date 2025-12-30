'use client';

import React, { useState, useRef, useEffect } from 'react';
import { TimeSlot, Tag } from '@/lib/types';
import { SlotBox } from './SlotBox';
import { useAppStore } from '@/lib/store';
import { dbHelpers } from '@/lib/db';
import {
  snapToGrid,
  getStartOfDay,
  getWeekDays,
  formatDateDisplay,
  addDays,
} from '@/lib/utils/date';

interface WeekGridProps {
  weekStart: Date;
  slots: TimeSlot[];
  tags: Tag[];
  onSlotSelect: (slotId: string | null) => void;
  onDayClick?: (date: Date) => void;
}

export const WeekGrid: React.FC<WeekGridProps> = ({
  weekStart,
  slots,
  tags,
  onSlotSelect,
  onDayClick,
}) => {
  const gridInterval = useAppStore((state) => state.settings.gridInterval);
  const selectedSlotId = useAppStore((state) => state.selectedSlotId);
  const activeFlow = useAppStore((state) => state.activeFlow);

  const [isCreating, setIsCreating] = useState(false);
  const [createStart, setCreateStart] = useState<number | null>(null);
  const [createEnd, setCreateEnd] = useState<number | null>(null);
  const [createDay, setCreateDay] = useState<number | null>(null); // 0-6 for Sun-Sat
  const [resizingSlot, setResizingSlot] = useState<{ id: string; edge: 'top' | 'bottom' } | null>(
    null
  );
  const [dragIntent, setDragIntent] = useState<{
    slotId: string;
    dayIndex: number;
    startX: number;
    startY: number;
    startTime: number;
  } | null>(null);
  const [draggingSlot, setDraggingSlot] = useState<{
    id: string;
    offsetY: number;
    originalDay: number;
    mouseX: number;
    mouseY: number;
  } | null>(null);
  const [dragTargetDay, setDragTargetDay] = useState<number | null>(null);
  const [dragTargetTime, setDragTargetTime] = useState<number | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());

  const gridRef = useRef<HTMLDivElement>(null);
  const timeLabelsRef = useRef<HTMLDivElement>(null);

  const hourHeight = 60; // pixels per hour
  const slotsPerDay = (24 * 60) / gridInterval;
  const slotHeight = (hourHeight * gridInterval) / 60;

  const weekDays = getWeekDays(weekStart);

  // Update current time every second (for flow tracking)
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000); // Update every second for smooth flow tracking
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

  // Auto-scroll to current time on mount
  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;

    // Calculate current time position
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinutes = now.getMinutes();
    const currentTimeInMinutes = currentHour * 60 + currentMinutes;

    // Calculate scroll position (center current time in view)
    const scrollPosition = (currentTimeInMinutes / 60) * hourHeight - grid.clientHeight / 2;

    // Scroll to position
    setTimeout(() => {
      grid.scrollTop = Math.max(0, scrollPosition);
    }, 100); // Small delay to ensure DOM is ready
  }, []); // Only run on mount

  // Mouse position to timestamp and day index
  const getTimestampAndDayFromPosition = (
    x: number,
    y: number
  ): { timestamp: number; dayIndex: number } | null => {
    const rect = gridRef.current?.getBoundingClientRect();
    if (!rect) return null;

    // Calculate which day column (0-6)
    const relativeX = x - rect.left;
    const dayWidth = rect.width / 7;
    const dayIndex = Math.floor(relativeX / dayWidth);
    if (dayIndex < 0 || dayIndex > 6) return null;

    // Calculate time within that day
    const scrollTop = gridRef.current?.scrollTop || 0;
    const relativeY = y - rect.top + scrollTop;
    const minutes = (relativeY / hourHeight) * 60;

    const dayStart = getStartOfDay(weekDays[dayIndex]).getTime();
    const timestamp = dayStart + minutes * 60 * 1000;

    return {
      timestamp: snapToGrid(timestamp, gridInterval),
      dayIndex,
    };
  };

  // Handle slot mouse down (prepare for potential drag or click)
  const handleSlotMouseDown = (e: React.MouseEvent, slotId: string, dayIndex: number) => {
    e.stopPropagation();

    // Check if it's a resize handle
    const target = e.target as HTMLElement;
    if (target.classList.contains('resize-handle')) return;

    // Record intent to drag, but don't start dragging yet
    setDragIntent({
      slotId,
      dayIndex,
      startX: e.clientX,
      startY: e.clientY,
      startTime: Date.now(),
    });
  };

  const [createIntent, setCreateIntent] = useState<{
    startX: number;
    startY: number;
    dayIndex: number;
    timestamp: number;
  } | null>(null);

  // Handle drag to create
  const handleMouseDown = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    // Only create on empty grid space, not on existing slots
    if (
      !target.classList.contains('week-grid-content') &&
      !target.classList.contains('week-grid-cell')
    ) {
      return;
    }

    const result = getTimestampAndDayFromPosition(e.clientX, e.clientY);
    if (!result) return;

    // Record intent to create, don't start creating yet
    setCreateIntent({
      startX: e.clientX,
      startY: e.clientY,
      dayIndex: result.dayIndex,
      timestamp: result.timestamp,
    });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    // Check if we should start creating (moved >3px downward)
    if (createIntent && !isCreating) {
      const dy = e.clientY - createIntent.startY;

      if (dy > 3) {
        // Start creating
        setIsCreating(true);
        setCreateDay(createIntent.dayIndex);
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
              originalDay: dragIntent.dayIndex,
              mouseX: e.clientX,
              mouseY: e.clientY,
            });
          }
        }
        setDragIntent(null);
      }
    }

    if (isCreating && createStart !== null && createDay !== null) {
      const result = getTimestampAndDayFromPosition(e.clientX, e.clientY);
      if (!result || result.dayIndex !== createDay) return;

      if (result.timestamp > createStart) {
        setCreateEnd(result.timestamp);
      }
    }

    if (resizingSlot) {
      const result = getTimestampAndDayFromPosition(e.clientX, e.clientY);
      if (!result) return;

      const slot = slots.find((s) => s.id === resizingSlot.id);
      if (!slot) return;

      if (resizingSlot.edge === 'top') {
        if (result.timestamp < slot.end) {
          dbHelpers.updateTimeSlot(slot.id, { start: result.timestamp });
        }
      } else {
        if (result.timestamp > slot.start) {
          dbHelpers.updateTimeSlot(slot.id, { end: result.timestamp });
        }
      }
    }

    if (draggingSlot) {
      const result = getTimestampAndDayFromPosition(e.clientX, e.clientY);
      if (!result) return;

      setDraggingSlot({
        ...draggingSlot,
        mouseX: e.clientX,
        mouseY: e.clientY,
      });
      setDragTargetDay(result.dayIndex);
      setDragTargetTime(result.timestamp);
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

    if (isCreating && createStart && createEnd && createDay !== null) {
      const newSlot = await dbHelpers.createTimeSlot({
        start: createStart,
        end: createEnd,
        tagIds: [],
        note: '',
      });
      setIsCreating(false);
      setCreateStart(null);
      setCreateEnd(null);
      setCreateDay(null);

      // Automatically select and open edit sidebar for the new slot
      onSlotSelect(newSlot.id);
    }

    setCreateIntent(null);

    if (resizingSlot) {
      setResizingSlot(null);
    }

    if (draggingSlot && dragTargetDay !== null && dragTargetTime !== null) {
      // Move slot to new day and time
      const slot = slots.find((s) => s.id === draggingSlot.id);
      if (slot) {
        const duration = slot.end - slot.start;

        // Use the target timestamp as new start
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
    setDragTargetDay(null);
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
    createDay,
    dragTargetDay,
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

  // Group slots by day (including active flow)
  const slotsByDay = weekDays.map((day) => {
    const dayStart = getStartOfDay(day).getTime();
    const dayEnd = dayStart + 24 * 60 * 60 * 1000;
    const daySlots = slots.filter((s) => s.start >= dayStart && s.start < dayEnd);

    // Add active flow slot if it belongs to this day
    if (activeFlowSlot && activeFlowSlot.start >= dayStart && activeFlowSlot.start < dayEnd) {
      daySlots.push(activeFlowSlot);
    }

    return daySlots;
  });

  return (
    <div className="flex h-full overflow-hidden flex-col">
      {/* Week header with days */}
      <div
        className="flex sticky top-0 z-10"
        style={{
          background: 'var(--card)',
          boxShadow: '0 4px 20px -5px rgba(74, 140, 199, 0.12)',
        }}
      >
        <div className="flex-shrink-0 w-16" /> {/* Time column spacer */}
        {weekDays.map((day, index) => {
          const isToday = new Date().toDateString() === day.toDateString();
          const isLastDay = index === weekDays.length - 1;
          return (
            <div
              key={index}
              className={`flex-1 text-center py-4 cursor-pointer transition-colors ${
                isToday ? 'bg-blue-50 bg-opacity-50' : ''
              }`}
              style={{
                borderRight: isLastDay ? 'none' : '1px solid rgba(184, 203, 224, 0.15)',
              }}
              onClick={() => onDayClick?.(day)}
            >
              <div
                className={`text-xs font-medium uppercase tracking-wide mb-1 ${
                  isToday ? 'text-blue-600' : 'text-gray-400'
                }`}
              >
                {day.toLocaleDateString('en-US', { weekday: 'short' })}
              </div>
              <div className={`text-2xl font-light ${isToday ? 'text-blue-600' : 'text-gray-900'}`}>
                {day.getDate()}
              </div>
            </div>
          );
        })}
      </div>
      {/* Decorative gradient line under header */}
      <div className="sticky top-[84px] z-10 pointer-events-none">
        <div
          style={{
            height: '1px',
            background:
              'linear-gradient(90deg, rgba(74, 140, 199, 0) 0%, rgba(74, 140, 199, 0.3) 50%, rgba(74, 140, 199, 0) 100%)',
          }}
        />
      </div>

      {/* Grid container */}
      <div className="flex flex-1 overflow-hidden">
        {/* Time labels */}
        <div
          ref={timeLabelsRef}
          className="flex-shrink-0 w-16 overflow-y-auto scrollbar-hide bg-gray-50 relative z-10"
          style={{
            boxShadow:
              '2px 0 10px -2px rgba(74, 140, 199, 0.08), 1px 0 3px rgba(74, 140, 199, 0.04)',
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

        {/* Week grid content */}
        <div
          ref={gridRef}
          className="flex-1 overflow-y-auto overflow-x-hidden week-grid-content"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          role="grid"
          aria-label={`Week view starting ${formatDateDisplay(weekStart)}`}
        >
          <div className="flex relative" style={{ height: `${24 * hourHeight}px` }}>
            {/* Day columns */}
            {weekDays.map((day, dayIndex) => {
              const dayStart = getStartOfDay(day).getTime();
              const isToday = new Date().toDateString() === day.toDateString();

              // Calculate current time position for today
              const currentMinutes = isToday
                ? currentTime.getHours() * 60 + currentTime.getMinutes()
                : -1;
              const currentTimeTop = (currentMinutes / 60) * hourHeight;

              return (
                <div
                  key={dayIndex}
                  className={`flex-1 relative border-r border-gray-100 week-grid-cell ${
                    isToday ? 'bg-blue-50 bg-opacity-20' : ''
                  }`}
                >
                  {/* Grid lines for this day */}
                  {Array.from({ length: slotsPerDay }).map((_, index) => (
                    <div
                      key={index}
                      className="absolute left-0 right-0 border-t border-gray-100 pointer-events-none"
                      style={{ top: `${index * slotHeight}px` }}
                    />
                  ))}

                  {/* Hour lines (darker) */}
                  {Array.from({ length: 24 }).map((_, hour) => (
                    <div
                      key={`hour-${hour}`}
                      className="absolute left-0 right-0 border-t border-gray-300 pointer-events-none"
                      style={{ top: `${hour * hourHeight}px` }}
                    />
                  ))}

                  {/* Time slots for this day */}
                  {slotsByDay[dayIndex].map((slot) => {
                    const dayStartMs = getStartOfDay(weekDays[dayIndex]).getTime();
                    const dayEndMs = dayStartMs + 24 * 60 * 60 * 1000;

                    // Calculate effective range for this day column
                    const effectiveStart = Math.max(slot.start, dayStartMs);
                    const effectiveEnd = Math.min(slot.end, dayEndMs);

                    const slotStartDate = new Date(effectiveStart);
                    const startMinutes = slotStartDate.getHours() * 60 + slotStartDate.getMinutes();
                    const duration = (effectiveEnd - effectiveStart) / (60 * 1000);
                    const isDragging = draggingSlot?.id === slot.id;
                    const isActiveFlow = slot.id === '__active_flow__';

                    // Hide slot in original position when dragging
                    if (isDragging) {
                      return null;
                    }

                    return (
                      <div
                        key={slot.id}
                        className={`absolute left-1 right-1 ${isActiveFlow ? '' : 'group'}`}
                        style={{
                          top: `${(startMinutes / 60) * hourHeight}px`,
                          height: `${Math.max((duration / 60) * hourHeight, 20)}px`,
                          zIndex: isActiveFlow ? 10 : isDragging ? 100 : 1,
                          transition: isActiveFlow
                            ? 'height 0.5s ease-out'
                            : resizingSlot?.id === slot.id || isDragging
                              ? 'none'
                              : 'top 0.2s cubic-bezier(0.34, 1.56, 0.64, 1), height 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)',
                          cursor: isActiveFlow ? 'default' : isDragging ? 'grabbing' : 'grab',
                        }}
                      >
                        {/* Top resize handle (not for active flow) */}
                        {!isActiveFlow && (
                          <div
                            className="resize-handle absolute top-0 left-0 right-0 h-2 cursor-ns-resize opacity-0 group-hover:opacity-100 transition-opacity z-10"
                            style={{ backgroundColor: 'rgba(74, 140, 199, 0.3)' }}
                            onMouseDown={(e) => {
                              e.stopPropagation();
                              setResizingSlot({ id: slot.id, edge: 'top' });
                            }}
                          />
                        )}

                        <div
                          className="h-full rounded border-l-4 bg-opacity-90 text-xs overflow-hidden transition-all relative"
                          style={{
                            borderLeftColor:
                              slot.tagIds.length > 0
                                ? tags.find((t) => t.id === slot.tagIds[0])?.color || '#6b7280'
                                : '#6b7280',
                            backgroundColor:
                              slot.tagIds.length > 0
                                ? `${tags.find((t) => t.id === slot.tagIds[0])?.color || '#6b7280'}20`
                                : '#6b728020',
                            boxShadow: isActiveFlow
                              ? '0 0 0 2px var(--primary), 0 4px 20px rgba(74, 140, 199, 0.3), 0 0 40px rgba(74, 140, 199, 0.2)'
                              : slot.id === selectedSlotId
                                ? '0 0 0 2px var(--primary), 0 4px 12px rgba(74, 140, 199, 0.15), 0 2px 6px rgba(74, 140, 199, 0.1)'
                                : '0 1px 3px rgba(0, 0, 0, 0.06), 0 1px 2px rgba(0, 0, 0, 0.04)',
                            padding: duration >= 30 ? '4px' : '2px',
                            cursor: isActiveFlow ? 'default' : isDragging ? 'grabbing' : 'grab',
                            animation: isActiveFlow ? 'pulse 2s ease-in-out infinite' : 'none',
                            opacity: isActiveFlow ? 0.95 : 1,
                          }}
                          onMouseEnter={(e) => {
                            if (!isActiveFlow && slot.id !== selectedSlotId && !isDragging) {
                              e.currentTarget.style.boxShadow =
                                '0 4px 12px rgba(0, 0, 0, 0.08), 0 2px 6px rgba(0, 0, 0, 0.06)';
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (!isActiveFlow && slot.id !== selectedSlotId && !isDragging) {
                              e.currentTarget.style.boxShadow =
                                '0 1px 3px rgba(0, 0, 0, 0.06), 0 1px 2px rgba(0, 0, 0, 0.04)';
                            }
                          }}
                          onMouseDown={(e) => {
                            if (isActiveFlow) return; // Don't allow dragging active flow

                            // Check if clicking on resize handle
                            const target = e.target as HTMLElement;
                            if (target.classList.contains('resize-handle')) return;

                            handleSlotMouseDown(e, slot.id, dayIndex);
                          }}
                        >
                          {/* Show different content based on duration */}
                          {duration >= 30 ? (
                            // Normal display for slots >= 30 min
                            <>
                              <div className="font-semibold text-gray-800 text-[10px] leading-tight">
                                {slotStartDate.toLocaleTimeString('en-US', {
                                  hour: 'numeric',
                                  minute: '2-digit',
                                  hour12: true,
                                })}
                              </div>
                              {slot.tagIds.length > 0 && (
                                <div className="text-gray-700 text-[10px] font-medium truncate leading-tight">
                                  {slot.tagIds
                                    .map((id) => tags.find((t) => t.id === id)?.name)
                                    .filter(Boolean)
                                    .join(', ')}
                                </div>
                              )}
                              {slot.note && duration >= 60 && (
                                <div className="text-gray-500 text-[9px] truncate mt-0.5 leading-tight">
                                  {slot.note}
                                </div>
                              )}
                            </>
                          ) : (
                            // Compact display for short slots < 30 min
                            <div className="flex items-center gap-1 h-full">
                              <span className="text-[9px] font-semibold text-gray-800 flex-shrink-0">
                                {slotStartDate.toLocaleTimeString('en-US', {
                                  hour: 'numeric',
                                  minute: '2-digit',
                                  hour12: true,
                                })}
                              </span>
                              {slot.tagIds.length > 0 && (
                                <span className="text-[9px] text-gray-700 truncate">
                                  {
                                    slot.tagIds
                                      .map((id) => tags.find((t) => t.id === id)?.name)
                                      .filter(Boolean)[0]
                                  }
                                </span>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Bottom resize handle (not for active flow) */}
                        {!isActiveFlow && (
                          <div
                            className="resize-handle absolute bottom-0 left-0 right-0 h-2 cursor-ns-resize opacity-0 group-hover:opacity-100 transition-opacity z-10"
                            style={{ backgroundColor: 'rgba(74, 140, 199, 0.3)' }}
                            onMouseDown={(e) => {
                              e.stopPropagation();
                              setResizingSlot({ id: slot.id, edge: 'bottom' });
                            }}
                          />
                        )}
                      </div>
                    );
                  })}

                  {/* Preview while creating (only for the day being created) */}
                  {isCreating && createStart && createEnd && createDay === dayIndex && (
                    <div
                      className="absolute left-1 right-1 bg-blue-200 bg-opacity-50 border-2 border-blue-400 border-dashed rounded pointer-events-none"
                      style={{
                        top: `${((createStart - dayStart) / (60 * 1000)) * (hourHeight / 60)}px`,
                        height: `${((createEnd - createStart) / (60 * 1000)) * (hourHeight / 60)}px`,
                        zIndex: 2,
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
              );
            })}
          </div>

          {/* Floating dragging slot */}
          {draggingSlot && dragTargetDay !== null && dragTargetTime !== null && (
            <div
              className="fixed pointer-events-none"
              style={{
                left: draggingSlot.mouseX - 100,
                top: draggingSlot.mouseY - 20,
                zIndex: 1000,
                width: '200px',
              }}
            >
              {(() => {
                const slot = slots.find((s) => s.id === draggingSlot.id);
                if (!slot) return null;

                const duration = (slot.end - slot.start) / (60 * 1000);
                const slotStartDate = new Date(dragTargetTime);

                return (
                  <div
                    className="rounded-lg border-l-4 text-xs"
                    style={{
                      borderLeftColor:
                        slot.tagIds.length > 0
                          ? tags.find((t) => t.id === slot.tagIds[0])?.color || '#6b7280'
                          : '#6b7280',
                      backgroundColor:
                        slot.tagIds.length > 0
                          ? `${tags.find((t) => t.id === slot.tagIds[0])?.color || '#6b7280'}F0`
                          : '#6b7280F0',
                      height: `${Math.max((duration / 60) * hourHeight, 40)}px`,
                      width: '200px',
                      padding: duration >= 30 ? '8px' : '4px',
                      boxShadow:
                        '0 10px 40px rgba(0, 0, 0, 0.2), 0 6px 20px rgba(0, 0, 0, 0.15), 0 3px 10px rgba(0, 0, 0, 0.1)',
                      opacity: 0.95,
                    }}
                  >
                    {duration >= 30 ? (
                      <>
                        <div className="font-semibold text-gray-900 text-[11px] leading-tight">
                          {slotStartDate.toLocaleTimeString('en-US', {
                            hour: 'numeric',
                            minute: '2-digit',
                            hour12: true,
                          })}
                        </div>
                        {slot.tagIds.length > 0 && (
                          <div className="text-gray-800 text-[10px] font-medium truncate leading-tight mt-0.5">
                            {slot.tagIds
                              .map((id) => tags.find((t) => t.id === id)?.name)
                              .filter(Boolean)
                              .join(', ')}
                          </div>
                        )}
                        {slot.note && duration >= 60 && (
                          <div className="text-gray-700 text-[9px] truncate mt-0.5 leading-tight">
                            {slot.note}
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="flex items-center gap-1 h-full">
                        <span className="text-[9px] font-semibold text-gray-900 flex-shrink-0">
                          {slotStartDate.toLocaleTimeString('en-US', {
                            hour: 'numeric',
                            minute: '2-digit',
                            hour12: true,
                          })}
                        </span>
                        {slot.tagIds.length > 0 && (
                          <span className="text-[9px] text-gray-800 truncate">
                            {
                              slot.tagIds
                                .map((id) => tags.find((t) => t.id === id)?.name)
                                .filter(Boolean)[0]
                            }
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

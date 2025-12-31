/**
 * Date utilities for DomainFlow
 * All TimeSlots store UTC timestamps; these helpers handle local display
 */

export function toYYYYMMDD(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function fromYYYYMMDD(dateStr: string): Date {
  return new Date(dateStr + 'T00:00:00');
}

export function getStartOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function getEndOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

export function getStartOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day; // Adjust to Sunday
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function getEndOfWeek(date: Date): Date {
  const d = getStartOfWeek(date);
  d.setDate(d.getDate() + 6);
  d.setHours(23, 59, 59, 999);
  return d;
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function formatTime(date: Date): string {
  // Use 12-hour format with AM/PM
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

export function formatDateTime(date: Date): string {
  return `${toYYYYMMDD(date)} ${formatTime(date)}`;
}

/**
 * Snap timestamp to nearest grid interval (15 or 30 min)
 */
export function snapToGrid(timestamp: number, intervalMinutes: number): number {
  const intervalMs = intervalMinutes * 60 * 1000;
  return Math.round(timestamp / intervalMs) * intervalMs;
}

/**
 * Get duration in minutes between two timestamps
 */
export function getDurationMinutes(start: number, end: number): number {
  return Math.round((end - start) / (60 * 1000));
}

/**
 * Check if a time slot crosses midnight
 * Returns array of split slots if it does, otherwise returns original slot wrapped in array
 */
export function splitCrossDaySlot(
  start: number,
  end: number
): Array<{ start: number; end: number; dayKey: string }> {
  const startDate = new Date(start);
  const endDate = new Date(end);

  const startDayKey = toYYYYMMDD(startDate);
  const endDayKey = toYYYYMMDD(endDate);

  // If same day, no split needed
  if (startDayKey === endDayKey) {
    return [{ start, end, dayKey: startDayKey }];
  }

  // Split at midnight
  const splits: Array<{ start: number; end: number; dayKey: string }> = [];
  let currentStart = start;
  let currentDate = new Date(startDate);

  while (toYYYYMMDD(currentDate) !== endDayKey) {
    const endOfDay = getEndOfDay(currentDate).getTime();
    splits.push({
      start: currentStart,
      end: endOfDay,
      dayKey: toYYYYMMDD(currentDate),
    });

    // Move to next day
    currentDate = addDays(currentDate, 1);
    currentStart = getStartOfDay(currentDate).getTime();
  }

  // Add final segment
  splits.push({
    start: currentStart,
    end,
    dayKey: endDayKey,
  });

  return splits;
}

/**
 * Get week days for week view
 */
export function getWeekDays(weekStart: Date): Date[] {
  const days: Date[] = [];
  for (let i = 0; i < 7; i++) {
    days.push(addDays(weekStart, i));
  }
  return days;
}

/**
 * Format date for display
 */
export function formatDateDisplay(date: Date): string {
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Get time grid slots for a day (e.g., 96 slots for 15min intervals)
 */
export function getTimeGridSlots(intervalMinutes: number): number {
  return (24 * 60) / intervalMinutes;
}

/**
 * Convert slot index to time string
 */
export function slotIndexToTime(index: number, intervalMinutes: number): string {
  const totalMinutes = index * intervalMinutes;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

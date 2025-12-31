import { TimeSlot, Tag, DailyLog, DomainEntity } from './types';
import { formatDateTime, toYYYYMMDD } from './utils/date';

/**
 * Export time slots to CSV format
 */
export function exportTimeSlotsToCSV(slots: TimeSlot[], tags: Tag[]): string {
  const tagMap = new Map(tags.map((t) => [t.id, t]));

  const headers = ['ID', 'Start', 'End', 'Duration (min)', 'Tags', 'Note', 'Energy', 'Mood'];
  const rows = slots.map((slot) => {
    const duration = Math.round((slot.end - slot.start) / (60 * 1000));
    const tagNames = slot.tagIds.map((id) => tagMap.get(id)?.name || id).join('; ');

    return [
      slot.id,
      formatDateTime(new Date(slot.start)),
      formatDateTime(new Date(slot.end)),
      duration.toString(),
      tagNames,
      slot.note || '',
      slot.energy?.toString() || '',
      slot.mood?.toString() || '',
    ];
  });

  const csvContent = [headers, ...rows]
    .map((row) => row.map((cell) => `"${cell}"`).join(','))
    .join('\n');

  return csvContent;
}

/**
 * Export tags to CSV format
 */
export function exportTagsToCSV(tags: Tag[], domains: DomainEntity[]): string {
  const domainMap = new Map(domains.map((d) => [d.id, d.name]));
  const headers = ['ID', 'Domain', 'Name', 'Color'];
  const rows = tags.map((tag) => [
    tag.id,
    domainMap.get(tag.domainId) || tag.domainId,
    tag.name,
    tag.color || '',
  ]);

  const csvContent = [headers, ...rows]
    .map((row) => row.map((cell) => `"${cell}"`).join(','))
    .join('\n');

  return csvContent;
}

/**
 * Export daily logs to Markdown format
 */
export function exportDailyLogsToMarkdown(logs: DailyLog[]): string {
  let content = '# DomainFlow Daily Logs\n\n';

  for (const log of logs) {
    content += `---\n\n`;
    content += log.markdown + '\n\n';
  }

  return content;
}

/**
 * Export time slots to ICS (iCalendar) format
 * Creates read-only calendar events for each time slot
 */
export function exportTimeSlotsToICS(slots: TimeSlot[], tags: Tag[]): string {
  const tagMap = new Map(tags.map((t) => [t.id, t]));

  let ics = 'BEGIN:VCALENDAR\n';
  ics += 'VERSION:2.0\n';
  ics += 'PRODID:-//DomainFlow//Time Slot Journal//EN\n';
  ics += 'CALSCALE:GREGORIAN\n';
  ics += 'METHOD:PUBLISH\n';

  for (const slot of slots) {
    const tagNames = slot.tagIds.map((id) => tagMap.get(id)?.name || id).join(', ');
    const summary = tagNames || 'Time Slot';
    const description = slot.note || '';

    ics += 'BEGIN:VEVENT\n';
    ics += `UID:${slot.id}@domainflow\n`;
    ics += `DTSTAMP:${formatICSDate(new Date())}\n`;
    ics += `DTSTART:${formatICSDate(new Date(slot.start))}\n`;
    ics += `DTEND:${formatICSDate(new Date(slot.end))}\n`;
    ics += `SUMMARY:${summary}\n`;
    if (description) {
      ics += `DESCRIPTION:${description.replace(/\n/g, '\\n')}\n`;
    }
    ics += 'END:VEVENT\n';
  }

  ics += 'END:VCALENDAR\n';
  return ics;
}

/**
 * Format date for ICS format: YYYYMMDDTHHmmssZ
 */
function formatICSDate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const hours = String(date.getUTCHours()).padStart(2, '0');
  const minutes = String(date.getUTCMinutes()).padStart(2, '0');
  const seconds = String(date.getUTCSeconds()).padStart(2, '0');
  return `${year}${month}${day}T${hours}${minutes}${seconds}Z`;
}

/**
 * Download file helper
 */
export function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Import CSV time slots
 * Returns parsed slots (without IDs, will be regenerated)
 */
export function importTimeSlotsFromCSV(
  csvContent: string,
  tags: Tag[]
): Omit<TimeSlot, 'id' | 'version' | 'createdAt' | 'updatedAt'>[] {
  const lines = csvContent.split('\n').filter((line) => line.trim());
  if (lines.length < 2) return []; // No data rows

  const tagNameMap = new Map(tags.map((t) => [t.name, t.id]));
  const slots: Omit<TimeSlot, 'id' | 'version' | 'createdAt' | 'updatedAt'>[] = [];

  // Skip header row
  for (let i = 1; i < lines.length; i++) {
    const cells = parseCSVLine(lines[i]);
    if (cells.length < 4) continue;

    const start = new Date(cells[1]).getTime();
    const end = new Date(cells[2]).getTime();
    const tagNames = cells[4] ? cells[4].split(';').map((s) => s.trim()) : [];
    const tagIds = tagNames
      .map((name) => tagNameMap.get(name))
      .filter((id): id is string => id !== undefined);

    slots.push({
      start,
      end,
      tagIds,
      note: cells[5] || undefined,
      energy: cells[6] ? parseInt(cells[6]) : undefined,
      mood: cells[7] ? parseInt(cells[7]) : undefined,
    });
  }

  return slots;
}

/**
 * Simple CSV line parser (handles quoted fields)
 */
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  result.push(current);
  return result;
}

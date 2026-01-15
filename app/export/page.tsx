'use client';

import React, { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, dbHelpers, initializeDatabase } from '@/lib/db';
import {
  exportTimeSlotsToCSV,
  exportTagsToCSV,
  exportDailyLogsToMarkdown,
  exportTimeSlotsToICS,
  downloadFile,
  importTimeSlotsFromCSV,
} from '@/lib/export';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

export default function ExportPage() {
  const [isInitialized, setIsInitialized] = useState(false);
  const [isImportDoneOpen, setIsImportDoneOpen] = useState(false);
  const [importCount, setImportCount] = useState(0);
  const [isExporting, setIsExporting] = useState(false);
  const [dateRange, setDateRange] = useState({
    start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0],
  });

  useEffect(() => {
    initializeDatabase().then(() => setIsInitialized(true));
  }, []);

  // Only load tags and domains (lightweight), NOT all timeslots
  const allTags = useLiveQuery(async () => {
    const tags = await db.tags.toArray();
    return tags.filter((tag) => !tag.deletedAt);
  }, []);
  const allDomains = useLiveQuery(async () => {
    const domains = await db.domains.toArray();
    return domains.filter((domain) => !domain.deletedAt);
  }, []);

  const handleExportSlots = async () => {
    if (!allTags || isExporting) return;
    
    setIsExporting(true);
    try {
      const startTime = new Date(dateRange.start).getTime();
      const endTime = new Date(dateRange.end).getTime() + 24 * 60 * 60 * 1000;

      // Load only the timeslots in the selected date range
      const slots = await db.timeslots
        .where('start')
        .between(startTime, endTime, true, true)
        .toArray();
      const filteredSlots = slots.filter((s) => !s.deletedAt);

      const csv = exportTimeSlotsToCSV(filteredSlots, allTags);
      downloadFile(csv, `domainflow-slots-${dateRange.start}-to-${dateRange.end}.csv`, 'text/csv');
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportTags = () => {
    if (!allTags || !allDomains || isExporting) return;
    
    setIsExporting(true);
    try {
      const csv = exportTagsToCSV(allTags, allDomains);
      downloadFile(csv, 'domainflow-tags.csv', 'text/csv');
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportLogs = async () => {
    if (isExporting) return;
    
    setIsExporting(true);
    try {
      // Load logs only when exporting
      const logs = await db.dailyLogs.toArray();
      const filteredLogs = logs.filter((log) => !log.deletedAt);
      const md = exportDailyLogsToMarkdown(filteredLogs);
      downloadFile(md, 'domainflow-logs.md', 'text/markdown');
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportICS = async () => {
    if (!allTags || isExporting) return;

    setIsExporting(true);
    try {
      const startTime = new Date(dateRange.start).getTime();
      const endTime = new Date(dateRange.end).getTime() + 24 * 60 * 60 * 1000;

      // Load only the timeslots in the selected date range
      const slots = await db.timeslots
        .where('start')
        .between(startTime, endTime, true, true)
        .toArray();
      const filteredSlots = slots.filter((s) => !s.deletedAt);

      const ics = exportTimeSlotsToICS(filteredSlots, allTags);
      downloadFile(
        ics,
        `domainflow-calendar-${dateRange.start}-to-${dateRange.end}.ics`,
        'text/calendar'
      );
    } finally {
      setIsExporting(false);
    }
  };

  const handleImportSlots = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !allTags) return;

    const text = await file.text();
    const slots = importTimeSlotsFromCSV(text, allTags);

    for (const slot of slots) {
      await dbHelpers.createTimeSlot(slot);
    }

    setImportCount(slots.length);
    setIsImportDoneOpen(true);
    e.target.value = ''; // Reset input
  };

  if (!isInitialized || !allTags || !allDomains) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-gray-500">Loading...</p>
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-4rem)] overflow-y-auto bg-gray-50">
      <div className="max-w-4xl mx-auto p-6">
        <h1 className="text-2xl font-bold mb-6">Export & Import</h1>

        {/* Date Range Selector */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">Date Range</h2>
          <div className="flex gap-4 items-center">
            <div>
              <label className="block text-sm font-medium mb-1">Start Date</label>
              <input
                type="date"
                className="border border-gray-300 rounded px-3 py-2"
                value={dateRange.start}
                onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">End Date</label>
              <input
                type="date"
                className="border border-gray-300 rounded px-3 py-2"
                value={dateRange.end}
                onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
              />
            </div>
          </div>
        </div>

        {/* Export Section */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">Export Data</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <button
              className="px-4 py-3 border border-gray-300 rounded hover:bg-gray-50 text-left disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={handleExportSlots}
              disabled={isExporting}
            >
              <div className="font-medium">
                {isExporting ? 'Exporting...' : 'Export Time Slots (CSV)'}
              </div>
              <div className="text-sm text-gray-600">Time slots in selected range</div>
            </button>

            <button
              className="px-4 py-3 border border-gray-300 rounded hover:bg-gray-50 text-left disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={handleExportTags}
              disabled={isExporting}
            >
              <div className="font-medium">
                {isExporting ? 'Exporting...' : 'Export Tags (CSV)'}
              </div>
              <div className="text-sm text-gray-600">All tags with domains and colors</div>
            </button>

            <button
              className="px-4 py-3 border border-gray-300 rounded hover:bg-gray-50 text-left disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={handleExportLogs}
              disabled={isExporting}
            >
              <div className="font-medium">
                {isExporting ? 'Exporting...' : 'Export Daily Logs (Markdown)'}
              </div>
              <div className="text-sm text-gray-600">All journal entries as one file</div>
            </button>

            <button
              className="px-4 py-3 border border-gray-300 rounded hover:bg-gray-50 text-left disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={handleExportICS}
              disabled={isExporting}
            >
              <div className="font-medium">
                {isExporting ? 'Exporting...' : 'Export Calendar (ICS)'}
              </div>
              <div className="text-sm text-gray-600">Import to Google/Apple Calendar</div>
            </button>
          </div>
        </div>

        {/* Import Section */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4">Import Data</h2>
          <div className="space-y-4">
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
              <label className="cursor-pointer">
                <input type="file" accept=".csv" className="hidden" onChange={handleImportSlots} />
                <div className="text-blue-600 font-medium mb-2">Import Time Slots (CSV)</div>
                <div className="text-sm text-gray-600">
                  Click to select a CSV file with time slots
                </div>
              </label>
            </div>

            <div className="bg-yellow-50 border border-yellow-200 rounded p-4">
              <p className="text-sm text-yellow-800">
                <strong>Note:</strong> Importing will add to existing data, not replace it. Make
                sure your CSV matches the export format.
              </p>
            </div>
          </div>
        </div>

      </div>

      {/* Import Success Dialog */}
      <ConfirmDialog
        open={isImportDoneOpen}
        onOpenChange={setIsImportDoneOpen}
        title="Import Successful"
        description={`Successfully imported ${importCount} time slots into your local database.`}
        confirmText="Got it"
        showCancel={false}
        onConfirm={() => setIsImportDoneOpen(false)}
      />
    </div>
  );
}

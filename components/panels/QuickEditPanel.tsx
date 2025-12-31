'use client';

import React, { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { TimeSlot, Tag } from '@/lib/types';
import { db, dbHelpers } from '@/lib/db';
import { useAppStore } from '@/lib/store';
import { formatTime } from '@/lib/utils/date';
import { TimeInput } from '@/components/ui/TimeInput';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import * as Dialog from '@radix-ui/react-dialog';

interface QuickEditPanelProps {
  slot: TimeSlot;
  allTags: Tag[];
  onClose: () => void;
}

export const QuickEditPanel: React.FC<QuickEditPanelProps> = ({ slot, allTags, onClose }) => {
  const { addRecentTag, recentTagIds } = useAppStore();

  const [note, setNote] = useState(slot.note || '');
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>(slot.tagIds);
  const [energy, setEnergy] = useState<number | undefined>(slot.energy);
  const [mood, setMood] = useState<number | undefined>(slot.mood);
  const [selectedDomain, setSelectedDomain] = useState<string | null>(null);
  const [tagFilter, setTagFilter] = useState('');

  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [isTagWarningOpen, setIsTagWarningOpen] = useState(false);

  // Time editing
  const [startTime, setStartTime] = useState(() => {
    const date = new Date(slot.start);
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  });
  const [endTime, setEndTime] = useState(() => {
    const date = new Date(slot.end);
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  });

  const allDomains = useLiveQuery(() => dbHelpers.getAllDomains(), []);

  // Group tags by domain ID
  const tagsByDomainId = allTags.reduce(
    (acc, tag) => {
      if (!acc[tag.domainId]) acc[tag.domainId] = [];
      acc[tag.domainId].push(tag);
      return acc;
    },
    {} as Record<string, Tag[]>
  );

  // Recent tags
  const recentTags = recentTagIds
    .map((id) => allTags.find((t) => t.id === id))
    .filter((t): t is Tag => t !== undefined)
    .slice(0, 5);

  // Filtered tags for selected domain
  const domainTags = selectedDomain
    ? (tagsByDomainId[selectedDomain] || []).filter((t) =>
        t.name.toLowerCase().includes(tagFilter.toLowerCase())
      )
    : [];

  // Auto-save function
  const autoSave = async () => {
    try {
      // Parse time inputs
      const [startHour, startMin] = startTime.split(':').map(Number);
      const [endHour, endMin] = endTime.split(':').map(Number);

      // Create new timestamps on the same date
      const slotDate = new Date(slot.start);
      const newStart = new Date(slotDate);
      newStart.setHours(startHour, startMin, 0, 0);

      const newEnd = new Date(slotDate);
      newEnd.setHours(endHour, endMin, 0, 0);

      // Validate
      if (newEnd <= newStart) {
        return; // Silently skip invalid times
      }

      await dbHelpers.updateTimeSlot(slot.id, {
        start: newStart.getTime(),
        end: newEnd.getTime(),
        note,
        tagIds: selectedTagIds,
        energy,
        mood,
      });

      // Add to recent
      selectedTagIds.forEach((id) => addRecentTag(id));
    } catch (error) {
      console.error('[DB] Auto-save failed:', error);
    }
  };

  const [isOpening, setIsOpening] = useState(true);
  const [isClosing, setIsClosing] = useState(false);

  // Auto-save when any field changes (debounced)
  useEffect(() => {
    // Don't auto-save if panel is closing
    if (isClosing) return;

    const timer = setTimeout(() => {
      autoSave();
    }, 500); // Debounce 500ms

    return () => clearTimeout(timer);
  }, [note, selectedTagIds, energy, mood, startTime, endTime, isClosing]);

  // Trigger opening animation
  useEffect(() => {
    // Small delay to ensure the panel starts off-screen
    const timer = setTimeout(() => {
      setIsOpening(false);
    }, 10);
    return () => clearTimeout(timer);
  }, []);

  const handleDelete = async () => {
    setIsDeleteConfirmOpen(true);
  };

  const handleConfirmDelete = async () => {
    await dbHelpers.deleteTimeSlot(slot.id);
    setIsClosing(true);
    // Wait for animation before closing
    setTimeout(() => {
      onClose();
    }, 250);
  };

  const handleClose = async () => {
    if (selectedTagIds.length === 0) {
      setIsTagWarningOpen(true);
      return;
    }
    
    // Save immediately before closing to prevent data loss
    await autoSave();
    
    setIsClosing(true);
    setTimeout(() => {
      onClose();
    }, 250);
  };

  const toggleTag = (tagId: string) => {
    if (selectedTagIds.includes(tagId)) {
      setSelectedTagIds(selectedTagIds.filter((id) => id !== tagId));
    } else {
      setSelectedTagIds([...selectedTagIds, tagId]);
    }
  };

  return (
    <Dialog.Root open onOpenChange={(open) => !open && handleClose()}>
      <Dialog.Portal>
        <Dialog.Overlay
          className="fixed inset-0 bg-black z-40 transition-opacity duration-300 ease-out"
          style={{
            opacity: isOpening ? 0 : isClosing ? 0 : 0.2,
          }}
        />
        <Dialog.Content
          className="fixed right-0 top-0 bottom-0 w-96 z-50 p-6 overflow-y-auto transition-all duration-300 ease-out"
          aria-describedby={undefined}
          style={{
            backgroundColor: 'var(--card)',
            borderLeft: '1px solid var(--border)',
            transform: isOpening
              ? 'translateX(100%)'
              : isClosing
                ? 'translateX(100%)'
                : 'translateX(0)',
            boxShadow: isOpening
              ? 'none'
              : isClosing
                ? 'none'
                : '0 0 50px rgba(0, 0, 0, 0.1), 0 10px 30px rgba(0, 0, 0, 0.08), 0 5px 15px rgba(0, 0, 0, 0.05)',
          }}
        >
          <Dialog.Title className="text-lg font-semibold mb-6">Edit Time Slot</Dialog.Title>

          {/* Time inputs */}
          <div className="mb-6">
            <label
              className="block text-xs font-medium mb-2"
              style={{ color: 'var(--foreground)' }}
            >
              Time
            </label>
            <div className="flex items-center gap-3">
              <TimeInput value={startTime} onChange={setStartTime} />
              <span className="text-sm font-medium" style={{ color: 'var(--muted-foreground)' }}>
                →
              </span>
              <TimeInput value={endTime} onChange={setEndTime} />
            </div>
          </div>

          {/* Note */}
          <div className="mb-5">
            <label className="block text-xs font-medium text-gray-700 mb-2">Note</label>
            <textarea
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400 transition-colors"
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="What did you do?"
            />
          </div>

          {/* Recent tags */}
          {recentTags.length > 0 && (
            <div className="mb-5">
              <label className="block text-xs font-medium text-gray-700 mb-2">Recent Tags</label>
              <div className="flex flex-wrap gap-1.5">
                {recentTags.map((tag) => (
                  <button
                    key={tag.id}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                      selectedTagIds.includes(tag.id)
                        ? 'bg-blue-500 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                    onClick={() => toggleTag(tag.id)}
                  >
                    {tag.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Domain selector */}
          <div className="mb-4">
            <label
              className="block text-xs font-medium mb-2"
              style={{ color: 'var(--foreground)' }}
            >
              Select Domain
            </label>
            <div className="grid grid-cols-3 gap-2">
              {allDomains?.map((domain) => (
                <button
                  key={domain.id}
                  className="px-3 py-2 rounded-lg text-xs font-medium transition-colors"
                  style={{
                    backgroundColor:
                      selectedDomain === domain.id ? 'var(--primary)' : 'var(--hover)',
                    color: selectedDomain === domain.id ? 'white' : 'var(--foreground)',
                  }}
                  onClick={() => setSelectedDomain(domain.id)}
                >
                  {domain.name}
                </button>
              ))}
            </div>
          </div>

          {/* Tag filter and selection */}
          {selectedDomain && (
            <div className="mb-4">
              <label className="block text-sm font-medium mb-2">
                {allDomains?.find((d) => d.id === selectedDomain)?.name} Tags
              </label>
              <input
                type="text"
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm mb-2"
                placeholder="Filter tags..."
                value={tagFilter}
                onChange={(e) => setTagFilter(e.target.value)}
              />
              <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto">
                {domainTags.map((tag) => (
                  <button
                    key={tag.id}
                    className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                      selectedTagIds.includes(tag.id)
                        ? 'bg-blue-500 text-white'
                        : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                    }`}
                    onClick={() => toggleTag(tag.id)}
                    style={{
                      borderLeft: `3px solid ${tag.color || '#6b7280'}`,
                    }}
                  >
                    {tag.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Energy */}
          <div className="mb-4">
            <label
              className="block text-xs font-medium mb-2"
              style={{ color: 'var(--foreground)' }}
            >
              Energy (1-5)
            </label>
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5].map((level) => (
                <button
                  key={level}
                  className="w-10 h-10 rounded-lg transition-all"
                  style={{
                    backgroundColor: energy === level ? 'var(--primary)' : 'var(--hover)',
                    color: energy === level ? 'white' : 'var(--muted-foreground)',
                    border: energy === level ? 'none' : '1px solid var(--border)',
                  }}
                  onClick={() => setEnergy(level)}
                >
                  {level}
                </button>
              ))}
            </div>
          </div>

          {/* Mood */}
          <div className="mb-6">
            <label
              className="block text-xs font-medium mb-2"
              style={{ color: 'var(--foreground)' }}
            >
              Mood (1-5)
            </label>
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5].map((level) => (
                <button
                  key={level}
                  className="w-10 h-10 rounded-lg transition-all"
                  style={{
                    backgroundColor: mood === level ? 'var(--primary-light)' : 'var(--hover)',
                    color: mood === level ? 'white' : 'var(--muted-foreground)',
                    border: mood === level ? 'none' : '1px solid var(--border)',
                  }}
                  onClick={() => setMood(level)}
                >
                  {level}
                </button>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="mt-6">
            <button
              className="w-full px-4 py-2.5 rounded-lg text-sm font-medium text-red-500 transition-all flex items-center justify-center gap-2"
              style={{ border: '1px solid #fecaca' }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#fef2f2';
                e.currentTarget.style.borderColor = '#fca5a5';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
                e.currentTarget.style.borderColor = '#fecaca';
              }}
              onClick={handleDelete}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                />
              </svg>
              Delete Time Slot
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>

      {/* Custom Confirmation Dialogs */}
      <ConfirmDialog
        open={isDeleteConfirmOpen}
        onOpenChange={setIsDeleteConfirmOpen}
        title="Delete Time Slot?"
        description="This action cannot be undone."
        confirmText="Delete"
        cancelText="Cancel"
        onConfirm={handleConfirmDelete}
      />

      <ConfirmDialog
        open={isTagWarningOpen}
        onOpenChange={setIsTagWarningOpen}
        title="Tag Required"
        description="Please select at least one tag. If you want to cancel, please delete the time slot."
        confirmText="OK"
        showCancel={false}
        onConfirm={() => setIsTagWarningOpen(false)}
      />
    </Dialog.Root>
  );
};

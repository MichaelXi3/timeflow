'use client';

import React, { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, dbHelpers } from '@/lib/db';
import { useAppStore } from '@/lib/store';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { motion, AnimatePresence } from 'framer-motion';

const ClockIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
    />
  </svg>
);

const TimerIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
    />
  </svg>
);

const XMarkIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
  </svg>
);

interface StartFlowPanelProps {
  onClose: () => void;
}

export const StartFlowPanel: React.FC<StartFlowPanelProps> = ({ onClose }) => {
  const { recentTagIds, addRecentTag, setActiveFlow } = useAppStore();
  const [mode, setMode] = useState<'count-up' | 'count-down'>('count-up');
  const [targetDuration, setTargetDuration] = useState(25); // default 25 min for Pomodoro
  const [note, setNote] = useState('');
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [energy, setEnergy] = useState<number | undefined>(undefined);
  const [mood, setMood] = useState<number | undefined>(undefined);
  const [selectedDomain, setSelectedDomain] = useState<string | null>(null);
  const [isClosing, setIsClosing] = useState(false);
  const [isTagWarningOpen, setIsTagWarningOpen] = useState(false);

  const allTags = useLiveQuery(async () => {
    const tags = await db.tags.toArray();
    return tags.filter((tag) => !tag.deletedAt && !tag.archivedAt);
  }, []);
  const allDomains = useLiveQuery(() => dbHelpers.getAllDomains(), []);

  // Group tags by domain ID
  const tagsByDomainId = React.useMemo(() => {
    if (!allTags) return {} as Record<string, typeof allTags>;
    return allTags.reduce(
      (acc, tag) => {
        if (!acc[tag.domainId]) acc[tag.domainId] = [];
        acc[tag.domainId].push(tag);
        return acc;
      },
      {} as Record<string, typeof allTags>
    );
  }, [allTags]);

  // Recent tags
  const recentTags = React.useMemo(() => {
    if (!allTags) return [];
    return recentTagIds
      .map((id) => allTags.find((t) => t.id === id))
      .filter(Boolean) as typeof allTags;
  }, [recentTagIds, allTags]);

  const handleTagToggle = (tagId: string) => {
    if (selectedTagIds.includes(tagId)) {
      setSelectedTagIds(selectedTagIds.filter((id) => id !== tagId));
    } else {
      setSelectedTagIds([...selectedTagIds, tagId]);
      addRecentTag(tagId);
    }
  };

  const handleStart = () => {
    // Validate: at least one tag must be selected
    if (selectedTagIds.length === 0) {
      setIsTagWarningOpen(true);
      return;
    }

    setActiveFlow({
      mode,
      startTime: Date.now(),
      targetDuration: mode === 'count-down' ? targetDuration : undefined,
      note,
      tagIds: selectedTagIds,
      energy,
      mood,
    });

    handleClose();
  };

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => {
      onClose();
    }, 200);
  };

  const presetDurations = [15, 25, 30, 45, 60, 90];

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex" key="start-flow-panel-container">
        {/* Overlay */}
        <motion.div
          key="start-flow-overlay"
          className="absolute inset-0 bg-black"
          initial={{ opacity: 0 }}
          animate={{ opacity: isClosing ? 0 : 0.3 }}
          transition={{ duration: 0.2 }}
          onClick={handleClose}
        />

        {/* Panel */}
        <motion.div
          key="start-flow-panel"
          className="relative w-[420px] h-full ml-auto flex flex-col shadow-2xl"
          style={{ background: 'var(--card)' }}
          initial={{ x: 420 }}
          animate={{ x: isClosing ? 420 : 0 }}
          transition={{ type: 'spring', stiffness: 400, damping: 35 }}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between p-6 border-b"
            style={{ borderColor: 'var(--border)' }}
          >
            <div>
              <h2 className="text-xl font-semibold" style={{ color: 'var(--foreground)' }}>
                Start Flow
              </h2>
              <p className="text-xs mt-1" style={{ color: 'var(--muted-foreground)' }}>
                Begin your focused session
              </p>
            </div>
            <button
              onClick={handleClose}
              className="p-2 rounded-lg transition-colors"
              style={{ color: 'var(--muted-foreground)' }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'var(--hover)';
                e.currentTarget.style.color = 'var(--foreground)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
                e.currentTarget.style.color = 'var(--muted-foreground)';
              }}
            >
              <XMarkIcon className="w-5 h-5" />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* Timer Mode */}
            <div>
              <label
                className="block text-sm font-medium mb-3"
                style={{ color: 'var(--foreground)' }}
              >
                Timer Mode
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setMode('count-up')}
                  className="flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all"
                  style={{
                    borderColor: mode === 'count-up' ? 'var(--primary)' : 'var(--border)',
                    backgroundColor: mode === 'count-up' ? 'var(--hover)' : 'transparent',
                  }}
                >
                  <div
                    style={{
                      color: mode === 'count-up' ? 'var(--primary)' : 'var(--muted-foreground)',
                    }}
                  >
                    <ClockIcon className="w-6 h-6" />
                  </div>
                  <span
                    className="text-sm font-medium"
                    style={{ color: mode === 'count-up' ? 'var(--primary)' : 'var(--foreground)' }}
                  >
                    Count Up
                  </span>
                  <span
                    className="text-xs text-center"
                    style={{ color: 'var(--muted-foreground)' }}
                  >
                    Open-ended focus
                  </span>
                </button>
                <button
                  onClick={() => setMode('count-down')}
                  className="flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all"
                  style={{
                    borderColor: mode === 'count-down' ? 'var(--primary)' : 'var(--border)',
                    backgroundColor: mode === 'count-down' ? 'var(--hover)' : 'transparent',
                  }}
                >
                  <div
                    style={{
                      color: mode === 'count-down' ? 'var(--primary)' : 'var(--muted-foreground)',
                    }}
                  >
                    <TimerIcon className="w-6 h-6" />
                  </div>
                  <span
                    className="text-sm font-medium"
                    style={{
                      color: mode === 'count-down' ? 'var(--primary)' : 'var(--foreground)',
                    }}
                  >
                    Count Down
                  </span>
                  <span
                    className="text-xs text-center"
                    style={{ color: 'var(--muted-foreground)' }}
                  >
                    Time-boxed session
                  </span>
                </button>
              </div>
            </div>

            {/* Duration (for count-down) */}
            {mode === 'count-down' && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
              >
                <label
                  className="block text-sm font-medium mb-3"
                  style={{ color: 'var(--foreground)' }}
                >
                  Duration (minutes)
                </label>
                <div className="grid grid-cols-3 gap-2 mb-3">
                  {presetDurations.map((duration) => (
                    <button
                      key={duration}
                      onClick={() => setTargetDuration(duration)}
                      className="px-4 py-2 rounded-lg text-sm font-medium transition-all"
                      style={{
                        backgroundColor:
                          targetDuration === duration ? 'var(--primary)' : 'var(--hover)',
                        color: targetDuration === duration ? 'white' : 'var(--foreground)',
                      }}
                    >
                      {duration}m
                    </button>
                  ))}
                </div>
                <input
                  type="number"
                  value={targetDuration}
                  onChange={(e) => setTargetDuration(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-full px-4 py-2 rounded-lg text-sm"
                  style={{
                    border: '1px solid var(--border)',
                    backgroundColor: 'var(--card)',
                    color: 'var(--foreground)',
                  }}
                  min="1"
                  max="240"
                />
              </motion.div>
            )}

            {/* Note */}
            <div>
              <label
                className="block text-sm font-medium mb-2"
                style={{ color: 'var(--foreground)' }}
              >
                Note (optional)
              </label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="What are you focusing on?"
                className="w-full px-4 py-3 rounded-lg text-sm resize-none"
                style={{
                  border: '1px solid var(--border)',
                  backgroundColor: 'var(--card)',
                  color: 'var(--foreground)',
                  minHeight: '80px',
                }}
              />
            </div>

            {/* Recent Sub-domains */}
            {recentTags.length > 0 && (
              <div>
                <label
                  className="block text-sm font-medium mb-2"
                  style={{ color: 'var(--foreground)' }}
                >
                  Recent Sub-domains
                </label>
                <div className="flex flex-wrap gap-2">
                  {recentTags.map((tag) => (
                    <button
                      key={tag.id}
                      onClick={() => handleTagToggle(tag.id)}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5"
                      style={{
                        backgroundColor: selectedTagIds.includes(tag.id)
                          ? `${tag.color}30`
                          : 'var(--hover)',
                        color: selectedTagIds.includes(tag.id) ? tag.color : 'var(--foreground)',
                        border: `1px solid ${selectedTagIds.includes(tag.id) ? tag.color : 'transparent'}`,
                      }}
                    >
                      <div className="w-2 h-2 rounded-sm" style={{ backgroundColor: tag.color }} />
                      {tag.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Domains & Tags */}
            <div>
              <label
                className="block text-sm font-medium mb-2"
                style={{ color: 'var(--foreground)' }}
              >
                Tags
              </label>
              <div className="space-y-2">
                {allDomains?.map((domain) => {
                  const domainTags = tagsByDomainId[domain.id] || [];
                  const isExpanded = selectedDomain === domain.id;

                  return (
                    <div
                      key={domain.id}
                      className="rounded-lg overflow-hidden"
                      style={{ border: '1px solid var(--border)' }}
                    >
                      <button
                        onClick={() => setSelectedDomain(isExpanded ? null : domain.id)}
                        className="w-full flex items-center justify-between px-3 py-2 transition-colors"
                        style={{ backgroundColor: isExpanded ? 'var(--hover)' : 'transparent' }}
                      >
                        <div className="flex items-center gap-2">
                          <div
                            className="w-3 h-3 rounded-sm"
                            style={{
                              background: `linear-gradient(135deg, ${domain.color}, ${domain.colorEnd})`,
                            }}
                          />
                          <span
                            className="text-sm font-medium"
                            style={{ color: 'var(--foreground)' }}
                          >
                            {domain.name}
                          </span>
                        </div>
                        <svg
                          className="w-4 h-4 transition-transform"
                          style={{
                            color: 'var(--muted-foreground)',
                            transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                          }}
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M19 9l-7 7-7-7"
                          />
                        </svg>
                      </button>

                      {isExpanded && domainTags.length > 0 && (
                        <div className="px-3 pb-2 pt-1 space-y-1">
                          {domainTags.map((tag) => (
                            <button
                              key={tag.id}
                              onClick={() => handleTagToggle(tag.id)}
                              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs transition-all"
                              style={{
                                backgroundColor: selectedTagIds.includes(tag.id)
                                  ? `${tag.color}20`
                                  : 'transparent',
                                border: selectedTagIds.includes(tag.id)
                                  ? `1px solid ${tag.color}`
                                  : '1px solid transparent',
                              }}
                            >
                              <div
                                className="w-2 h-2 rounded-sm"
                                style={{ backgroundColor: tag.color }}
                              />
                              <span style={{ color: 'var(--foreground)' }}>{tag.name}</span>
                              {selectedTagIds.includes(tag.id) && (
                                <svg
                                  className="w-3 h-3 ml-auto"
                                  style={{ color: tag.color }}
                                  fill="currentColor"
                                  viewBox="0 0 20 20"
                                >
                                  <path
                                    fillRule="evenodd"
                                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                    clipRule="evenodd"
                                  />
                                </svg>
                              )}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Energy & Mood */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label
                  className="block text-xs font-medium mb-2"
                  style={{ color: 'var(--muted-foreground)' }}
                >
                  Energy
                </label>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((level) => (
                    <button
                      key={level}
                      onClick={() => setEnergy(energy === level ? undefined : level)}
                      className="flex-1 h-8 rounded text-xs font-medium transition-all"
                      style={{
                        backgroundColor:
                          energy && energy >= level ? 'var(--primary)' : 'var(--hover)',
                        color: energy && energy >= level ? 'white' : 'var(--muted-foreground)',
                      }}
                    >
                      {level}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label
                  className="block text-xs font-medium mb-2"
                  style={{ color: 'var(--muted-foreground)' }}
                >
                  Mood
                </label>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((level) => (
                    <button
                      key={level}
                      onClick={() => setMood(mood === level ? undefined : level)}
                      className="flex-1 h-8 rounded text-xs font-medium transition-all"
                      style={{
                        backgroundColor: mood && mood >= level ? 'var(--primary)' : 'var(--hover)',
                        color: mood && mood >= level ? 'white' : 'var(--muted-foreground)',
                      }}
                    >
                      {level}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="p-6 border-t" style={{ borderColor: 'var(--border)' }}>
            {selectedTagIds.length === 0 && (
              <p className="text-xs text-center mb-3" style={{ color: 'var(--muted-foreground)' }}>
                ⚠️ Please select at least one tag
              </p>
            )}
            <button
              onClick={handleStart}
              disabled={selectedTagIds.length === 0}
              className="w-full py-3 rounded-xl text-sm font-semibold text-white transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                background:
                  selectedTagIds.length === 0
                    ? 'linear-gradient(135deg, #B0B0B0 0%, #D0D0D0 100%)'
                    : 'linear-gradient(135deg, #7BA8CC 0%, #A5C8E1 100%)',
                boxShadow: '0 2px 8px rgba(123, 168, 204, 0.2)',
              }}
              onMouseEnter={(e) => {
                if (selectedTagIds.length > 0) {
                  e.currentTarget.style.boxShadow = '0 4px 16px rgba(123, 168, 204, 0.3)';
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.boxShadow = '0 2px 8px rgba(123, 168, 204, 0.2)';
              }}
            >
              Start Flow
            </button>
          </div>
        </motion.div>
      </div>

      {/* Sub-domain Required Warning Dialog */}
      <ConfirmDialog
        open={isTagWarningOpen}
        onOpenChange={setIsTagWarningOpen}
        title="Sub-domain Required"
        description="Please select at least one sub-domain before starting your flow."
        confirmText="OK"
        showCancel={false}
        onConfirm={() => setIsTagWarningOpen(false)}
      />
    </AnimatePresence>
  );
};

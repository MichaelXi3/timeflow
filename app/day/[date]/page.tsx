'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useRouter, useParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import MarkdownIt from 'markdown-it';
import { TimeGrid } from '@/components/calendar/TimeGrid';
import { QuickEditPanel } from '@/components/panels/QuickEditPanel';
import { StartFlowPanel } from '@/components/panels/StartFlowPanel';
import { Sidebar } from '@/components/layout/Sidebar';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useAppStore } from '@/lib/store';
import { db, dbHelpers, initializeDatabase } from '@/lib/db';
import { calculateDomainStats, generateDailySummary } from '@/lib/calc';
import { getStartOfDay, getEndOfDay, addDays, toYYYYMMDD, fromYYYYMMDD } from '@/lib/utils/date';

const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
});

export default function DayPage() {
  const router = useRouter();
  const params = useParams();
  const dateStr = params.date as string;

  const {
    selectedSlotId,
    setSelectedSlotId,
    setQuickEditOpen,
    settings,
    isStartFlowOpen,
    setStartFlowOpen,
    isRightSidebarCollapsed,
    setRightSidebarCollapsed,
    isLeftSidebarOpen,
    setLeftSidebarOpen,
  } = useAppStore();

  const [isInitialized, setIsInitialized] = useState(false);
  const [markdown, setMarkdown] = useState('');
  const [isPreview, setIsPreview] = useState(false);
  const [isNavigating, setIsNavigating] = useState<{ path: string } | null>(null);

  const currentDate = fromYYYYMMDD(dateStr);

  useEffect(() => {
    initializeDatabase().then(() => setIsInitialized(true));
  }, []);

  // Load slots for this day (inclusive of cross-day slots)
  const dayStart = getStartOfDay(currentDate).getTime();
  const dayEnd = dayStart + 24 * 60 * 60 * 1000;

  const slots = useLiveQuery(async () => {
    // Query a slightly broader range to catch cross-day slots
    const buffer = 24 * 60 * 60 * 1000;
    const allSlots = await db.timeslots
      .where('start')
      .between(dayStart - buffer, dayEnd, true, true)
      .toArray();
    return allSlots.filter((slot) => !slot.deletedAt);
  }, [dayStart, dayEnd]);

  const allTags = useLiveQuery(async () => {
    const tags = await db.tags.toArray();
    return tags.filter((tag) => !tag.deletedAt);
  }, []);

  const allDomains = useLiveQuery(async () => {
    const domains = await db.domains.toArray();
    return domains.filter((domain) => !domain.deletedAt);
  }, []);

  const currentLog = useLiveQuery(() => dbHelpers.getDailyLog(dateStr), [dateStr]);

  // Check for unsaved changes
  const hasUnsavedChanges = useMemo(() => {
    const original = currentLog?.markdown || '';
    return markdown !== original;
  }, [markdown, currentLog?.markdown]);

  // Load log
  useEffect(() => {
    if (currentLog) {
      setMarkdown(currentLog.markdown);
    } else {
      setMarkdown('');
    }
  }, [currentLog]);

  // Intercept browser navigation (back button, closing tab, external links)
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = ''; // Chrome requires returnValue to be set
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges]);

  // Intercept Next.js client-side navigation
  useEffect(() => {
    const handleRouteChange = () => {
      if (hasUnsavedChanges) {
        // Block navigation by returning false
        return false;
      }
    };

    // Store navigation handler in window for Sidebar to access
    (window as any).__dayViewNavigationGuard = (path: string) => {
      if (hasUnsavedChanges) {
        setIsNavigating({ path });
        return false; // Block navigation
      }
      return true; // Allow navigation
    };

    return () => {
      delete (window as any).__dayViewNavigationGuard;
    };
  }, [hasUnsavedChanges]);

  const selectedSlot = slots?.find((s) => s.id === selectedSlotId);

  const handleSaveLog = async () => {
    await dbHelpers.upsertDailyLog(dateStr, markdown);
  };

  const handleInsertTemplate = async () => {
    if (!allTags || !slots || !allDomains) return;

    const domainStats = calculateDomainStats(slots, allTags, allDomains, settings.attributionMode);
    const summary = generateDailySummary(domainStats, dateStr, slots, allTags);

    setMarkdown((prev) => (prev ? prev + '\n\n' + summary : summary));
    setIsPreview(false); // Switch to edit mode when template is inserted
  };

  const safeNavigate = (path: string) => {
    if (hasUnsavedChanges) {
      setIsNavigating({ path });
    } else {
      router.push(path);
    }
  };

  const handleSaveAndNavigate = async () => {
    if (isNavigating) {
      await handleSaveLog();
      router.push(isNavigating.path);
      setIsNavigating(null);
    }
  };

  const handleDiscardAndNavigate = () => {
    if (isNavigating) {
      router.push(isNavigating.path);
      setIsNavigating(null);
    }
  };

  if (!isInitialized || !slots || !allTags || !allDomains) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50">
        <p className="text-sm text-gray-500">Loading...</p>
      </div>
    );
  }

  return (
    <div className="h-screen flex bg-gray-50">
      {/* Left Sidebar - hidden on small screens, visible on lg+ */}
      <div className="hidden lg:block">
        <Sidebar />
      </div>

      {/* Mobile Left Sidebar Overlay */}
      <AnimatePresence>
        {isLeftSidebarOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 bg-black/30 z-40 lg:hidden"
              onClick={() => setLeftSidebarOpen(false)}
            />
            {/* Sidebar */}
            <motion.div
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', stiffness: 400, damping: 35 }}
              className="fixed left-0 top-0 h-full z-50 lg:hidden"
            >
              <Sidebar onClose={() => setLeftSidebarOpen(false)} />
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden relative z-10">
        {/* Header */}
        <div className="bg-white border-b border-gray-100 px-4 lg:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2 lg:gap-4">
            {/* Mobile hamburger menu */}
            <button
              className="lg:hidden p-2 -ml-2 rounded-lg transition-colors hover:bg-gray-100"
              onClick={() => setLeftSidebarOpen(true)}
              title="Open menu"
            >
              <svg className="w-5 h-5" style={{ color: 'var(--foreground)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <button
              onClick={() => safeNavigate('/')}
              className="text-xs text-gray-500 hover:text-gray-700 transition-colors hidden sm:block"
            >
              ← Back to Week
            </button>
            <button
              className="text-xs text-gray-500 hover:text-gray-700 transition-colors"
              onClick={() => safeNavigate(`/day/${toYYYYMMDD(addDays(currentDate, -1))}`)}
            >
              ← Prev
            </button>
            <h2 className="text-xs lg:text-sm font-medium text-gray-900">
              {currentDate.toLocaleDateString('en-US', {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
              })}
            </h2>
            <button
              className="text-xs text-gray-500 hover:text-gray-700 transition-colors"
              onClick={() => safeNavigate(`/day/${toYYYYMMDD(addDays(currentDate, 1))}`)}
            >
              Next →
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => safeNavigate(`/day/${toYYYYMMDD(new Date())}`)}
              className="px-2 lg:px-3 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
            >
              Today
            </button>
            {/* Mobile right sidebar toggle */}
            <button
              className="md:hidden p-2 -mr-2 rounded-lg transition-colors hover:bg-gray-100"
              onClick={() => setRightSidebarCollapsed(!isRightSidebarCollapsed)}
              title={isRightSidebarCollapsed ? 'Show log' : 'Hide log'}
            >
              <svg className="w-5 h-5" style={{ color: 'var(--primary)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content: Time grid + Log editor */}
        <div className="flex-1 flex overflow-hidden">
          {/* Time Grid */}
          <div className="flex-1 bg-white overflow-hidden">
            <TimeGrid
              date={currentDate}
              slots={slots}
              tags={allTags}
              onSlotSelect={(id) => {
                setSelectedSlotId(id);
                if (id) setQuickEditOpen(true);
              }}
            />
          </div>

          {/* Log Editor - desktop version, foldable and responsive with animation */}
          <motion.div
            animate={{
              width: isRightSidebarCollapsed ? 48 : 420,
            }}
            transition={{
              type: 'spring',
              stiffness: 400,
              damping: 35,
              mass: 0.6,
            }}
            className="hidden md:flex border-l border-gray-100 bg-white overflow-hidden relative flex-col"
          >
            <AnimatePresence mode="wait">
              {!isRightSidebarCollapsed ? (
                <motion.div
                  key="log-expanded"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{
                    opacity: { duration: 0.2 },
                    x: { type: 'spring', stiffness: 400, damping: 35 },
                  }}
                  className="w-[420px] h-full flex flex-col overflow-hidden relative"
                >
                  {/* Log header */}
                  <div className="px-6 py-4 border-b border-gray-100">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <h3 className="text-sm font-semibold text-gray-900">Daily Log</h3>
                        <div className="flex bg-gray-50 p-0.5 rounded-lg border border-gray-100">
                          <button
                            onClick={() => setIsPreview(false)}
                            className={`px-2 py-0.5 text-[10px] font-medium rounded-md transition-all ${
                              !isPreview ? 'bg-white shadow-sm text-blue-600' : 'text-gray-400'
                            }`}
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => setIsPreview(true)}
                            className={`px-2 py-0.5 text-[10px] font-medium rounded-md transition-all ${
                              isPreview ? 'bg-white shadow-sm text-blue-600' : 'text-gray-400'
                            }`}
                          >
                            Preview
                          </button>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <button
                          onClick={handleInsertTemplate}
                          className="text-xs text-gray-500 hover:text-gray-700 transition-colors"
                        >
                          Insert Template
                        </button>
                        <button
                          onClick={handleSaveLog}
                          className={`text-xs font-medium transition-colors ${
                            hasUnsavedChanges
                              ? 'text-blue-600 hover:text-blue-700'
                              : 'text-gray-300'
                          }`}
                          disabled={!hasUnsavedChanges}
                        >
                          Save
                        </button>
                        
                        {/* Collapse button integrated into header */}
                        <button
                          onClick={() => setRightSidebarCollapsed(true)}
                          className="p-1 rounded-lg transition-all hover:bg-gray-100"
                          style={{ color: 'var(--muted-foreground)' }}
                          title="Collapse sidebar"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M9 5l7 7-7 7"
                            />
                          </svg>
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Editor or Preview */}
                  <div className="flex-1 overflow-y-auto">
                    {!isPreview ? (
                      <textarea
                        className="w-full h-full px-6 py-4 text-sm text-gray-700 leading-relaxed resize-none focus:outline-none font-mono"
                        value={markdown}
                        onChange={(e) => setMarkdown(e.target.value)}
                        placeholder="Write your thoughts here...&#10;&#10;Click 'Insert Template' to auto-generate daily summary from your time blocks."
                      />
                    ) : (
                      <div
                        className="prose prose-sm max-w-none px-6 py-4 overflow-y-auto markdown-preview"
                        dangerouslySetInnerHTML={{ __html: md.render(markdown || '_No content to preview_') }}
                      />
                    )}
                  </div>
                </motion.div>
              ) : (
                <motion.button
                  key="log-collapsed"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  onClick={() => setRightSidebarCollapsed(false)}
                  className="w-12 h-full flex flex-col items-center justify-center transition-colors group"
                  title="Expand sidebar"
                >
                  <div className="p-2 transition-colors">
                    <svg className="w-4 h-4" style={{ color: 'var(--muted-foreground)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15 19l-7-7 7-7"
                      />
                    </svg>
                  </div>
                  <div className="[writing-mode:vertical-lr] text-[10px] font-medium uppercase tracking-widest text-gray-400 mt-4 group-hover:text-blue-500 transition-colors">
                    Daily Log
                  </div>
                </motion.button>
              )}
            </AnimatePresence>
          </motion.div>
        </div>
      </div>

      {/* Mobile Right Sidebar (Daily Log) Overlay */}
      <AnimatePresence>
        {!isRightSidebarCollapsed && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="md:hidden fixed inset-0 z-40"
          >
            {/* Backdrop */}
            <div
              className="absolute inset-0 bg-black/30"
              onClick={() => setRightSidebarCollapsed(true)}
            />
            {/* Panel */}
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', stiffness: 400, damping: 35 }}
              className="absolute right-0 top-0 h-full w-full max-w-md bg-white shadow-xl flex flex-col"
            >
              {/* Mobile Log header */}
              <div className="px-6 py-4 border-b border-gray-100">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <h3 className="text-sm font-semibold text-gray-900">Daily Log</h3>
                    <div className="flex bg-gray-50 p-0.5 rounded-lg border border-gray-100">
                      <button
                        onClick={() => setIsPreview(false)}
                        className={`px-2 py-0.5 text-[10px] font-medium rounded-md transition-all ${
                          !isPreview ? 'bg-white shadow-sm text-blue-600' : 'text-gray-400'
                        }`}
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => setIsPreview(true)}
                        className={`px-2 py-0.5 text-[10px] font-medium rounded-md transition-all ${
                          isPreview ? 'bg-white shadow-sm text-blue-600' : 'text-gray-400'
                        }`}
                      >
                        Preview
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={handleInsertTemplate}
                      className="text-xs text-gray-500 hover:text-gray-700 transition-colors"
                    >
                      Template
                    </button>
                    <button
                      onClick={handleSaveLog}
                      className={`text-xs font-medium transition-colors ${
                        hasUnsavedChanges
                          ? 'text-blue-600 hover:text-blue-700'
                          : 'text-gray-300'
                      }`}
                      disabled={!hasUnsavedChanges}
                    >
                      Save
                    </button>
                    {/* Close button */}
                    <button
                      onClick={() => setRightSidebarCollapsed(true)}
                      className="p-2 -mr-2 rounded-lg transition-all hover:bg-gray-100"
                      style={{ color: 'var(--muted-foreground)' }}
                      title="Close"
                    >
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>

              {/* Mobile Editor or Preview */}
              <div className="flex-1 overflow-y-auto">
                {!isPreview ? (
                  <textarea
                    className="w-full h-full px-6 py-4 text-sm text-gray-700 leading-relaxed resize-none focus:outline-none font-mono"
                    value={markdown}
                    onChange={(e) => setMarkdown(e.target.value)}
                    placeholder="Write your thoughts here...&#10;&#10;Click 'Template' to auto-generate daily summary from your time blocks."
                  />
                ) : (
                  <div
                    className="prose prose-sm max-w-none px-6 py-4 overflow-y-auto markdown-preview"
                    dangerouslySetInnerHTML={{ __html: md.render(markdown || '_No content to preview_') }}
                  />
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Quick edit panel */}
      {selectedSlot && (
        <QuickEditPanel
          slot={selectedSlot}
          allTags={allTags}
          onClose={() => {
            setSelectedSlotId(null);
            setQuickEditOpen(false);
          }}
        />
      )}

      {/* Start flow panel */}
      {isStartFlowOpen && <StartFlowPanel onClose={() => setStartFlowOpen(false)} />}

      {/* Unsaved changes dialog */}
      <ConfirmDialog
        open={!!isNavigating}
        onOpenChange={(open) => !open && setIsNavigating(null)}
        title="Save Your Daily Log?"
        description="You have unsaved changes in your Daily Log. Would you like to save them before leaving?"
        confirmText="Save"
        secondaryText="Don't Save"
        cancelText="Cancel"
        showCancel={true}
        onConfirm={handleSaveAndNavigate}
        onSecondary={handleDiscardAndNavigate}
      />
    </div>
  );
}

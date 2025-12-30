'use client';

import React, { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { motion, AnimatePresence } from 'framer-motion';
import { WeekGrid } from '@/components/calendar/WeekGrid';
import { QuickEditPanel } from '@/components/panels/QuickEditPanel';
import { StartFlowPanel } from '@/components/panels/StartFlowPanel';
import { DomainSummary } from '@/components/charts/DomainSummary';
import { Sidebar } from '@/components/layout/Sidebar';
import { useAppStore } from '@/lib/store';
import { db, initializeDatabase, dbHelpers } from '@/lib/db';
import { calculateDomainStats } from '@/lib/calc';
import {
  getStartOfWeek,
  getEndOfWeek,
  addDays,
  formatDateDisplay,
  toYYYYMMDD,
} from '@/lib/utils/date';
import { useRouter } from 'next/navigation';

export default function HomePage() {
  const router = useRouter();
  const {
    selectedDate,
    setSelectedDate,
    selectedSlotId,
    setSelectedSlotId,
    setQuickEditOpen,
    isStartFlowOpen,
    setStartFlowOpen,
    settings,
    isRightSidebarCollapsed,
    setRightSidebarCollapsed,
    isLeftSidebarOpen,
    setLeftSidebarOpen,
  } = useAppStore();
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    const initialize = async () => {
      await initializeDatabase();
      // Clean up old deleted records (7+ days old)
      await dbHelpers.cleanupOldDeletedRecords();
      setIsInitialized(true);
    };
    initialize();
  }, []);

  const weekStart = getStartOfWeek(selectedDate);
  const weekEnd = getEndOfWeek(selectedDate);

  const slots = useLiveQuery(
    async () => {
      const allSlots = await db.timeslots
        .where('start')
        .between(weekStart.getTime(), weekEnd.getTime(), true, true)
        .toArray();
      // Filter out soft-deleted slots
      return allSlots.filter((slot) => !slot.deletedAt);
    },
    [weekStart, weekEnd]
  );

  const allTags = useLiveQuery(async () => {
    const tags = await db.tags.toArray();
    // Filter out soft-deleted tags
    return tags.filter((tag) => !tag.deletedAt);
  }, []);

  const allDomains = useLiveQuery(async () => {
    const domains = await db.domains.toArray();
    // Filter out soft-deleted domains
    return domains.filter((domain) => !domain.deletedAt);
  }, []);

  const domainStats = React.useMemo(() => {
    if (!slots || !allTags || !allDomains) return [];
    return calculateDomainStats(slots, allTags, allDomains, settings.attributionMode);
  }, [slots, allTags, allDomains, settings.attributionMode]);

  const selectedSlot = slots?.find((s) => s.id === selectedSlotId);

  const handleDayClick = (date: Date) => {
    setSelectedDate(date);
    router.push(`/day/${toYYYYMMDD(date)}`);
  };

  if (!isInitialized || !slots || !allTags || !allDomains) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50">
        <p className="text-sm text-gray-500">Loading...</p>
      </div>
    );
  }

  return (
    <div className="h-screen flex" style={{ background: 'var(--background)' }}>
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
        {/* Minimal header */}
        <div
          className="px-4 lg:px-6 py-3 flex items-center justify-between relative z-10"
          style={{
            background: 'var(--card)',
            boxShadow:
              '0 2px 10px -2px rgba(74, 140, 199, 0.08), 0 1px 3px rgba(74, 140, 199, 0.04)',
          }}
        >
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
              className="text-xs text-gray-500 hover:text-gray-700 transition-colors"
              onClick={() => setSelectedDate(addDays(selectedDate, -7))}
            >
              ← Prev
            </button>
            <button
              className="text-xs lg:text-sm font-medium text-gray-900 hover:text-blue-600 transition-colors"
              onClick={() => setSelectedDate(new Date())}
            >
              {formatDateDisplay(weekStart)} - {formatDateDisplay(weekEnd)}
            </button>
            <button
              className="text-xs text-gray-500 hover:text-gray-700 transition-colors"
              onClick={() => setSelectedDate(addDays(selectedDate, 7))}
            >
              Next →
            </button>
          </div>

          <div className="flex items-center gap-2 lg:gap-3">
            <button
              onClick={() => router.push('/insights')}
              className="text-xs font-medium transition-colors px-2 lg:px-3 py-1.5 rounded-lg"
              style={{ color: 'var(--primary)', backgroundColor: 'var(--hover)' }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--primary-light)')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'var(--hover)')}
            >
              Insights
            </button>
            <button
              onClick={() => setSelectedDate(new Date())}
              className="px-2 lg:px-3 py-1.5 text-xs font-medium text-white rounded-lg transition-colors"
              style={{ backgroundColor: 'var(--primary)' }}
              onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.9')}
              onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
            >
              Today
            </button>
            {/* Mobile right sidebar toggle */}
            <button
              className="md:hidden p-2 -mr-2 rounded-lg transition-colors hover:bg-gray-100"
              onClick={() => setRightSidebarCollapsed(!isRightSidebarCollapsed)}
              title={isRightSidebarCollapsed ? 'Show summary' : 'Hide summary'}
            >
              <svg className="w-5 h-5" style={{ color: 'var(--primary)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </button>
          </div>
        </div>

        {/* Top separator before week grid */}
        <div className="relative z-10">
          <div
            style={{
              height: '2px',
              background:
                'linear-gradient(180deg, rgba(74, 140, 199, 0.08) 0%, rgba(74, 140, 199, 0) 100%)',
              marginTop: '-1px',
            }}
          />
        </div>

        {/* Week grid and summary */}
        <div className="flex-1 flex overflow-hidden">
          {/* Week grid */}
          <div className="flex-1 overflow-hidden bg-white">
            <WeekGrid
              weekStart={weekStart}
              slots={slots}
              tags={allTags}
              onSlotSelect={(id) => {
                setSelectedSlotId(id);
                if (id) setQuickEditOpen(true);
              }}
              onDayClick={handleDayClick}
            />
          </div>

          {/* Right sidebar with summary - desktop version */}
          <motion.div
            animate={{
              width: isRightSidebarCollapsed ? 48 : 320,
            }}
            transition={{
              type: 'spring',
              stiffness: 400,
              damping: 35,
              mass: 0.6,
            }}
            className="hidden md:block border-l border-gray-100 bg-white overflow-hidden relative"
          >
            <AnimatePresence mode="wait">
              {!isRightSidebarCollapsed ? (
                <motion.div
                  key="content-expanded"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{
                    opacity: { duration: 0.2 },
                    x: { type: 'spring', stiffness: 400, damping: 35 },
                  }}
                  className="w-80 h-full overflow-y-auto p-6 pr-12 relative"
                >
                  {/* Collapse button */}
                  <button
                    onClick={() => setRightSidebarCollapsed(true)}
                    className="absolute top-6 right-4 p-1 rounded-lg transition-all hover:bg-gray-100 z-10"
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
                  <DomainSummary domainStats={domainStats} title="This Week" />
                </motion.div>
              ) : (
                <motion.button
                  key="content-collapsed"
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
                </motion.button>
              )}
            </AnimatePresence>
          </motion.div>
        </div>
      </div>

      {/* Mobile Right Sidebar Overlay */}
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
              className="absolute right-0 top-0 h-full w-80 bg-white shadow-xl overflow-y-auto"
            >
              {/* Close button */}
              <button
                onClick={() => setRightSidebarCollapsed(true)}
                className="absolute top-4 right-4 p-2 rounded-lg transition-all hover:bg-gray-100 z-10"
                style={{ color: 'var(--muted-foreground)' }}
                title="Close"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
              <div className="p-6 pt-16">
                <DomainSummary domainStats={domainStats} title="This Week" />
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
    </div>
  );
}

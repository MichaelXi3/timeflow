'use client';

import React, { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Sidebar } from '@/components/layout/Sidebar';
import { DateInput } from '@/components/ui/DateInput';
import { db, initializeDatabase, dbHelpers } from '@/lib/db';
import { calculateDomainStats } from '@/lib/calc';
import { useAppStore } from '@/lib/store';
import { getStartOfWeek, getEndOfWeek, addDays, toYYYYMMDD } from '@/lib/utils/date';
import {
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

export default function InsightsPage() {
  const router = useRouter();
  const { settings, isLeftSidebarOpen, setLeftSidebarOpen, sidebarWidth } = useAppStore();
  const [isInitialized, setIsInitialized] = useState(false);
  const [timeRange, setTimeRange] = useState<'week' | 'month' | 'year' | 'custom'>('week');
  const [customStartDate, setCustomStartDate] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() - 30);
    return date.toISOString().split('T')[0];
  });
  const [customEndDate, setCustomEndDate] = useState(() => {
    return new Date().toISOString().split('T')[0];
  });
  const [tempStartDate, setTempStartDate] = useState(customStartDate);
  const [tempEndDate, setTempEndDate] = useState(customEndDate);

  const applyCustomRange = () => {
    setCustomStartDate(tempStartDate);
    setCustomEndDate(tempEndDate);
  };

  useEffect(() => {
    initializeDatabase().then(() => setIsInitialized(true));
  }, []);

  // Get date range based on selection
  const getDateRange = () => {
    const now = new Date();
    let start: Date, end: Date;

    switch (timeRange) {
      case 'week':
        start = getStartOfWeek(now);
        end = getEndOfWeek(now);
        break;
      case 'month':
        start = new Date(now.getFullYear(), now.getMonth(), 1);
        end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
        break;
      case 'year':
        start = new Date(now.getFullYear(), 0, 1);
        end = new Date(now.getFullYear(), 11, 31, 23, 59, 59);
        break;
      case 'custom':
        start = new Date(customStartDate);
        end = new Date(customEndDate);
        end.setHours(23, 59, 59, 999);
        break;
    }

    return { start, end };
  };

  const { start, end } = getDateRange();

  const slots = useLiveQuery(
    async () => {
      const allSlots = await db.timeslots
        .where('start')
        .between(start.getTime(), end.getTime(), true, true)
        .toArray();
      // Filter out soft-deleted slots
      return allSlots.filter((slot) => !slot.deletedAt);
    },
    [start, end]
  );

  const allTags = useLiveQuery(async () => {
    const tags = await db.tags.toArray();
    // Filter out soft-deleted tags only (keep archived tags for statistics)
    return tags.filter((tag) => !tag.deletedAt);
  }, []);
  const allDomains = useLiveQuery(() => dbHelpers.getAllDomains(), []);

  // Create domain color map
  const domainColorMap = React.useMemo(() => {
    if (!allDomains) return {} as Record<string, string>;
    return allDomains.reduce(
      (acc, domain) => {
        acc[domain.name] = domain.color;
        return acc;
      },
      {} as Record<string, string>
    );
  }, [allDomains]);

  // Calculate domain stats
  const domainStats = React.useMemo(() => {
    if (!slots || !allTags || !allDomains) return [];
    return calculateDomainStats(slots, allTags, allDomains, settings.attributionMode);
  }, [slots, allTags, allDomains, settings.attributionMode]);

  // Prepare pie chart data
  const pieData = domainStats.map((stat) => ({
    name: stat.domain,
    value: stat.minutes,
    percentage: stat.percentage,
  }));

  // Prepare trend data (daily breakdown)
  const trendData = React.useMemo(() => {
    if (!slots || !allTags || !allDomains) return [];

    const days: { [key: string]: { [domain: string]: number } } = {};

    // Calculate days between start and end
    const daysDiff = Math.ceil((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));

    // Initialize days based on time range
    let currentDate = new Date(start);
    const dateKeys: string[] = [];

    if (timeRange === 'week' || (timeRange === 'custom' && daysDiff <= 14)) {
      // Daily for week view or custom ≤ 14 days
      while (currentDate <= end) {
        const dateKey = toYYYYMMDD(currentDate);
        days[dateKey] = {};
        dateKeys.push(dateKey);
        currentDate = addDays(currentDate, 1);
      }
    } else if (timeRange === 'month' || (timeRange === 'custom' && daysDiff <= 60)) {
      // Weekly aggregation for month view or custom 15-60 days
      let weekIndex = 1;
      while (currentDate <= end) {
        const weekKey = `W${weekIndex}`;
        days[weekKey] = {};
        dateKeys.push(weekKey);
        currentDate = addDays(currentDate, 7);
        weekIndex++;
      }
    } else {
      // Monthly for year view or custom > 60 days
      const startMonth = start.getMonth();
      const startYear = start.getFullYear();
      const endMonth = end.getMonth();
      const endYear = end.getFullYear();

      let currentYear = startYear;
      let currentMonth = startMonth;

      while (currentYear < endYear || (currentYear === endYear && currentMonth <= endMonth)) {
        const monthKey = new Date(currentYear, currentMonth, 1).toLocaleDateString('en-US', {
          month: 'short',
        });
        days[monthKey] = {};
        dateKeys.push(monthKey);

        currentMonth++;
        if (currentMonth > 11) {
          currentMonth = 0;
          currentYear++;
        }
      }
    }

    // Calculate minutes per domain per period
    slots.forEach((slot) => {
      const slotDate = new Date(slot.start);
      let periodKey: string;

      if (timeRange === 'week' || (timeRange === 'custom' && daysDiff <= 14)) {
        // Daily
        periodKey = toYYYYMMDD(slotDate);
      } else if (timeRange === 'month' || (timeRange === 'custom' && daysDiff <= 60)) {
        // Weekly
        const daysSinceStart = Math.floor(
          (slotDate.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)
        );
        const weekIndex = Math.floor(daysSinceStart / 7) + 1;
        periodKey = `W${weekIndex}`;
      } else {
        // Monthly
        periodKey = slotDate.toLocaleDateString('en-US', { month: 'short' });
      }

      if (!days[periodKey]) return;

      const duration = (slot.end - slot.start) / (60 * 1000);
      const minutesPerTag = duration / (slot.tagIds.length || 1);

      slot.tagIds.forEach((tagId) => {
        const tag = allTags.find((t) => t.id === tagId);
        if (tag) {
          const domain = allDomains.find((d) => d.id === tag.domainId);
          if (domain) {
            if (!days[periodKey][domain.name]) {
              days[periodKey][domain.name] = 0;
            }
            days[periodKey][domain.name] += minutesPerTag;
          }
        }
      });
    });

    // Convert to array format for chart
    return dateKeys.map((key) => {
      let displayLabel: string;
      if (timeRange === 'week' || (timeRange === 'custom' && daysDiff <= 14)) {
        // Display as "Dec 21"
        displayLabel = new Date(key).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
        });
      } else {
        // Display as-is (W1, W2... or Jan, Feb...)
        displayLabel = key;
      }

      return {
        date: displayLabel,
        ...days[key],
      };
    });
  }, [slots, allTags, allDomains, start, end, timeRange]);

  if (!isInitialized || !slots || !allTags) {
    return (
      <div
        className="h-screen flex items-center justify-center"
        style={{ background: 'var(--background)' }}
      >
        <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>
          Loading...
        </p>
      </div>
    );
  }

  const totalMinutes = domainStats.reduce((sum, d) => sum + d.minutes, 0);
  const totalHours = Math.floor(totalMinutes / 60);

  return (
    <div className="h-screen flex" style={{ background: 'var(--background)' }}>
      {/* Desktop Sidebar */}
      <div className="hidden lg:block" style={{ flexShrink: 0 }}>
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

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div
          className="px-4 lg:px-6 py-3 lg:py-4 flex items-center justify-between gap-2"
          style={{ background: 'var(--card)', borderBottom: '1px solid var(--border)' }}
        >
          <div className="flex items-center gap-2 lg:gap-4 min-w-0">
            {/* Mobile hamburger menu */}
            <button
              className="lg:hidden p-2 -ml-2 rounded-lg transition-colors hover:bg-gray-100 flex-shrink-0"
              onClick={() => setLeftSidebarOpen(true)}
              title="Open menu"
            >
              <svg className="w-5 h-5" style={{ color: 'var(--foreground)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>

            <div className="min-w-0">
              <h1 className="text-xl lg:text-2xl font-semibold truncate" style={{ color: 'var(--foreground)' }}>
                Insights
              </h1>
              <p className="text-sm mt-1 hidden lg:block" style={{ color: 'var(--muted-foreground)' }}>
                See where your time flows — by domains
              </p>
            </div>
          </div>

          {/* Time range selector */}
          <div className="flex gap-1 lg:gap-2 items-center flex-shrink-0">
            {(['week', 'month', 'year', 'custom'] as const).map((range) => (
              <button
                key={range}
                onClick={() => setTimeRange(range)}
                className="px-2 lg:px-4 py-1.5 lg:py-2 text-xs lg:text-sm font-medium rounded-lg transition-colors capitalize"
                style={{
                  backgroundColor: timeRange === range ? 'var(--primary)' : 'var(--hover)',
                  color: timeRange === range ? 'white' : 'var(--foreground)',
                }}
              >
                {range}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-7xl mx-auto space-y-6">
            {/* Custom Date Range Selector */}
            {timeRange === 'custom' && (
              <div
                className="p-6 rounded-xl"
                style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
              >
                <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--foreground)' }}>
                  Custom Date Range
                </h3>
                <div className="flex items-end gap-4">
                  <div className="flex-1">
                    <label
                      className="block text-xs font-medium mb-2"
                      style={{ color: 'var(--muted-foreground)' }}
                    >
                      Start Date
                    </label>
                    <DateInput value={tempStartDate} onChange={(val) => setTempStartDate(val)} />
                  </div>
                  <div className="pb-0.5">
                    <span className="text-sm" style={{ color: 'var(--muted-foreground)' }}>
                      →
                    </span>
                  </div>
                  <div className="flex-1">
                    <label
                      className="block text-xs font-medium mb-2"
                      style={{ color: 'var(--muted-foreground)' }}
                    >
                      End Date
                    </label>
                    <DateInput value={tempEndDate} onChange={(val) => setTempEndDate(val)} />
                  </div>
                  <button
                    onClick={applyCustomRange}
                    className="px-6 text-sm font-medium text-white rounded-lg transition-opacity"
                    style={{
                      backgroundColor: 'var(--primary)',
                      height: '42px',
                      minWidth: '100px',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.9')}
                    onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
                  >
                    Apply
                  </button>
                </div>
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() => {
                      const date = new Date();
                      date.setDate(date.getDate() - 7);
                      setTempStartDate(date.toISOString().split('T')[0]);
                      setTempEndDate(new Date().toISOString().split('T')[0]);
                      setCustomStartDate(date.toISOString().split('T')[0]);
                      setCustomEndDate(new Date().toISOString().split('T')[0]);
                    }}
                    className="text-xs px-3 py-1.5 rounded-md transition-colors"
                    style={{ backgroundColor: 'var(--hover)', color: 'var(--foreground)' }}
                  >
                    Last 7 days
                  </button>
                  <button
                    onClick={() => {
                      const date = new Date();
                      date.setDate(date.getDate() - 30);
                      setTempStartDate(date.toISOString().split('T')[0]);
                      setTempEndDate(new Date().toISOString().split('T')[0]);
                      setCustomStartDate(date.toISOString().split('T')[0]);
                      setCustomEndDate(new Date().toISOString().split('T')[0]);
                    }}
                    className="text-xs px-3 py-1.5 rounded-md transition-colors"
                    style={{ backgroundColor: 'var(--hover)', color: 'var(--foreground)' }}
                  >
                    Last 30 days
                  </button>
                  <button
                    onClick={() => {
                      const date = new Date();
                      date.setDate(date.getDate() - 90);
                      setTempStartDate(date.toISOString().split('T')[0]);
                      setTempEndDate(new Date().toISOString().split('T')[0]);
                      setCustomStartDate(date.toISOString().split('T')[0]);
                      setCustomEndDate(new Date().toISOString().split('T')[0]);
                    }}
                    className="text-xs px-3 py-1.5 rounded-md transition-colors"
                    style={{ backgroundColor: 'var(--hover)', color: 'var(--foreground)' }}
                  >
                    Last 90 days
                  </button>
                </div>
              </div>
            )}

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div
                className="p-6 rounded-xl"
                style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
              >
                <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>
                  Total Time
                </p>
                <p className="text-3xl font-semibold mt-2" style={{ color: 'var(--foreground)' }}>
                  {totalHours}h {Math.round(totalMinutes % 60)}m
                </p>
              </div>
              <div
                className="p-6 rounded-xl"
                style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
              >
                <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>
                  Active Domains
                </p>
                <p className="text-3xl font-semibold mt-2" style={{ color: 'var(--foreground)' }}>
                  {domainStats.length}
                </p>
              </div>
              <div
                className="p-6 rounded-xl"
                style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
              >
                <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>
                  Time Slots
                </p>
                <p className="text-3xl font-semibold mt-2" style={{ color: 'var(--foreground)' }}>
                  {slots.length}
                </p>
              </div>
            </div>

            {/* Charts Row 1 */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Pie Chart */}
              <div
                className="p-6 rounded-xl"
                style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
              >
                <h3 className="text-lg font-semibold mb-4" style={{ color: 'var(--foreground)' }}>
                  Time Distribution
                </h3>
                {pieData.length > 0 ? (
                  <div>
                    <ResponsiveContainer width="100%" height={250}>
                      <PieChart>
                        <Pie
                          data={pieData}
                          cx="50%"
                          cy="50%"
                          labelLine={false}
                          label={false}
                          outerRadius={90}
                          innerRadius={40}
                          fill="#8884d8"
                          dataKey="value"
                          paddingAngle={2}
                        >
                          {pieData.map((entry, index) => (
                            <Cell
                              key={`cell-${index}`}
                              fill={domainColorMap[entry.name] || '#4A8CC7'}
                            />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(value: number) => `${Math.round(value)}m`}
                          contentStyle={{
                            background: 'var(--card)',
                            border: '1px solid var(--border)',
                            borderRadius: '8px',
                            fontSize: '12px',
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    {/* Custom legend */}
                    <div className="grid grid-cols-2 gap-2 mt-4">
                      {pieData.map((entry, index) => (
                        <div key={entry.name} className="flex items-center gap-2">
                          <div
                            className="w-3 h-3 rounded-sm"
                            style={{ backgroundColor: domainColorMap[entry.name] || '#4A8CC7' }}
                          />
                          <span className="text-xs" style={{ color: 'var(--foreground)' }}>
                            {entry.name}
                          </span>
                          <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                            {entry.percentage.toFixed(0)}%
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-center py-20" style={{ color: 'var(--muted-foreground)' }}>
                    No data available
                  </p>
                )}
              </div>

              {/* Bar Chart - Domain Breakdown */}
              <div
                className="p-6 rounded-xl"
                style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
              >
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold" style={{ color: 'var(--foreground)' }}>
                    Domain Breakdown
                  </h3>
                  <span
                    className="text-xs px-2 py-1 rounded"
                    style={{ backgroundColor: 'var(--hover)', color: 'var(--muted-foreground)' }}
                  >
                    Unit: Hours
                  </span>
                </div>
                {domainStats.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={domainStats}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis
                        dataKey="domain"
                        tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
                        stroke="var(--border)"
                      />
                      <YAxis
                        tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
                        stroke="var(--border)"
                        label={{
                          value: 'Hours',
                          angle: -90,
                          position: 'insideLeft',
                          style: { fill: 'var(--muted-foreground)', fontSize: 12 },
                        }}
                        tickFormatter={(value) => `${(value / 60).toFixed(0)}`}
                      />
                      <Tooltip
                        formatter={(value: number) => {
                          const hours = Math.floor(value / 60);
                          const minutes = Math.round(value % 60);
                          return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
                        }}
                        contentStyle={{
                          background: 'var(--card)',
                          border: '1px solid var(--border)',
                          borderRadius: '8px',
                          fontSize: '12px',
                        }}
                      />
                      <Bar dataKey="minutes" radius={[8, 8, 0, 0]}>
                        {domainStats.map((stat, index) => (
                          <Cell
                            key={`cell-${index}`}
                            fill={domainColorMap[stat.domain] || '#4A8CC7'}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-center py-20" style={{ color: 'var(--muted-foreground)' }}>
                    No data available
                  </p>
                )}
              </div>
            </div>

            {/* Line Chart - Trend */}
            <div
              className="p-6 rounded-xl"
              style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold" style={{ color: 'var(--foreground)' }}>
                  Time Trend
                </h3>
                <span
                  className="text-xs px-2 py-1 rounded"
                  style={{ backgroundColor: 'var(--hover)', color: 'var(--muted-foreground)' }}
                >
                  Unit: Hours
                </span>
              </div>
              {trendData.length > 0 ? (
                <ResponsiveContainer width="100%" height={400}>
                  <LineChart data={trendData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis
                      dataKey="date"
                      tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
                      stroke="var(--border)"
                    />
                    <YAxis
                      tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
                      stroke="var(--border)"
                      label={{
                        value: 'Hours',
                        angle: -90,
                        position: 'insideLeft',
                        style: { fill: 'var(--muted-foreground)', fontSize: 12 },
                      }}
                      tickFormatter={(value) => `${(value / 60).toFixed(0)}`}
                    />
                    <Tooltip
                      formatter={(value: number) => {
                        const hours = Math.floor(value / 60);
                        const minutes = Math.round(value % 60);
                        return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
                      }}
                      contentStyle={{
                        background: 'var(--card)',
                        border: '1px solid var(--border)',
                        borderRadius: '8px',
                        fontSize: '12px',
                      }}
                    />
                    <Legend
                      wrapperStyle={{ color: 'var(--foreground)', fontSize: '12px' }}
                      iconType="square"
                    />
                    {domainStats.map((stat, index) => {
                      const color = domainColorMap[stat.domain] || '#4A8CC7';
                      return (
                        <Line
                          key={stat.domain}
                          type="monotone"
                          dataKey={stat.domain}
                          stroke={color}
                          strokeWidth={2.5}
                          dot={{ r: 4, fill: color }}
                          activeDot={{ r: 6 }}
                        />
                      );
                    })}
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-center py-20" style={{ color: 'var(--muted-foreground)' }}>
                  No data available
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

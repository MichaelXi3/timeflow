'use client';

import React, { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import { db, dbHelpers } from '@/lib/db';
import { Tag } from '@/lib/types';
import { useAppStore } from '@/lib/store';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import {
  signInWithGoogle,
  signOut,
  onAuthStateChange,
  getCurrentUser,
  isSupabaseConfigured,
} from '@/lib/supabaseClient';
import { migrateLocalToCloud, startSyncLoop } from '@/lib/sync';
import * as Dialog from '@radix-ui/react-dialog';

// Simple icon components
const PlusIcon = ({ className, style }: { className?: string; style?: React.CSSProperties }) => (
  <svg className={className} style={style} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
  </svg>
);

const XMarkIcon = ({ className, style }: { className?: string; style?: React.CSSProperties }) => (
  <svg className={className} style={style} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
  </svg>
);

const Cog6ToothIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
    />
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
    />
  </svg>
);

const PencilIcon = ({ className, style }: { className?: string; style?: React.CSSProperties }) => (
  <svg className={className} style={style} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
    />
  </svg>
);

const TrashIcon = ({ className, style }: { className?: string; style?: React.CSSProperties }) => (
  <svg className={className} style={style} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
    />
  </svg>
);

const ArchiveBoxIcon = ({ className, style }: { className?: string; style?: React.CSSProperties }) => (
  <svg className={className} style={style} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m8.25 3v6.75m0 0l-3-3m3 3l3-3M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z"
    />
  </svg>
);

const PlayIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="currentColor" viewBox="0 0 24 24">
    <path d="M8 5v14l11-7z" />
  </svg>
);

const StopIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="currentColor" viewBox="0 0 24 24">
    <rect x="6" y="6" width="12" height="12" rx="2" />
  </svg>
);

interface SidebarProps {
  onClose?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ onClose }) => {
  const router = useRouter();
  const { activeFlow, setActiveFlow, setStartFlowOpen, userId, setUserId, sidebarWidth, setSidebarWidth } = useAppStore();

  // Safe navigation that checks for unsaved changes
  const safeNavigate = (path: string) => {
    // Check if Day View has unsaved changes
    const navigationGuard = (window as any).__dayViewNavigationGuard;
    if (navigationGuard && !navigationGuard(path)) {
      // Navigation blocked by Day View
      return;
    }
    // Proceed with navigation
    router.push(path);
    // Close mobile sidebar after navigation
    onClose?.();
  };
  const [selectedDomain, setSelectedDomain] = useState<string | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isAddDomainOpen, setIsAddDomainOpen] = useState(false);
  const [isStopConfirmOpen, setIsStopConfirmOpen] = useState(false);
  const [isDeleteTagConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [tagToDelete, setTagToDelete] = useState<string | null>(null);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [confirmTitle, setConfirmTitle] = useState('');
  const [confirmMessage, setConfirmMessage] = useState('');
  const [confirmAction, setConfirmAction] = useState<(() => void) | null>(null);
  const [errorTitle, setErrorTitle] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isErrorOpen, setIsErrorOpen] = useState(false);
  const [isCompletionConfirmOpen, setIsCompletionConfirmOpen] = useState(false);
  const [newDomainName, setNewDomainName] = useState('');
  const [newDomainColor, setNewDomainColor] = useState('#4A8CC7');
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState('#6b7280');
  const [editingTagId, setEditingTagId] = useState<string | null>(null);
  const [editTagName, setEditTagName] = useState('');
  const [editTagColor, setEditTagColor] = useState('#6b7280');
  const [editingDomainId, setEditingDomainId] = useState<string | null>(null);
  const [editDomainName, setEditDomainName] = useState('');
  const [editDomainColor, setEditDomainColor] = useState('#4A8CC7');
  const [currentTime, setCurrentTime] = useState(Date.now());
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isResizing, setIsResizing] = useState(false);

  const allTags = useLiveQuery(async () => {
    const tags = await db.tags.toArray();
    return tags.filter((tag) => !tag.deletedAt && !tag.archivedAt);
  }, []);
  const allDomains = useLiveQuery(() => dbHelpers.getAllDomains(), []);

  // Update current time every second for flow tracking
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Auth state listener
  useEffect(() => {
    if (!isSupabaseConfigured()) return;

    // Check current user on mount
    getCurrentUser().then((user) => {
      if (user) {
        setUserId(user.id);
        setUserEmail(user.email || null);
      }
    });

    // Listen to auth changes
    const unsubscribe = onAuthStateChange(async (newUserId) => {
      setUserId(newUserId);

      if (newUserId) {
        const user = await getCurrentUser();
        setUserEmail(user?.email || null);

        // Clear any existing sync cursor to force a full pull
        await db.syncState.delete('sync_cursor');

        // Migrate local data to cloud
        setIsSyncing(true);
        try {
          const result = await migrateLocalToCloud(newUserId);
          if (result.migrated > 0) {
            console.log(`[Auth] Migrated ${result.migrated} local items to cloud`);
          }
        } catch (error) {
          console.error('[Auth] Migration error:', error);
        } finally {
          setIsSyncing(false);
        }
      } else {
        setUserEmail(null);
      }
    });

    return unsubscribe;
  }, [setUserId]);

  // Start sync loop when authenticated
  useEffect(() => {
    if (!userId || !isSupabaseConfigured()) return;

    const stopSync = startSyncLoop(30000); // Sync every 30 seconds
    return stopSync;
  }, [userId]);

  // Handle sidebar resize
  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const minWidth = 200; // Minimum width in pixels
      const maxWidth = 480; // Maximum width in pixels
      const newWidth = Math.max(minWidth, Math.min(maxWidth, e.clientX));
      setSidebarWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, setSidebarWidth]);

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

  const handleAddTag = async () => {
    if (!selectedDomain || !newTagName.trim()) return;

    try {
      await dbHelpers.createTag({
        domainId: selectedDomain,
        name: newTagName.trim(),
        color: newTagColor,
      });

      // Only clear the input, keep domain expanded
      setNewTagName('');
      // Reset color to domain color for next tag
      const currentDomain = allDomains?.find((d) => d.name === selectedDomain);
      if (currentDomain) {
        setNewTagColor(currentDomain.color);
      }
    } catch (error) {
      // Tag already exists
      setErrorTitle('Failed to create tag');
      setErrorMessage(error instanceof Error ? error.message : 'Unknown error occurred');
      setIsErrorOpen(true);
      setNewTagName('');
    }
  };

  const handleDeleteTag = async (tagId: string) => {
    setTagToDelete(tagId);
    setIsDeleteConfirmOpen(true);
  };

  const handleConfirmDeleteTag = async () => {
    if (tagToDelete) {
      await dbHelpers.deleteTag(tagToDelete);
      setTagToDelete(null);
    }
  };

  const handleStartEditTag = (tag: Tag) => {
    setEditingTagId(tag.id);
    setEditTagName(tag.name);
    setEditTagColor(tag.color || '#6b7280');
  };

  const handleSaveEditTag = async () => {
    if (!editingTagId || !editTagName.trim()) return;

    try {
      // Simple atomic update - no cascade needed!
      await dbHelpers.updateTag(editingTagId, {
        name: editTagName.trim(),
        color: editTagColor,
      });

      setEditingTagId(null);
      setEditTagName('');
      setEditTagColor('#6b7280');
    } catch (error) {
      setErrorTitle('Failed to update tag');
      setErrorMessage(error instanceof Error ? error.message : 'Unknown error occurred');
      setIsErrorOpen(true);
    }
  };

  const handleEditDomain = (domainId: string) => {
    const domain = allDomains?.find((d) => d.id === domainId);
    if (!domain) return;
    setEditingDomainId(domainId);
    setEditDomainName(domain.name);
    setEditDomainColor(domain.color);
  };

  const handleSaveEditDomain = async () => {
    if (!editingDomainId || !editDomainName.trim()) return;

    try {
      // Simple atomic update - no cascade needed!
      await dbHelpers.updateDomain(editingDomainId, {
        name: editDomainName.trim(),
        color: editDomainColor,
        colorEnd: lightenColor(editDomainColor, 20),
      });

      setEditingDomainId(null);
      setEditDomainName('');
      setEditDomainColor('#4A8CC7');
    } catch (error) {
      setErrorTitle('Failed to update domain');
      setErrorMessage(error instanceof Error ? error.message : 'Unknown error occurred');
      setIsErrorOpen(true);
    }
  };

  const handleDeleteDomain = async (domainId: string) => {
    const domain = allDomains?.find((d) => d.id === domainId);
    if (!domain) return;

    setConfirmTitle('Delete Domain');
    setConfirmMessage(
      `Are you sure you want to delete "${domain.name}"? All tags under this domain will also be deleted.`
    );
    setConfirmAction(() => async () => {
      try {
        await dbHelpers.deleteDomain(domainId);
        setIsConfirmOpen(false);
      } catch (error) {
        setIsConfirmOpen(false);
        setErrorTitle('Failed to delete domain');
        setErrorMessage(error instanceof Error ? error.message : 'Unknown error occurred');
        setIsErrorOpen(true);
      }
    });
    setIsConfirmOpen(true);
  };

  const handleArchiveDomain = async (domainId: string) => {
    const domain = allDomains?.find((d) => d.id === domainId);
    if (!domain) return;

    setConfirmTitle('Archive Domain');
    setConfirmMessage(
      `Archive "${domain.name}"? All sub-domains (tags) will also be archived. Time slots will be preserved.`
    );
    setConfirmAction(() => async () => {
      try {
        await dbHelpers.archiveDomain(domainId);
        setIsConfirmOpen(false);
      } catch (error) {
        setIsConfirmOpen(false);
        setErrorTitle('Failed to archive domain');
        setErrorMessage(error instanceof Error ? error.message : 'Unknown error occurred');
        setIsErrorOpen(true);
      }
    });
    setIsConfirmOpen(true);
  };

  const handleArchiveTag = async (tagId: string) => {
    const tag = allTags?.find((t) => t.id === tagId);
    if (!tag) return;

    setConfirmTitle('Archive Sub-domain');
    setConfirmMessage(
      `Archive "${tag.name}"? Time slots will be preserved and you can unarchive it later.`
    );
    setConfirmAction(() => async () => {
      try {
        await dbHelpers.archiveTag(tagId);
        setIsConfirmOpen(false);
      } catch (error) {
        setIsConfirmOpen(false);
        setErrorTitle('Failed to archive sub-domain');
        setErrorMessage(error instanceof Error ? error.message : 'Unknown error occurred');
        setIsErrorOpen(true);
      }
    });
    setIsConfirmOpen(true);
  };

  const handleAddDomain = async () => {
    if (!newDomainName.trim()) return;

    try {
      // Generate gradient end color (lighter version)
      const colorEnd = lightenColor(newDomainColor, 20);

      const maxOrder = allDomains?.reduce((max, d) => Math.max(max, d.order), 0) || 0;

      await dbHelpers.createDomain({
        name: newDomainName.trim(),
        color: newDomainColor,
        colorEnd,
        order: maxOrder + 1,
      });

      setNewDomainName('');
      setNewDomainColor('#4A8CC7');
      setIsAddDomainOpen(false);
    } catch (error) {
      setErrorTitle('Failed to create domain');
      setErrorMessage(error instanceof Error ? error.message : 'Unknown error occurred');
      setIsErrorOpen(true);
    }
  };

  // Helper function to lighten color
  const lightenColor = (hex: string, percent: number) => {
    const num = parseInt(hex.replace('#', ''), 16);
    const r = Math.min(255, Math.floor((num >> 16) + ((255 - (num >> 16)) * percent) / 100));
    const g = Math.min(
      255,
      Math.floor(((num >> 8) & 0x00ff) + ((255 - ((num >> 8) & 0x00ff)) * percent) / 100)
    );
    const b = Math.min(
      255,
      Math.floor((num & 0x0000ff) + ((255 - (num & 0x0000ff)) * percent) / 100)
    );
    return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
  };

  // Round duration to avoid tiny time blocks
  const roundDuration = (minutes: number): number => {
    // Less than 1 minute: discard (accidental touch)
    if (minutes < 1) return 0;

    // 1-15 minutes: round up to 15
    if (minutes < 15) return 15;

    // 15-30 minutes: round up to 30
    if (minutes < 30) return 30;

    // Above 30 minutes: round up to nearest 30
    return Math.ceil(minutes / 30) * 30;
  };

  // Handle stop flow button click
  const handleStopFlowClick = () => {
    setIsStopConfirmOpen(true);
  };

  // Handle confirmed stop
  const handleConfirmStop = async () => {
    if (!activeFlow) return;

    const endTime = Date.now();
    const actualDuration = (endTime - activeFlow.startTime) / (60 * 1000); // minutes
    const roundedDuration = roundDuration(actualDuration);

    // Discard if less than 1 minute (accidental touch)
    if (roundedDuration === 0) {
      setActiveFlow(null);
      return;
    }

    // Calculate adjusted end time based on rounded duration
    const adjustedEndTime = activeFlow.startTime + roundedDuration * 60 * 1000;

    // Save the time slot with rounded duration
    await dbHelpers.createTimeSlot({
      start: activeFlow.startTime,
      end: adjustedEndTime,
      tagIds: activeFlow.tagIds,
      note: activeFlow.note || '',
      energy: activeFlow.energy,
      mood: activeFlow.mood,
    });

    // Clear active flow with fade animation
    setActiveFlow(null);
    setIsCompletionConfirmOpen(false);
  };

  // Format time for display
  const formatDuration = (ms: number): string => {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  // Calculate progress for active flow
  const getFlowProgress = (): {
    elapsed: number;
    percentage: number;
    remaining?: number;
  } | null => {
    if (!activeFlow) return null;

    const elapsed = Math.max(0, currentTime - activeFlow.startTime);

    if (activeFlow.mode === 'count-up') {
      return { elapsed, percentage: 0 };
    } else if (activeFlow.targetDuration) {
      const target = activeFlow.targetDuration * 60 * 1000; // convert to ms
      const percentage = Math.min(100, (elapsed / target) * 100);
      const remaining = Math.max(0, target - elapsed);
      return { elapsed, percentage, remaining };
    }

    return null;
  };

  const flowProgress = getFlowProgress();

  // Auto-complete count-down when it reaches zero
  useEffect(() => {
    if (
      activeFlow?.mode === 'count-down' &&
      flowProgress?.remaining !== undefined &&
      flowProgress.remaining <= 0 &&
      !isCompletionConfirmOpen
    ) {
      setIsCompletionConfirmOpen(true);
    }
  }, [activeFlow, flowProgress?.remaining, isCompletionConfirmOpen]);

  return (
    <div
      className="flex flex-col h-full relative z-20"
      style={{
        width: onClose ? '16rem' : `${sidebarWidth}px`, // Fixed width for mobile, dynamic for desktop
        background: 'var(--card)',
        boxShadow: '4px 0 15px -5px rgba(74, 140, 199, 0.1), 1px 0 4px rgba(74, 140, 199, 0.05)',
      }}
    >
      {/* App logo */}
      <div className="p-6" style={{ borderBottom: '1px solid rgba(184, 203, 224, 0.3)' }}>
        <div className="flex items-center justify-between">
          <div
            className="flex items-center gap-3 cursor-pointer transition-opacity hover:opacity-80"
            onClick={() => safeNavigate('/')}
          >
            <div className="relative w-12 h-12 flex-shrink-0">
              <Image
                src="/logo.png"
                alt="DomainFlow Logo"
                fill
                sizes="48px"
                className="object-contain"
                priority
              />
            </div>
            <div>
              <h1 className="text-lg font-semibold" style={{ color: 'var(--foreground)' }}>
                DomainFlow
              </h1>
              <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                Track domains, not tasks
              </p>
            </div>
          </div>
          {/* Mobile close button */}
          {onClose && (
            <button
              onClick={onClose}
              className="lg:hidden p-2 -mr-2 rounded-lg transition-colors hover:bg-gray-100"
              title="Close menu"
            >
              <svg className="w-5 h-5" style={{ color: 'var(--muted-foreground)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* StartFlow Button or Progress Tracking */}
      <div className="px-4 pt-4 pb-2">
        {!activeFlow ? (
          /* StartFlow Button */
          <button
            onClick={() => {
              setStartFlowOpen(true);
              onClose?.();
            }}
            className="w-full py-2.5 px-4 rounded-xl font-semibold text-[13px] text-white transition-all flex items-center justify-center gap-2"
            style={{
              background: 'linear-gradient(135deg, #7BA8CC 0%, #A5C8E1 100%)',
              boxShadow: '0 2px 8px rgba(123, 168, 204, 0.2)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.boxShadow = '0 4px 16px rgba(123, 168, 204, 0.3)';
              e.currentTarget.style.transform = 'translateY(-1px)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.boxShadow = '0 2px 8px rgba(123, 168, 204, 0.2)';
              e.currentTarget.style.transform = 'translateY(0)';
            }}
          >
            <PlayIcon className="w-4 h-4" />
            Start Flow
          </button>
        ) : (
          /* Progress Tracking */
          <div
            className="rounded-xl p-4 relative overflow-hidden transition-opacity duration-500"
            style={{
              background: 'linear-gradient(135deg, var(--primary-light) 0%, var(--primary) 100%)',
              boxShadow: '0 4px 12px rgba(74, 140, 199, 0.2)',
              opacity: activeFlow ? 1 : 0,
            }}
          >
            {/* Progress bar for count-down */}
            {activeFlow.mode === 'count-down' && flowProgress && (
              <div
                className="absolute top-0 left-0 h-1 transition-all duration-1000 ease-linear"
                style={{
                  width: `${flowProgress.percentage}%`,
                  backgroundColor: 'rgba(255, 255, 255, 0.5)',
                }}
              />
            )}

            <div className="relative z-10">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-white opacity-90">
                  {activeFlow.mode === 'count-up' ? 'Counting Up' : 'Count Down'}
                </span>
                <button
                  onClick={handleStopFlowClick}
                  className="p-1.5 rounded-lg transition-all hover:bg-white hover:bg-opacity-20"
                  style={{ color: 'white' }}
                >
                  <StopIcon className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="text-2xl font-bold text-white mb-1 font-mono">
                {flowProgress
                  ? activeFlow.mode === 'count-down' && flowProgress.remaining !== undefined
                    ? formatDuration(flowProgress.remaining)
                    : formatDuration(flowProgress.elapsed)
                  : '0:00'}
              </div>

              {activeFlow.tagIds.length > 0 && allTags && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {activeFlow.tagIds.slice(0, 2).map((tagId) => {
                    const tag = allTags.find((t) => t.id === tagId);
                    if (!tag) return null;
                    return (
                      <span
                        key={tagId}
                        className="text-[10px] px-2 py-0.5 rounded-full bg-white bg-opacity-20 text-white font-medium"
                      >
                        {tag.name}
                      </span>
                    );
                  })}
                  {activeFlow.tagIds.length > 2 && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-white bg-opacity-20 text-white font-medium">
                      +{activeFlow.tagIds.length - 2}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Domains & Tags */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="flex items-center justify-between mb-3">
          <h3
            className="text-xs font-semibold uppercase tracking-wide"
            style={{ color: 'var(--muted-foreground)' }}
          >
            Domains
          </h3>
          <button
            className="text-xs px-2.5 py-1.5 rounded-xl font-semibold transition-all"
            style={{
              color: 'white',
              background: 'linear-gradient(135deg, #7BA8CC 0%, #A5C8E1 100%)',
              fontSize: '11px',
              boxShadow: '0 2px 8px rgba(123, 168, 204, 0.2)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.boxShadow = '0 4px 16px rgba(123, 168, 204, 0.3)';
              e.currentTarget.style.transform = 'translateY(-1px)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.boxShadow = '0 2px 8px rgba(123, 168, 204, 0.2)';
              e.currentTarget.style.transform = 'translateY(0)';
            }}
            onClick={() => setIsAddDomainOpen(true)}
          >
            + Domain
          </button>
        </div>
        <div className="space-y-1">
          {allDomains && allDomains.length === 0 && (
            <div className="px-3 py-5 text-center">
              <p className="text-xs text-gray-500">
                Click "+ Domain" above to create your first domain
              </p>
            </div>
          )}
          {allDomains?.map((domainEntity) => {
            const tags = tagsByDomainId[domainEntity.id] || [];
            const isExpanded = selectedDomain === domainEntity.id;
            const isEditingDomain = editingDomainId === domainEntity.id;

            return (
              <div key={domainEntity.id}>
                {/* Domain header */}
                {isEditingDomain ? (
                  <div
                    className="px-3 py-2 rounded-lg"
                    style={{ backgroundColor: 'var(--hover)' }}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <div className="relative w-5 h-5 flex-shrink-0">
                        <input
                          type="color"
                          value={editDomainColor}
                          onChange={(e) => setEditDomainColor(e.target.value)}
                          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                        />
                        <div
                          className="w-full h-full rounded shadow-sm transition-transform hover:scale-110"
                          style={{
                            background: `linear-gradient(135deg, ${editDomainColor} 0%, ${lightenColor(editDomainColor, 20)} 100%)`,
                          }}
                        />
                      </div>
                      <input
                        type="text"
                        value={editDomainName}
                        onChange={(e) => setEditDomainName(e.target.value)}
                        className="flex-1 text-sm px-2 py-1 rounded focus:outline-none font-medium"
                        style={{ border: '1px solid var(--border)' }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSaveEditDomain();
                          if (e.key === 'Escape') {
                            setEditingDomainId(null);
                            setEditDomainName('');
                            setEditDomainColor('#4A8CC7');
                          }
                        }}
                        autoFocus
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={handleSaveEditDomain}
                        className="flex-1 px-2 py-1 text-xs rounded transition-colors"
                        style={{
                          backgroundColor: 'var(--primary)',
                          color: 'white',
                        }}
                      >
                        Save
                      </button>
                      <button
                        onClick={() => {
                          setEditingDomainId(null);
                          setEditDomainName('');
                          setEditDomainColor('#4A8CC7');
                        }}
                        className="flex-1 px-2 py-1 text-xs rounded transition-colors"
                        style={{
                          backgroundColor: 'var(--muted)',
                          color: 'var(--muted-foreground)',
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div
                    className="w-full flex items-center justify-between px-3 py-2 rounded-lg transition-colors group cursor-pointer"
                    style={{
                      backgroundColor: isExpanded ? 'var(--hover)' : 'transparent',
                    }}
                    onMouseEnter={(e) => {
                      if (!isExpanded) e.currentTarget.style.backgroundColor = 'var(--hover)';
                    }}
                    onMouseLeave={(e) => {
                      if (!isExpanded) e.currentTarget.style.backgroundColor = 'transparent';
                    }}
                    onClick={() => {
                      const willExpand = !isExpanded;
                      setSelectedDomain(willExpand ? domainEntity.id : null);
                      // Set default color to domain color when expanding
                      if (willExpand) {
                        setNewTagColor(domainEntity.color);
                      }
                    }}
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <div
                        className="w-3 h-3 rounded-sm shadow-sm flex-shrink-0"
                        style={{
                          background: `linear-gradient(135deg, ${domainEntity.color} 0%, ${domainEntity.colorEnd || domainEntity.color} 100%)`,
                        }}
                      />
                      <span className="text-sm font-medium truncate" style={{ color: 'var(--foreground)' }}>
                        {domainEntity.name}
                      </span>
                      <span className="text-xs flex-shrink-0" style={{ color: 'var(--muted-foreground)' }}>
                        ({tags.length})
                      </span>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleEditDomain(domainEntity.id);
                        }}
                        className="p-1 rounded transition-colors"
                        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.5)')}
                        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                        title="Rename domain"
                      >
                        <PencilIcon
                          className="w-3 h-3"
                          style={{ color: 'var(--muted-foreground)' }}
                        />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleArchiveDomain(domainEntity.id);
                        }}
                        className="p-1 rounded transition-colors"
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = '#fef9e7';
                          e.currentTarget.querySelector('svg')!.setAttribute('style', 'color: #f59e0b');
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = 'transparent';
                          e.currentTarget
                            .querySelector('svg')!
                            .setAttribute('style', 'color: var(--muted-foreground)');
                        }}
                        title="Archive domain"
                      >
                        <ArchiveBoxIcon
                          className="w-3 h-3"
                          style={{ color: 'var(--muted-foreground)' }}
                        />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteDomain(domainEntity.id);
                        }}
                        className="p-1 rounded transition-colors"
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = '#fef2f2';
                          e.currentTarget.querySelector('svg')!.setAttribute('style', 'color: #ef4444');
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = 'transparent';
                          e.currentTarget
                            .querySelector('svg')!
                            .setAttribute('style', 'color: var(--muted-foreground)');
                        }}
                        title="Delete domain"
                      >
                        <XMarkIcon
                          className="w-3 h-3"
                          style={{ color: 'var(--muted-foreground)' }}
                        />
                      </button>
                    </div>
                  </div>
                )}

                {/* Tags list with animation */}
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{
                        duration: 0.3,
                        ease: [0.4, 0, 0.2, 1], // Smooth easing
                      }}
                      className="ml-6 mt-1 space-y-0.5 overflow-hidden"
                    >
                    {tags.map((tag) => {
                      const isEditing = editingTagId === tag.id;

                      if (isEditing) {
                        return (
                          <div
                            key={tag.id}
                            className="px-3 py-1.5 rounded-md"
                            style={{ backgroundColor: 'var(--hover)' }}
                          >
                            <div className="flex items-center gap-2 mb-2">
                              <div className="relative w-4 h-4 flex-shrink-0">
                                <input
                                  type="color"
                                  value={editTagColor}
                                  onChange={(e) => setEditTagColor(e.target.value)}
                                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                                />
                                <div
                                  className="w-full h-full rounded shadow-sm transition-transform hover:scale-110"
                                  style={{ backgroundColor: editTagColor }}
                                />
                              </div>
                              <input
                                type="text"
                                value={editTagName}
                                onChange={(e) => setEditTagName(e.target.value)}
                                className="flex-1 text-xs px-2 py-1 rounded focus:outline-none"
                                style={{ border: '1px solid var(--border)' }}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleSaveEditTag();
                                  if (e.key === 'Escape') {
                                    setEditingTagId(null);
                                    setEditTagName('');
                                  }
                                }}
                                autoFocus
                              />
                            </div>
                            <div className="flex gap-1 justify-end">
                              <button
                                onClick={handleSaveEditTag}
                                className="text-[10px] px-2 py-1 rounded text-white transition-opacity"
                                style={{ backgroundColor: 'var(--primary)' }}
                                onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.85')}
                                onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
                              >
                                Save
                              </button>
                              <button
                                onClick={() => {
                                  setEditingTagId(null);
                                  setEditTagName('');
                                }}
                                className="text-[10px] px-2 py-1 rounded transition-colors"
                                style={{
                                  border: '1px solid var(--border)',
                                  color: 'var(--foreground)',
                                }}
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        );
                      }

                      return (
                        <div
                          key={tag.id}
                          className="flex items-center justify-between px-3 py-1.5 rounded-md group transition-colors"
                          onMouseEnter={(e) =>
                            (e.currentTarget.style.backgroundColor = 'var(--hover)')
                          }
                          onMouseLeave={(e) =>
                            (e.currentTarget.style.backgroundColor = 'transparent')
                          }
                        >
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <div
                              className="w-2 h-2 rounded-sm flex-shrink-0"
                              style={{ backgroundColor: tag.color }}
                            />
                            <span className="text-xs truncate" style={{ color: 'var(--foreground)' }}>
                              {tag.name}
                            </span>
                          </div>
                          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                            <button
                              onClick={() => handleStartEditTag(tag)}
                              className="p-1 rounded transition-colors"
                              onMouseEnter={(e) =>
                                (e.currentTarget.style.backgroundColor = 'var(--hover)')
                              }
                              onMouseLeave={(e) =>
                                (e.currentTarget.style.backgroundColor = 'transparent')
                              }
                            >
                              <PencilIcon
                                className="w-3 h-3"
                                style={{ color: 'var(--muted-foreground)' }}
                              />
                            </button>
                            <button
                              onClick={() => handleArchiveTag(tag.id)}
                              className="p-1 rounded transition-colors"
                              onMouseEnter={(e) => {
                                e.currentTarget.style.backgroundColor = '#fef9e7';
                                e.currentTarget
                                  .querySelector('svg')!
                                  .setAttribute('style', 'color: #f59e0b');
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.backgroundColor = 'transparent';
                                e.currentTarget
                                  .querySelector('svg')!
                                  .setAttribute('style', 'color: var(--muted-foreground)');
                              }}
                              title="Archive sub-domain"
                            >
                              <ArchiveBoxIcon
                                className="w-3 h-3"
                                style={{ color: 'var(--muted-foreground)' }}
                              />
                            </button>
                            <button
                              onClick={() => handleDeleteTag(tag.id)}
                              className="p-1 rounded transition-colors"
                              onMouseEnter={(e) => {
                                e.currentTarget.style.backgroundColor = '#fef2f2';
                                e.currentTarget
                                  .querySelector('svg')!
                                  .setAttribute('style', 'color: #ef4444');
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.backgroundColor = 'transparent';
                                e.currentTarget
                                  .querySelector('svg')!
                                  .setAttribute('style', 'color: var(--muted-foreground)');
                              }}
                            >
                              <XMarkIcon
                                className="w-3 h-3"
                                style={{ color: 'var(--muted-foreground)' }}
                              />
                            </button>
                          </div>
                        </div>
                      );
                    })}

                    {/* Add tag input */}
                    <div className="flex items-center gap-2 px-3 py-1.5">
                      <div className="relative w-4 h-4 flex-shrink-0">
                        <input
                          type="color"
                          value={newTagColor}
                          onChange={(e) => setNewTagColor(e.target.value)}
                          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                        />
                        <div
                          className="w-full h-full rounded shadow-sm transition-transform hover:scale-110"
                          style={{ backgroundColor: newTagColor }}
                        />
                      </div>
                      <input
                        type="text"
                        placeholder="Sub-domain..."
                        value={newTagName}
                        onChange={(e) => setNewTagName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleAddTag();
                          if (e.key === 'Escape') {
                            setSelectedDomain(null);
                            setNewTagName('');
                          }
                        }}
                        className="flex-1 text-xs px-2 py-1 border border-gray-200 rounded focus:outline-none focus:border-blue-400"
                        autoFocus
                      />
                    </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </div>

      {/* Export, Settings, and Auth */}
      <div style={{ borderTop: '1px solid rgba(184, 203, 224, 0.3)' }}>
        {/* Auth Section */}
        {isSupabaseConfigured() && (
          <div className="px-4 py-4" style={{ borderBottom: '1px solid rgba(184, 203, 224, 0.3)' }}>
            {userId ? (
              <div>
                <div
                  className="px-3 py-2 mb-2 rounded-lg"
                  style={{ backgroundColor: 'var(--hover)' }}
                >
                  <div className="text-xs font-medium" style={{ color: 'var(--muted-foreground)' }}>
                    Signed in as
                  </div>
                  <div
                    className="text-sm font-medium truncate"
                    style={{ color: 'var(--foreground)' }}
                  >
                    {userEmail}
                  </div>
                  {isSyncing && (
                    <div className="text-xs mt-1" style={{ color: 'var(--primary)' }}>
                      Syncing...
                    </div>
                  )}
                </div>
                <button
                  onClick={async () => {
                    try {
                      await signOut();
                      setUserId(null);
                      setUserEmail(null);
                    } catch (error) {
                      console.error('[Auth] Sign out error:', error);
                    }
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors text-sm"
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
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                    />
                  </svg>
                  <span className="font-medium">Sign Out</span>
                </button>
              </div>
            ) : (
              <button
                onClick={async () => {
                  try {
                    await signInWithGoogle();
                  } catch (error) {
                    console.error('[Auth] Sign in error:', error);
                    setErrorTitle('Sign In Failed');
                    setErrorMessage(
                      error instanceof Error ? error.message : 'Unknown error occurred'
                    );
                    setIsErrorOpen(true);
                  }
                }}
                className="w-full flex items-center justify-center gap-3 px-3 py-2.5 rounded-lg transition-all text-sm font-semibold"
                style={{
                  background: 'linear-gradient(135deg, #7BA8CC 0%, #A5C8E1 100%)',
                  color: 'white',
                  boxShadow: '0 2px 8px rgba(123, 168, 204, 0.2)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.boxShadow = '0 4px 16px rgba(123, 168, 204, 0.3)';
                  e.currentTarget.style.transform = 'translateY(-1px)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.boxShadow = '0 2px 8px rgba(123, 168, 204, 0.2)';
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
                <span>Sign in with Google</span>
              </button>
            )}
          </div>
        )}

        <div className="p-4">
          <button
            onClick={() => safeNavigate('/archive')}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors mb-2"
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
            <ArchiveBoxIcon className="w-5 h-5" />
            <span className="text-sm font-medium">Archive</span>
          </button>

          <button
            onClick={() => safeNavigate('/export')}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors mb-2"
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
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
              />
            </svg>
            <span className="text-sm font-medium">Export</span>
          </button>

          <button
            onClick={() => setIsSettingsOpen(true)}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors"
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
            <Cog6ToothIcon className="w-5 h-5" />
            <span className="text-sm font-medium">Settings</span>
          </button>
        </div>
      </div>

      {/* Add Domain Dialog */}
      <Dialog.Root open={isAddDomainOpen} onOpenChange={setIsAddDomainOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black bg-opacity-30 z-40" />
          <Dialog.Content
            className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md rounded-xl shadow-2xl z-50 p-6"
            style={{ background: 'var(--card)' }}
            aria-describedby={undefined}
          >
            <Dialog.Title
              className="text-lg font-semibold mb-4"
              style={{ color: 'var(--foreground)' }}
            >
              Create New Domain
            </Dialog.Title>

            <div className="space-y-4">
              <div>
                <label
                  className="block text-sm font-medium mb-2"
                  style={{ color: 'var(--foreground)' }}
                >
                  Domain Name
                </label>
                <input
                  type="text"
                  value={newDomainName}
                  onChange={(e) => setNewDomainName(e.target.value)}
                  placeholder="e.g., Hobbies, Travel, Learning..."
                  className="w-full px-3 py-2 text-sm rounded-lg transition-colors"
                  style={{
                    border: '1px solid var(--border)',
                    backgroundColor: 'var(--card)',
                    color: 'var(--foreground)',
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleAddDomain();
                  }}
                  autoFocus
                />
              </div>

              <div>
                <label
                  className="block text-sm font-medium mb-2"
                  style={{ color: 'var(--foreground)' }}
                >
                  Color
                </label>
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <input
                      type="color"
                      value={newDomainColor}
                      onChange={(e) => setNewDomainColor(e.target.value)}
                      className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                    />
                    <div
                      className="w-12 h-12 rounded-xl cursor-pointer shadow-sm border transition-all hover:scale-105"
                      style={{
                        background: `linear-gradient(135deg, ${newDomainColor} 0%, ${lightenColor(newDomainColor, 20)} 100%)`,
                        border: '2px solid var(--border)',
                      }}
                    />
                  </div>
                  <div className="flex-1">
                    <div
                      className="h-12 rounded-xl flex items-center justify-center text-white text-sm font-semibold tracking-wide"
                      style={{
                        background: `linear-gradient(135deg, ${newDomainColor} 0%, ${lightenColor(newDomainColor, 15)} 100%)`,
                        boxShadow: `0 4px 12px ${newDomainColor}33`,
                        textShadow: '0 1px 2px rgba(0,0,0,0.1)',
                      }}
                    >
                      Preview
                    </div>
                  </div>
                </div>
              </div>

              <div
                className="p-3 rounded-xl text-[11px] leading-relaxed"
                style={{
                  backgroundColor: 'var(--hover)',
                  color: 'var(--muted-foreground)',
                  border: '1px solid rgba(74, 140, 199, 0.1)',
                }}
              >
                💡 <strong>Tip:</strong> Choose a color that represents the nature of this domain.
                You can create unlimited tags under each domain.
              </div>
            </div>

            <div className="mt-8 flex gap-3 justify-end">
              <button
                onClick={() => {
                  setIsAddDomainOpen(false);
                  setNewDomainName('');
                  setNewDomainColor('#4A8CC7');
                }}
                className="px-5 py-2.5 text-sm font-medium rounded-xl transition-all"
                style={{ border: '1px solid var(--border)', color: 'var(--muted-foreground)' }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--hover)';
                  e.currentTarget.style.color = 'var(--foreground)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                  e.currentTarget.style.color = 'var(--muted-foreground)';
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleAddDomain}
                disabled={!newDomainName.trim()}
                className="px-6 py-2.5 text-sm font-semibold text-white rounded-xl transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-md hover:shadow-lg active:scale-95"
                style={{
                  background: `linear-gradient(135deg, var(--primary) 0%, #5B9DD8 100%)`,
                }}
                onMouseEnter={(e) =>
                  !e.currentTarget.disabled && (e.currentTarget.style.opacity = '0.9')
                }
                onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
              >
                Create Domain
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Settings Dialog */}
      <Dialog.Root open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black bg-opacity-30 z-40" />
          <Dialog.Content
            className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md rounded-xl shadow-2xl z-50 p-6"
            style={{ background: 'var(--card)' }}
            aria-describedby={undefined}
          >
            <Dialog.Title
              className="text-lg font-semibold mb-4"
              style={{ color: 'var(--foreground)' }}
            >
              Settings
            </Dialog.Title>

            <div className="space-y-4">
              {/* Attribution Mode */}
              <div>
                <label
                  className="block text-sm font-medium mb-2"
                  style={{ color: 'var(--foreground)' }}
                >
                  Multi-tag Attribution
                </label>
                <select
                  className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none transition-colors"
                  style={{
                    border: '1px solid var(--border)',
                    backgroundColor: 'var(--card)',
                    color: 'var(--foreground)',
                  }}
                >
                  <option value="split">Split evenly across tags</option>
                  <option value="primary">First tag only</option>
                </select>
              </div>

              {/* Theme */}
              <div>
                <label
                  className="block text-sm font-medium mb-2"
                  style={{ color: 'var(--foreground)' }}
                >
                  Appearance
                </label>
                <select
                  className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none transition-colors"
                  style={{
                    border: '1px solid var(--border)',
                    backgroundColor: 'var(--card)',
                    color: 'var(--foreground)',
                  }}
                >
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                  <option value="auto">Auto</option>
                </select>
              </div>
            </div>

            <div className="mt-8 flex justify-end">
              <button
                onClick={() => setIsSettingsOpen(false)}
                className="px-6 py-2.5 text-sm font-semibold text-white rounded-xl transition-all shadow-md hover:shadow-lg active:scale-95"
                style={{
                  background: `linear-gradient(135deg, var(--primary) 0%, #5B9DD8 100%)`,
                }}
                onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.9')}
                onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
              >
                Done
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Stop Flow Confirmation Dialog */}
      <ConfirmDialog
        open={isStopConfirmOpen}
        onOpenChange={setIsStopConfirmOpen}
        title="Stop this flow session?"
        description="Your progress will be saved automatically."
        confirmText="Stop"
        cancelText="Cancel"
        onConfirm={handleConfirmStop}
      />

      {/* Delete Tag Confirmation Dialog */}
      <ConfirmDialog
        open={isDeleteTagConfirmOpen}
        onOpenChange={setIsDeleteConfirmOpen}
        title="Delete Tag?"
        description="It will be removed from all time slots."
        confirmText="Delete"
        cancelText="Cancel"
        onConfirm={handleConfirmDeleteTag}
      />

      {/* Generic Confirmation Dialog */}
      <ConfirmDialog
        open={isConfirmOpen}
        onOpenChange={setIsConfirmOpen}
        title={confirmTitle}
        description={confirmMessage}
        confirmText="Confirm"
        cancelText="Cancel"
        onConfirm={() => {
          if (confirmAction) confirmAction();
        }}
      />

      {/* Generic Error Dialog */}
      <ConfirmDialog
        open={isErrorOpen}
        onOpenChange={setIsErrorOpen}
        title={errorTitle}
        description={errorMessage}
        confirmText="OK"
        showCancel={false}
        onConfirm={() => setIsErrorOpen(false)}
      />

      {/* Session Completion Dialog */}
      <ConfirmDialog
        open={isCompletionConfirmOpen}
        onOpenChange={setIsCompletionConfirmOpen}
        title="Session Completed!"
        description="Your focus session has finished. Great job!"
        confirmText="Complete"
        showCancel={false}
        onConfirm={handleConfirmStop}
      />

      {/* Resize Handle - only show on desktop */}
      {!onClose && (
        <div
          className="absolute top-0 right-0 w-1 h-full cursor-col-resize group hover:bg-blue-400 transition-colors z-30"
          onMouseDown={(e) => {
            e.preventDefault();
            setIsResizing(true);
          }}
          style={{
            backgroundColor: isResizing ? '#60a5fa' : 'transparent',
          }}
        >
          {/* Wider hover area for better UX */}
          <div className="absolute top-0 right-0 w-2 h-full -translate-x-1/2" />
        </div>
      )}
    </div>
  );
};

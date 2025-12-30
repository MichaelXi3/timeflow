import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { TimeSlot, Tag, AppSettings } from './types';

interface FlowSession {
  mode: 'count-up' | 'count-down';
  startTime: number; // epoch ms
  targetDuration?: number; // minutes (for count-down)
  note?: string;
  tagIds: string[];
  energy?: number;
  mood?: number;
}

interface AppState {
  // Selected date for calendar view
  selectedDate: Date;
  setSelectedDate: (date: Date) => void;

  // UI state
  selectedSlotId: string | null;
  setSelectedSlotId: (id: string | null) => void;

  isQuickEditOpen: boolean;
  setQuickEditOpen: (open: boolean) => void;

  // Sidebar collapse state
  isRightSidebarCollapsed: boolean;
  setRightSidebarCollapsed: (collapsed: boolean) => void;

  // Mobile left sidebar state
  isLeftSidebarOpen: boolean;
  setLeftSidebarOpen: (open: boolean) => void;

  // Flow tracking state
  activeFlow: FlowSession | null;
  setActiveFlow: (flow: FlowSession | null) => void;
  isStartFlowOpen: boolean;
  setStartFlowOpen: (open: boolean) => void;

  // Auth state
  userId: string | null;
  setUserId: (userId: string | null) => void;

  // Settings
  settings: AppSettings;
  updateSettings: (settings: Partial<AppSettings>) => void;

  // Recently used tags (for quick access)
  recentTagIds: string[];
  addRecentTag: (tagId: string) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      selectedDate: new Date(),
      setSelectedDate: (date) => set({ selectedDate: date }),

      selectedSlotId: null,
      setSelectedSlotId: (id) => set({ selectedSlotId: id }),

      isQuickEditOpen: false,
      setQuickEditOpen: (open) => set({ isQuickEditOpen: open }),

      isRightSidebarCollapsed: false,
      setRightSidebarCollapsed: (collapsed) => set({ isRightSidebarCollapsed: collapsed }),

      isLeftSidebarOpen: false,
      setLeftSidebarOpen: (open) => set({ isLeftSidebarOpen: open }),

      activeFlow: null,
      setActiveFlow: (flow) => set({ activeFlow: flow }),

      isStartFlowOpen: false,
      setStartFlowOpen: (open) => set({ isStartFlowOpen: open }),

      userId: null,
      setUserId: (userId) => {
        set({ userId });
        // Store userId globally for db.ts to access
        if (typeof window !== 'undefined') {
          (window as any).__timeflow_user_id = userId;
        }
      },

      settings: {
        gridInterval: 30,
        attributionMode: 'split',
        theme: 'light',
      },
      updateSettings: (newSettings) =>
        set((state) => ({
          settings: { ...state.settings, ...newSettings },
        })),

      recentTagIds: [],
      addRecentTag: (tagId) =>
        set((state) => {
          const filtered = state.recentTagIds.filter((id) => id !== tagId);
          return {
            recentTagIds: [tagId, ...filtered].slice(0, 5), // Keep only 5 most recent
          };
        }),
    }),
    {
      name: 'timeflow-storage',
      storage: createJSONStorage(() => localStorage),
      // Only persist specific fields to avoid issues with non-serializable data like Date
      partialize: (state) => ({
        activeFlow: state.activeFlow,
        settings: state.settings,
        isRightSidebarCollapsed: state.isRightSidebarCollapsed,
        recentTagIds: state.recentTagIds,
        userId: state.userId,
      }),
    }
  )
);

# TimeFlow — Calm Time Journaling

TimeFlow is a personal productivity app that helps you understand where your time goes without the stress of to-do lists and overdue tasks. Instead of planning what you'll do, you record what you *actually* do—in time blocks—and reflect on patterns.

<p align="center">
  <img src="public/logo_bar.png" alt="TimeFlow" width="120" />
</p>

<p align="center">
  <i>"Track time, not tasks. Reduce anxiety, enter flow."</i>
</p>

---

## Philosophy

- **Time is the first-class citizen**: No unfinished tasks, no overdue anxiety. Just record reality.
- **Reflection over planning**: See where your time goes, identify patterns, and adjust naturally.
- **Offline-first**: Works fully offline. Optional cloud sync for multi-device access.
- **Privacy-first**: Your data, your control. Cloud sync is optional and uses row-level security.
- **Enter flow**: By removing productivity anxiety, you create space for deep work and meaningful activities.

---

## Features

### Core
- **Week View**: Calendar-style 7-day grid with smooth drag-to-create (15 min intervals)
- **Day View**: Detailed single-day time grid for focused planning
- **Quick Edit Panel**: Add notes, 2-level tags (Domain → Subtag), energy & mood ratings
- **Weekly Summary**: Real-time pie charts and domain breakdowns in sidebar
- **Daily Logs**: Markdown editor with auto-generated template from your time data
- **Export/Import**: CSV, Markdown, and ICS (iCalendar) formats
- **Offline PWA**: Install as a standalone app, works without internet
- **Cloud Sync (Optional)**: Sign in with Google to sync across devices via Supabase

### Tag System
- **Domains**: Life, Study, Family, Health, Work, Create (customizable)
- **Subtags**: Granular activities within each domain (e.g., Study → Biology, C++, CS)
- **Multi-tag support**: Split duration evenly or assign to primary tag (configurable)

---

## Tech Stack & Rationale

### Frontend
- **Next.js 14** (App Router): Modern React framework with excellent DX, supports CSR patterns
- **TypeScript**: Type safety for data models and business logic
- **Tailwind CSS**: Utility-first styling for rapid UI development
- **Radix UI**: Accessible, unstyled primitives for dialogs, switches, etc.
- **Framer Motion**: Smooth animations for better UX
- **dnd-kit**: Drag-and-drop for time block creation and resizing

### State & Storage
- **Zustand**: Lightweight state management for UI state
- **IndexedDB via Dexie**: ~1GB+ storage capacity, transactions, indexing, offline-first
- **Supabase (Optional)**: Cloud sync with Postgres + RLS, Google OAuth authentication
- **Why not SQLite WASM?** Too heavy (~800KB bundle) for this schema
- **Why not LocalStorage?** 5-10MB limit, no indexing, no transactions

### PWA
- **next-pwa**: Service worker generation, static asset caching
- **manifest.json**: Install prompts, standalone mode

---

## Getting Started

### Prerequisites
- Node.js 18+ and pnpm (or npm/yarn)

### Installation

```bash
# Install dependencies
pnpm install

# (Optional) Set up cloud sync
# Copy .env.example to .env.local and add your Supabase credentials
cp .env.example .env.local
# Edit .env.local with your Supabase URL and anon key

# Run development server
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

**Note**: The app works fully offline without Supabase. Cloud sync is optional.

### Build for Production

```bash
# Build optimized bundle
pnpm build

# Serve production build locally
pnpm start
```

### Install as PWA

1. Build and serve the production app
2. Open in Chrome/Edge/Safari
3. Look for "Install" prompt in address bar
4. Click to install as standalone app

---

## Project Structure

```
TimeFlow/
├── app/                     # Next.js App Router pages
│   ├── page.tsx             # Week view (default, Apple Calendar style)
│   ├── day/page.tsx         # Single day view
│   ├── logs/page.tsx        # Markdown journal editor
│   ├── settings/page.tsx    # Tag manager & preferences
│   ├── export/page.tsx      # CSV/MD/ICS export/import
│   ├── layout.tsx           # Root layout with navigation
│   └── globals.css          # Global styles + CSS variables
├── components/
│   ├── calendar/
│   │   ├── WeekGrid.tsx     # 7-day week view with drag-to-create
│   │   ├── TimeGrid.tsx     # Single day interactive grid
│   │   └── SlotBox.tsx      # Individual time block component
│   ├── panels/
│   │   └── QuickEditPanel.tsx  # Slide-in edit panel
│   ├── stats/
│   │   └── TodayBar.tsx     # Daily summary strip
│   ├── charts/
│   │   └── DomainSummary.tsx   # Pie chart + breakdown
│   └── Navigation.tsx       # Top nav bar
├── lib/
│   ├── types.ts             # TypeScript types (TimeSlot, Tag, etc.)
│   ├── db.ts                # Dexie schema + CRUD helpers
│   ├── store.ts             # Zustand state management
│   ├── calc.ts              # Attribution & aggregation logic
│   ├── export.ts            # CSV/MD/ICS generators
│   └── utils/
│       └── date.ts          # Date/time utilities (UTC/local, snapping)
├── public/
│   ├── manifest.json        # PWA manifest
│   └── icons/               # PWA icons (generate with pwabuilder.com)
├── __tests__/
│   └── calc.test.ts         # Unit tests for calc logic
├── next.config.js           # Next.js + PWA config
├── tailwind.config.ts       # Tailwind theme
└── package.json
```

---

## Data Model

### TimeSlot
```ts
{
  id: string;
  start: number;        // UTC epoch ms
  end: number;          // UTC epoch ms
  note?: string;
  tagIds: string[];     // ["Study/CFA", "Health/Run"]
  energy?: 1..5;
  mood?: 1..5;
  version: number;      // For future sync conflict resolution
  createdAt: number;
  updatedAt: number;
}
```

### Tag
```ts
{
  id: string;           // "Study/CFA"
  domain: Domain;       // "Study"
  name: string;         // "CFA"
  color?: string;       // Hex color
  createdAt: number;
  updatedAt: number;
}
```

### DailyLog
```ts
{
  id: string;
  date: string;         // "YYYY-MM-DD"
  markdown: string;
  createdAt: number;
  updatedAt: number;
}
```

---

## Configuration

### Multi-tag Attribution
- **Split evenly** (default): Duration divided equally across all tags
- **Primary tag only**: First tag gets 100% of duration
- Used for aggregations in summaries and charts

### Theme
- Light/Dark theme toggle in Settings (coming soon: auto-detection)

---

## Data Storage & Backup

### Local Storage (Always Available)
- All data stored in browser's IndexedDB (offline-first)
- ~1GB+ capacity, persists across sessions
- **Important**: Clearing browser data will delete local data

### Cloud Sync (Optional)
- Sign in with Google to enable cloud backup
- Data syncs to Supabase (Postgres) automatically
- Access from any device with same account

### Export & Backup
1. Go to **Export** page
2. Select date range
3. Export:
   - **Time Slots (CSV)**: Import into Excel, Google Sheets
   - **Tags (CSV)**: Backup your tag configuration
   - **Daily Logs (Markdown)**: All journal entries in one file
   - **Calendar (ICS)**: Import to Google/Apple Calendar

### Import
- Upload CSV files to restore or migrate data
- Format must match export format

---

## Contributing

This is a personal project, but contributions are welcome!

1. Fork the repo
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Commit changes: `git commit -am 'Add my feature'`
4. Push to branch: `git push origin feature/my-feature`
5. Open a Pull Request

Please ensure:
- Code passes ESLint/Prettier checks
- Add tests for new features
- Update README if needed

---

## License

MIT License - feel free to use this project for personal or commercial purposes.
---

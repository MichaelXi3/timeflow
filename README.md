# DomainFlow

DomainFlow is a personal time-awareness app that helps you understand how your time flows across different life domains — without the stress of to-do lists or overdue tasks. Instead of planning what you should do, you capture what you actually do in time blocks and reflect on long-term patterns.

<p align="center">
  <img src="public/logo_bar.png" alt="DomainFlow" width="280" />
</p>

<p align="center">
  <i>"Track domains, not tasks."</i>
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
- **Day View**: Detailed single-day time grid with integrated Daily Log editor
- **Quick Edit Panel**: Add notes, 2-level tags (Domain → Sub-domain), energy & mood ratings
- **Insights Page**: Analytics dashboard with domain distribution, trends, and top sub-domains
- **Daily Logs**: Markdown editor with auto-generated templates from your time data
- **Export/Import**: CSV, Markdown, and ICS (iCalendar) formats
- **Offline PWA**: Install as a standalone app, works without internet
- **Cloud Sync (Optional)**: Sign in with Google to sync across devices via Supabase

### Domain & Sub-domain System
- **Domains**: Top-level categories (Life, Study, Family, Health, Work, Create) - fully customizable
- **Sub-domains**: Granular activities/projects within each domain (e.g., Study → Biology, CFA, CS)
- **Archive System**: Archive domains/sub-domains without losing historical data
- **Multi-tag support**: Split duration evenly or assign to primary tag (configurable)
- **Drag & Reorder**: Easily reorganize domains and sub-domains by dragging

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
- **Zustand**: Lightweight state management for UI state with localStorage persistence
- **IndexedDB via Dexie**: ~1GB+ storage capacity, transactions, indexing, offline-first
- **In-Memory Cache**: 5-second TTL cache for frequent queries (domains/tags) to reduce IndexedDB load
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
DomainFlow/
├── app/                     # Next.js App Router pages
│   ├── page.tsx             # Week view (default, Apple Calendar style)
│   ├── day/[date]/page.tsx  # Single day view with Daily Log
│   ├── insights/page.tsx    # Analytics dashboard
│   ├── archive/page.tsx     # Archived domains & sub-domains
│   ├── export/page.tsx      # CSV/MD/ICS export/import
│   ├── layout.tsx           # Root layout with Vercel Analytics
│   └── globals.css          # Global styles + CSS variables
├── components/
│   ├── calendar/
│   │   ├── WeekGrid.tsx     # 7-day week view with drag-to-create
│   │   ├── TimeGrid.tsx     # Single day interactive grid
│   │   └── SlotBox.tsx      # Individual time block component
│   ├── panels/
│   │   ├── QuickEditPanel.tsx    # Slide-in edit panel
│   │   └── StartFlowPanel.tsx    # Start new flow panel
│   ├── layout/
│   │   └── Sidebar.tsx      # Resizable left sidebar with domains
│   ├── stats/
│   │   └── TodayBar.tsx     # Daily summary strip
│   ├── charts/
│   │   └── DomainSummary.tsx     # Pie chart + breakdown
│   └── ui/                  # Reusable UI components
├── lib/
│   ├── types.ts             # TypeScript types (TimeSlot, Tag, Domain, etc.)
│   ├── db.ts                # Dexie schema + CRUD helpers with caching
│   ├── cache.ts             # In-memory cache with TTL
│   ├── store.ts             # Zustand state management
│   ├── calc.ts              # Attribution & aggregation logic
│   ├── export.ts            # CSV/MD/ICS generators
│   ├── sync.ts              # Supabase sync logic
│   ├── supabaseClient.ts    # Supabase client setup
│   └── utils/
│       └── date.ts          # Date/time utilities (UTC/local, snapping)
├── public/
│   ├── manifest.json        # PWA manifest
│   ├── logo.png             # App logo
│   └── icons/               # PWA icons
├── __tests__/               # Comprehensive test suite
│   ├── calc.test.ts         # Domain calculation tests
│   ├── cache.test.ts        # Cache functionality tests (100% coverage)
│   ├── db-cache.test.ts     # Database caching integration tests
│   └── export-performance.test.ts  # Performance tests
├── docs/                    # Documentation (gitignored)
│   ├── TESTING.md           # Performance testing report
│   ├── SYNC_IMPLEMENTATION.md  # Sync architecture
│   ├── SUPABASE_SETUP.md    # Supabase setup guide
│   └── SUPABASE_SCHEMA.md   # Database schema
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

### Domain
```ts
{
  id: string;           // UUID
  name: string;         // "Study"
  color: string;        // Gradient start color
  colorEnd?: string;    // Gradient end color (optional)
  order: number;        // Display order
  archivedAt?: number;  // Archive timestamp
  createdAt: number;
  updatedAt: number;
}
```

### Tag (Sub-domain)
```ts
{
  id: string;           // UUID
  domainId: string;     // Reference to Domain
  name: string;         // "CFA", "Biology", etc.
  color?: string;       // Hex color (optional)
  archivedAt?: number;  // Archive timestamp
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
- Configurable in Settings, used for aggregations in summaries and charts

### Archive System
- Archive domains or sub-domains without deleting historical data
- Archived items disappear from main UI but timeslots remain visible
- Dedicated Archive page to view and unarchive items

### UI Customization
- **Resizable Sidebar**: Drag the sidebar edge to adjust width
- **Theme**: Light/Dark theme toggle in Settings
- **Sidebar Width**: Persists across sessions

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
1. Go to **Settings** → **Data Management** → **Export Data**
2. Select date range
3. Export:
   - **Time Slots (CSV)**: Import into Excel, Google Sheets
   - **Tags (CSV)**: Backup your tag configuration
   - **Daily Logs (Markdown)**: All journal entries in one file
   - **Calendar (ICS)**: Import to Google/Apple Calendar

### Import
- Upload CSV files to restore or migrate data
- Format must match export format
- Import adds to existing data (doesn't replace)

---

## Performance & Testing

### Optimization
- **Lazy Loading**: Export page only loads data on-demand (not on mount)
- **In-Memory Caching**: 5-second TTL cache reduces IndexedDB queries by 80%+
- **Indexed Queries**: All date range queries use IndexedDB indexes for fast retrieval
- **Automatic Cache Invalidation**: Cache clears after CRUD operations and sync

### Test Coverage
- **54 Tests** across 4 test suites (all passing)
- **100% Coverage** of cache module
- **Integration Tests** for database caching patterns
- **Performance Tests** for lazy loading and query optimization
- See `docs/TESTING.md` for detailed test report

### Running Tests
```bash
# Run all tests
npm test

# Run with coverage
npm test -- --coverage

# Watch mode
npm test -- --watch
```

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
- Add tests for new features (run `npm test`)
- Update README if needed

---

## Recent Updates

### v1.2.0 (January 2026)
- ✨ **Insights Page**: New analytics dashboard with domain trends and top sub-domains
- 🗄️ **Archive System**: Archive domains/sub-domains without losing data
- ⚡ **Performance Optimization**: Lazy loading and caching (80% query reduction)
- 📊 **Auto Daily Logs**: Automatically generate daily summaries for past dates
- 🎨 **Resizable Sidebar**: Drag to adjust sidebar width
- 🔄 **Midnight Crossing**: Fixed bug with timeslots crossing midnight
- 📱 **Vercel Analytics**: Integrated for performance monitoring
- 🧪 **Comprehensive Testing**: 54 tests with 100% cache coverage

### v1.1.0 (December 2025)
- 🔐 **Cloud Sync**: Optional Supabase sync with Google OAuth
- 📝 **Daily Logs**: Markdown editor with auto-generated templates
- 📤 **Export/Import**: CSV, Markdown, and ICS formats
- 🏷️ **Tag System**: Domains and sub-domains with color coding
- 📱 **PWA Support**: Install as standalone app

---

## License

MIT License - feel free to use this for your own time tracking needs!

---

## Acknowledgments

Built with:
- [Next.js](https://nextjs.org/) - React framework
- [Dexie.js](https://dexie.org/) - IndexedDB wrapper
- [Supabase](https://supabase.com/) - Backend as a service
- [Tailwind CSS](https://tailwindcss.com/) - Styling
- [Radix UI](https://www.radix-ui.com/) - UI primitives
- [Recharts](https://recharts.org/) - Data visualization

---

<p align="center">
  Made with ❤️ for better time awareness
</p>

<p align="center">
  <i>"Your time is yours. Know where it flows."</i>
</p>

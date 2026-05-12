# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

```bash
npm run dev        # start dev server (localhost:3000)
npm run build      # production build
npm run lint       # ESLint
npx tsc --noEmit  # type-check without emitting
```

No test suite exists.

## Architecture

**Stack:** Next.js 16 App Router · React 19 · TypeScript · Tailwind CSS v4 · Supabase · dnd-kit

### Data layer

One Supabase table: `pipeline`. All queries live in `lib/queries.ts` and accept an optional `db` client so they work from both Server Components and Client Components.

- `lib/supabase.ts` — browser client (`createBrowserClient`)
- `lib/supabase-server.ts` — async server client (`createServerClient` + cookies)

**Do not write `puntuacion_lead` or `tipo_lead`** — they are `GENERATED ALWAYS AS … STORED` columns computed by Postgres from the qualification fields. The ORM will error if you try to insert/update them.

### Auth

Auth guard logic lives in `proxy.ts` (not the standard `middleware.ts`). It calls `supabase.auth.getUser()` server-side and redirects unauthenticated requests to `/login`. The `AppShell` component (`components/layout/AppShell.tsx`) skips the sidebar for the `/login` route.

### Page pattern

Pages are async Server Components that fetch data via `getServerSupabase()`. Interactive sub-components are separated into `'use client'` files. Example: `app/pipeline/page.tsx` fetches `getLeadsByEstado` then passes the result to `<KanbanBoard>` (client component with dnd-kit).

### Kanban (Pipeline)

`KanbanBoard` holds `columns` state, performs optimistic updates on drag-end, calls `updateLeadEstado` against Supabase, and rolls back on error. Sensors: mouse (8px distance) and touch (200ms delay).

### Design system

Dark theme only. All colors are CSS custom properties defined in `app/globals.css` — never use hardcoded hex values, always reference variables like `var(--accent-violet)`, `var(--bg-card)`, `var(--text-muted)`. Lead temperature colors: `--ultra-hot` (red), `--hot` (orange), `--warm` (yellow), `--cold` (blue).

### Lead types

`lib/types.ts` defines `TipoLead` (`Ultra Hot | Hot | Warm | Cold`) and `EstadoLead` (the 8 pipeline stages). Score thresholds: ≥25 → Ultra Hot, ≥18 → Hot, ≥12 → Warm, else Cold.

### Environment variables required

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
```

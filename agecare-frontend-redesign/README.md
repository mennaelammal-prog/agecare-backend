# AgeCare — Wellbeing Redesign ("Heirloom Journal")

A ground-up frontend redesign of the AgeCare experience, generated with Manus and imported here from an exported project zip. It is a **separate client application** that talks to this repository's existing REST API — it does not replace or modify `server.js`/`routes/*` in the backend root, and it is not wired into the deploy pipeline by this import.

## What this is

- **Design system:** "Heirloom Journal" — an editorial, high-contrast, low-clutter layout aimed at older adults and family caregivers (parchment surfaces, deep ink text, a verdigris accent, DM Serif Display for reflective content, Plus Jakarta Sans for UI/health data). See `ideas.md` and `redesign_prompt.md` for the full design brief.
- **Stack:** React 19 + Vite 7 + TypeScript, Tailwind v4, shadcn/ui (Radix primitives), tRPC, `wouter` for routing.
- **How it reaches this backend:** `server/legacyApi.ts` proxies every AgeCare API call through a thin Express/tRPC server. It targets `AGECARE_LEGACY_API_URL`, falling back to the live deployment at `https://agecare-backend-c8uq.onrender.com/api` (this repo's Render deployment) if unset.
- **Pages/components of note:** `client/src/pages/Home.tsx` (the "Today" experience), `client/src/components/LegacyCareModules.tsx` (medications/appointments/vitals/chat/check-in), `client/src/components/CareConnections.tsx` (family contacts + consent-based shared history, see below), `client/src/components/AIChatBox.tsx` (a standalone chat widget, not currently wired into `Home.tsx`).

## Now buildable — the Manus platform scaffold gap is fixed

The zip this was imported from is a **Manus WebDev project export**, which only contains user-authored files — it did not include the platform-managed runtime scaffold (`server/_core/*`), a Manus-proprietary Vite plugin, or a Drizzle/MySQL schema for Manus's own unrelated auth tables. That gap has been closed:

- `server/_core/context.ts`, `trpc.ts`, `cookies.ts`, `systemRouter.ts`, and `index.ts` are hand-written minimal replacements — see the comment at the top of each file for what they stand in for and why. `auth.me`/`auth.logout`/the OAuth cookie flow they support are vestigial (Manus's own login system) and not used by the real AgeCare authentication, which is `legacy.login`/`legacy.register` returning a JWT the client stores itself — `user` in the tRPC context is always `null` here.
- `server/db.ts`, `server/storage.ts`, `drizzle.config.ts`, and `shared/types.ts` were deleted — they backed Manus's own MySQL user table and S3 file storage, neither used by the AgeCare data flow (every real call goes through `server/legacyApi.ts` to this repo's REST API).
- `client/src/components/DashboardLayout.tsx`, `DashboardLayoutSkeleton.tsx`, `ManusDialog.tsx`, and `pages/ComponentShowcase.tsx` were deleted — dead scaffold that depended on a missing `@/_core/hooks/useAuth` client hook and was never imported by `App.tsx`/`Home.tsx` (verified via grep before deleting).
- `vite-plugin-manus-runtime` removed from `vite.config.ts` and `package.json`; unused dependencies pulled in only by the deleted files (`axios`, `cookie`, `jose`, `drizzle-orm`, `drizzle-kit`, `mysql2`, `@aws-sdk/*`) removed too.

**Verified**, not assumed: `pnpm install`, `pnpm run check` (tsc), `pnpm test` (9/10 — the 10th, `legacyApi.health.test.ts`, does a live network call to the Render backend and can only run somewhere with a route to `onrender.com`), `pnpm run build`, and both `pnpm run dev` and `NODE_ENV=production node dist/index.js` were run end-to-end against a real HTTP server before this was committed. That process caught two real bugs, both fixed:

1. **Static file path was wrong in production.** esbuild bundles `server/_core/index.ts` to a flat `dist/index.js` (no `_core/` nesting survives), so `__dirname` at runtime is `dist/` itself — the code was resolving `dist/../public` (project root, wrong) instead of `dist/public` (where Vite actually writes the build). `GET /` 404'd until fixed.
2. **Vite's dev middleware wasn't loading the project's aliases.** Passing an inline `root` to `createServer()` without an explicit `configFile` silently failed to pick up `vite.config.ts`'s `resolve.alias` (`@`, `@shared`) — every import in dev mode failed with "Failed to resolve import". Fixed by pointing `configFile` at the real `vite.config.ts` explicitly.

## Care Connections — shared-history is wired up, not just documented

The former `FamilyManager.tsx`/`LinkPatientModule` (two separate nav items: "Family circle" and "Link a patient") is now `CareConnections.tsx`, one merged "Care Connections" nav item. The old copy said, verbatim, *"the current AgeCare backend supports linking a patient but does not provide a permissioned endpoint for a caregiver to read that patient's check-ins"* — that was already false by the time this redesign was exported (see `routes/careAccess.js`/`services/careAccess.js` at the repo root: a scoped, auditable, expiring consent-grant flow). The new component:

- Separates **Family contacts** (an address book, no permissions) from **Care Access** (the actual permission system) with plain-language explanations of the difference, instead of one flat list.
- A single "Connect with someone" form both adds a contact *and* fires a care-access request in one step (`server/routers.ts` → `legacy.careAccess.requestAccess`, proxying `POST /care-access/requests`).
- Patient-side: incoming requests can be approved (with a 1/7/30/90-day duration picker, matching the backend's `expires_in_days` contract) or declined; active grants you've given out can be removed — all via `legacy.careAccess.{incomingRequests,approveRequest,revokeGrant,patientGrants}`.
- Caregiver-side: every patient who has approved you is listed with their expiry, and "View shared check-ins" expands their scoped history inline via `legacy.careAccess.sharedHistory` → `GET /care-access/grants/:grantId/checkins`. The backend only allows the *patient* side of a grant to revoke it, so no (misleading, always-failing) "remove access" control is shown on this side.

## Reminders — real ringing push notifications, not just an on-screen badge

The bell icon (top right) opens a **Reminders** panel (`client/src/components/ReminderSettings.tsx`)
that turns on real Web Push for the signed-in member's device: a daily
check-in nudge at a time they choose, a ping at each medication's scheduled
time, a heads-up 2 hours before each appointment, and a warning as a
prescription's `end_date` approaches. The backend side
(`services/pushNotifications.js`, `services/reminderScheduler.js`,
`routes/push.js` at the repo root) checks every minute and dedupes so each
reminder fires once (per local day for check-in/medication/renewal, once per
appointment for the appointment reminder), in the member's own timezone.

- **While the app is open**, a reminder marked urgent (check-in, medication
  due — not the appointment heads-up or the renewal warning, both
  informational) is relayed from
  `client/public/sw.js` to the open tab via `postMessage`, and
  `client/src/components/AlarmOverlay.tsx` shows a full-screen alert and
  rings a synthesized alarm tone (`client/src/lib/alarm.ts`, Web Audio
  oscillators — no audio file to host, for the same reason the images work
  self-hosted rather than depend on a CDN this session couldn't reach).
- **While the app is closed**, the OS/browser shows its own system
  notification with its own default sound — Web Push has no API to attach a
  custom sound to a background notification; that's a real platform
  limitation, not a shortcut taken here.
- This stays dormant (the panel shows "Reminders aren't set up on this
  server yet.") until the backend has VAPID keys configured. See
  `REMINDERS_SETUP.md` at the repo root for the one-time setup (generating
  the keys, which Render service they go on, and how to send yourself a
  test reminder to confirm the whole pipeline works).
- **A separate toggle below the reminder times**, "Notify my family if I
  miss a check-in", doesn't use push at all — it's email/SMS to whichever
  family contacts already have notifications turned on for them, sent if
  the resident hasn't checked in a few hours after their own reminder time.
  Off by default (an explicit, resident-controlled opt-in, consistent with
  Care Connections' consent model above) — the resident is always told too,
  right when it happens, never silently. See `REMINDERS_SETUP.md`'s
  "Notifying family when someone misses a check-in" section.

## Relation to the existing frontend and backend

- `agecare-frontend-main/` (repo root) remains the current, deployed frontend. This redesign is additive, not a replacement — nothing here changes what ships today.

## Post-export activity not reflected in this snapshot

`todo.md` in this directory is a full activity log from the Manus session, not just the portion that shaped this export. Everything from "Family Circle Contact Loading" onward happened **after** this zip was captured, and confirms that Manus was iterating directly on this backend repository — its checklist items line up commit-for-commit with `git log` on `main` here (e.g. "Confirm the backend deployment reaches the live state on commit 5d4a1d7" → `5d4a1d7 Add durable account roles and family linking safeguards`; "Confirm the Render service is running commit c80bd91" → `c80bd91 Fix backend CI test command`), and its section titles match this repo's own root-level docs (`PERSISTENT_DATABASE_MIGRATION_GUIDE.md`, `RENDER_POSTGRESQL_ROLLOUT.md`, `MULTI_CLIENT_DEPLOYMENT.md`, `SHARED_HISTORY_IMPLEMENTATION_GUIDE.md`, `DEPLOYMENT_SHARED_HISTORY.md`, `POSTGRESQL_QUERY_AUDIT.md`, `POSTGRESQL_MIGRATION_MATRIX.md`).

Since that work landed on the backend, **not** on the frontend code exported into this directory, none of it is reflected here. In particular:

- The backend migrated to PostgreSQL and moved to a Render service the log calls `agecare-backend-2` (see `RENDER_POSTGRESQL_ROLLOUT.md`, which names `agecare-backend-2` as the live PostgreSQL-backed web service).
- Patient-controlled consent expiry, corrected shared-history status messaging, family-link removal, and password-confirmed account closure all landed on the backend after this export.
- Two items were still open (unchecked) as of this import: a request to export the full chat transcript as a ZIP (out of scope here — no such transcript is accessible from this session either), and a "Care Connections" simplification of the Family Circle/patient-linking UX. The second one **has** been actioned here — see "Care Connections" above.

**Resolved:** this redesign's `server/legacyApi.ts` fallback, and this repo's currently-deployed frontend (`agecare-frontend-main/src/api.js`), both previously hardcoded `https://agecare-backend-c8uq.onrender.com/api` — the *old* service name from before the PostgreSQL migration. Confirmed via the Render dashboard (service `agecare-backend-2`, connected to `mennaelammal-prog/agecare-backend` `main`, running commit `b8af358` with the PostgreSQL adapter configured and the service marked live) that `agecare-backend-2` is the authoritative backend. Both URLs have been updated to `https://agecare-backend-2.onrender.com/api` accordingly.

## Environment variables referenced by this project

- `AGECARE_LEGACY_API_URL` — base URL of the AgeCare REST API this proxies to (defaults to the live Render deployment).
- `VITE_FRONTEND_FORGE_API_KEY` — used by `client/src/components/Map.tsx` (Manus's Forge maps proxy), which isn't wired into `Home.tsx`; not required unless that component is used.

No credentials, tokens, or `.env` files were present in the imported zip.

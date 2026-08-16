# AgeCare — Wellbeing Redesign ("Heirloom Journal")

A ground-up frontend redesign of the AgeCare experience, generated with Manus and imported here from an exported project zip. It is a **separate client application** that talks to this repository's existing REST API — it does not replace or modify `server.js`/`routes/*` in the backend root, and it is not wired into the deploy pipeline by this import.

## What this is

- **Design system:** "Heirloom Journal" — an editorial, high-contrast, low-clutter layout aimed at older adults and family caregivers (parchment surfaces, deep ink text, a verdigris accent, DM Serif Display for reflective content, Plus Jakarta Sans for UI/health data). See `ideas.md` and `redesign_prompt.md` for the full design brief.
- **Stack:** React 19 + Vite 7 + TypeScript, Tailwind v4, shadcn/ui (Radix primitives), tRPC, `wouter` for routing.
- **How it reaches this backend:** `server/legacyApi.ts` proxies every AgeCare API call through a thin Express/tRPC server. It targets `AGECARE_LEGACY_API_URL`, falling back to the live deployment at `https://agecare-backend-c8uq.onrender.com/api` (this repo's Render deployment) if unset.
- **Pages/components of note:** `client/src/pages/Home.tsx` (the "Today" experience), `client/src/components/LegacyCareModules.tsx` (medications/appointments/vitals), `client/src/components/AIChatBox.tsx` (Care Chat), `client/src/components/FamilyManager.tsx` (family contacts/linking).

## ⚠️ Known gap: this export is not build-ready as-is

The zip this was imported from is a **Manus WebDev project export**, which only contains user-authored files — it does not include the platform-managed runtime scaffold. Concretely, `npm install && npm run dev` will fail out of the box because:

- `server/routers.ts`, `server/db.ts`, and `server/storage.ts` import from `./_core/env`, `./_core/cookies`, `./_core/systemRouter`, `./_core/trpc` — **none of these exist in this export.** They're Manus-platform-injected modules (session/cookie handling, the base tRPC router, environment resolution).
- `package.json`'s `dev`/`build` scripts point at `server/_core/index.ts`, which is likewise absent.
- `vite.config.ts` depends on `vite-plugin-manus-runtime`, a Manus-proprietary Vite plugin.
- `server/db.ts` imports `../drizzle/schema` (a generated Drizzle schema for a **separate** MySQL "platform users" table used by Manus's own auth — unrelated to this repo's `users` table) which is also not present.

None of this is needed for the actual AgeCare integration — every real data call goes through `server/legacyApi.ts` to this repo's REST API, not through Drizzle/MySQL. To make this buildable outside Manus, the practical path is:

1. Replace the `_core` tRPC/session scaffold with a plain Express server (the app already has one hand-rollable in `server/index.ts`'s template form) or re-implement the small pieces actually used: a cookie-backed session for the tRPC context, and a minimal `router`/`publicProcedure` from `@trpc/server`.
2. Drop `server/db.ts`, `server/storage.ts`, and `drizzle.config.ts` unless you want Manus's built-in file storage/auth — they're not part of the AgeCare data flow.
3. Remove `vite-plugin-manus-runtime` from `vite.config.ts` and `package.json`.

This has **not** been done as part of this import — the files are preserved exactly as exported so nothing is guessed or fabricated on Manus's behalf. Treat this directory as a design/component reference and a working proxy contract (`server/legacyApi.ts`, `server/routers.ts`) rather than a deployable app until the above is addressed.

## Relation to the existing frontend and backend

- `agecare-frontend-main/` (repo root) remains the current, deployed frontend. This redesign is additive, not a replacement — nothing here changes what ships today.
- The redesign's own audit (`todo.md`) flags that "the existing history route returns check-ins only for the signed-in user" and that family linking has no endpoint for a caregiver to read a linked patient's history. **That gap is already partially closed in this backend**: see `routes/careAccess.js` and `services/careAccess.js` — a scoped, auditable, expiring consent-grant flow (`POST /care-access/requests`, `POST /care-access/:grantId/approve`, `GET /care-access/grants/:grantId/checkins`) already exists for exactly this purpose. The redesign's `server/routers.ts` `legacy.*` procedures don't yet call these endpoints — wiring `FamilyManager.tsx`/`LegacyCareModules.tsx` to the grant-based history endpoint instead of assuming it doesn't exist is the next real integration step, and it lines up with the "Nominee/General Carer" access model in `docs/AUSTRALIAN_AGED_CARE_ARCHITECTURE.md` (Section 1.3/1.6) at the repo root.

## Post-export activity not reflected in this snapshot

`todo.md` in this directory is a full activity log from the Manus session, not just the portion that shaped this export. Everything from "Family Circle Contact Loading" onward happened **after** this zip was captured, and confirms that Manus was iterating directly on this backend repository — its checklist items line up commit-for-commit with `git log` on `main` here (e.g. "Confirm the backend deployment reaches the live state on commit 5d4a1d7" → `5d4a1d7 Add durable account roles and family linking safeguards`; "Confirm the Render service is running commit c80bd91" → `c80bd91 Fix backend CI test command`), and its section titles match this repo's own root-level docs (`PERSISTENT_DATABASE_MIGRATION_GUIDE.md`, `RENDER_POSTGRESQL_ROLLOUT.md`, `MULTI_CLIENT_DEPLOYMENT.md`, `SHARED_HISTORY_IMPLEMENTATION_GUIDE.md`, `DEPLOYMENT_SHARED_HISTORY.md`, `POSTGRESQL_QUERY_AUDIT.md`, `POSTGRESQL_MIGRATION_MATRIX.md`).

Since that work landed on the backend, **not** on the frontend code exported into this directory, none of it is reflected here. In particular:

- The backend migrated to PostgreSQL and moved to a Render service the log calls `agecare-backend-2` (see `RENDER_POSTGRESQL_ROLLOUT.md`, which names `agecare-backend-2` as the live PostgreSQL-backed web service).
- Patient-controlled consent expiry, corrected shared-history status messaging, family-link removal, and password-confirmed account closure all landed on the backend after this export.
- Two items in the log are still open (unchecked) as of this import: a request to export the full chat transcript as a ZIP, and a "Care Connections" simplification of the Family Circle/patient-linking UX — neither has been actioned here.

**A concrete, verifiable discrepancy worth resolving:** this redesign's `server/legacyApi.ts` fallback, and this repo's own currently-deployed frontend (`agecare-frontend-main/src/api.js`), both still hardcode `https://agecare-backend-c8uq.onrender.com/api` — the *old* service name from before the PostgreSQL migration. `RENDER_POSTGRESQL_ROLLOUT.md` names `agecare-backend-2` as the service that actually holds the migrated PostgreSQL data. If `agecare-backend-2` is the service in current use, both frontends are pointed at a stale (and possibly SQLite-backed, non-durable) backend. This wasn't changed as part of this import since it affects what a live, deployed frontend talks to — confirm which Render service is authoritative before updating `AGECARE_LEGACY_API_URL` here and the `API_URL` constant in `agecare-frontend-main/src/api.js`.

## Environment variables referenced by this project

- `AGECARE_LEGACY_API_URL` — base URL of the AgeCare REST API this proxies to (defaults to the live Render deployment).
- `DATABASE_URL` — only relevant if you keep `server/db.ts`'s Manus-auth MySQL table; not required for the AgeCare integration itself.
- `VITE_FRONTEND_FORGE_API_KEY` — used by `client/src/components/Map.tsx` (Manus's Forge maps proxy); not required unless that component is kept.

No credentials, tokens, or `.env` files were present in the imported zip.

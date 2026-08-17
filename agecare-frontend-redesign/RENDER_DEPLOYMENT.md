# Deploying agecare-frontend-redesign to Render

This runbook creates a live URL for the Care Connections redesign. It has never been deployed anywhere — `pnpm run build && pnpm start` was only ever run inside this session to verify the app works (see `README.md`), not against a real hosting service. Follow this to actually open it in a browser.

> No credentials for any hosting provider were available in the session that wrote this doc, so this deployment could not be created automatically — it needs to be done from the Render dashboard, the same way `agecare-backend-2` and the existing frontend were set up.

## Step 1 — Create the web service

In the Render Dashboard: **New → Web Service**, connect the `mennaelammal-prog/agecare-backend` repository, branch `main`.

| Setting | Value |
|---|---|
| **Name** | `agecare-frontend-redesign` (or your preference) |
| **Root Directory** | `agecare-frontend-redesign` |
| **Runtime** | Node |
| **Build Command** | `pnpm install --frozen-lockfile && pnpm run build` |
| **Start Command** | `pnpm start` |
| **Instance Type** | Free is fine to preview; the app is stateless (no database of its own) |

Don't prefix the build command with `corepack enable &&` — Render's Node build image ships `pnpm` pre-installed at `/usr/bin/pnpm`, and `corepack enable` tries to relink that same path, which fails with `EROFS: read-only file system` because that path isn't writable in the build image. `pnpm` is already on `PATH` without it.

`.node-version` in this directory is pinned to 22, but in practice Render's Node-version detection did not pick it up when this directory is set as a non-root "Root Directory" — it defaulted to its current latest instead. Nothing here requires a specific Node version below that, so there's no need to fight it; if you do want the pin honored, set `NODE_VERSION` directly as an environment variable on the service instead (see Step 2).

## Step 2 — Environment variables

| Variable | Value | Notes |
|---|---|---|
| `NODE_ENV` | `production` | Selects the static-file-serving code path in `server/_core/index.ts` |
| `AGECARE_LEGACY_API_URL` | `https://agecare-backend-2.onrender.com/api` | Points at the live, PostgreSQL-backed backend. Leaving this unset falls back to the same URL (see `server/legacyApi.ts`), but setting it explicitly avoids depending on that default staying correct. |

`PORT` does not need to be set — Render injects it automatically and the server already reads `process.env.PORT`.

## Step 3 — Verify after deploy

1. Open the service's Render-assigned URL. You should see the "Heirloom Journal" AgeCare landing page (parchment background, verdigris accents), not a 404 or blank page.
2. Open browser dev tools → Network, and confirm `/api/trpc/system.health` returns `{"result":{"data":{"json":{"status":"ok",...}}}}` — this exercises the tRPC server without touching the AgeCare backend.
3. Click "Connect AgeCare" and sign in with a real (non-production-critical) AgeCare account. If this fails, check the service logs for the actual error `legacyApi.ts` surfaced from the backend, and confirm `agecare-backend-2`'s CORS/allowed-origins config (`server.js` at the repo root) doesn't need this new origin added — it shouldn't, since all AgeCare calls are server-to-server from *this* service to the backend, not browser-to-backend.
4. Open **Care Connections** and confirm the merged Family contacts / Care Access view loads (see `README.md` → "Care Connections" for what changed there).
5. Click the bell icon (top right). If it shows "Reminders aren't set up on this server yet.", that's expected until the *backend* service (`agecare-backend-2`, not this one) has VAPID keys configured — see `REMINDERS_SETUP.md` at the repo root. Nothing needs to be set on this frontend service for reminders; the toggle just stays dormant until the backend is ready.

## If you'd rather I drive this myself

I don't hold Render API credentials in this session, so I can't create or configure the service directly. If you want me to do this end-to-end instead of following the steps above, the practical options are:
- Share a Render API key as an environment variable for this session (scoped to what's needed, revoked after), or
- Connect a Render MCP/CLI integration to this session, if one becomes available.

Either way, tell me once the service exists (its URL is enough) and I can verify it, debug failures from the logs, or make further code changes against it.

# Persistent Database Configuration for AgeCare

## Recommendation

Use **PostgreSQL with the Express backend hosted on Render**. The current AgeCare model is relational: users own check-ins, medications, appointments, vitals, family contacts, care-access grants, and access-audit events. The consent workflow relies on foreign keys, unique caregiver–patient relationships, transactions, and auditable lifecycle state. PostgreSQL maps directly to that model and is the lower-risk migration.

> Keep the current Express backend on **Render** and attach **Render Postgres** in the same region. Keep the public frontend on Vercel. The Vercel frontend should call the Render API; it does not need direct database credentials.

| Option | Fit for current AgeCare backend | Main reason |
|---|---|---|
| Render web service + Render Postgres | **Recommended** | Keeps the Express `app.listen()` backend model, offers managed relational storage, and can use an internal database URL. [1] |
| Vercel frontend + external Postgres provider | Suitable for the frontend or a refactored serverless backend | Vercel currently connects new projects to external Postgres providers through Marketplace integrations; Vercel Postgres is no longer available for new projects. [2] |
| Render web service + MongoDB Atlas | Possible, but not preferred | Requires rewriting relational queries and access-grant enforcement around documents and indexes. [3] |
| Vercel + MongoDB Atlas | Possible for a serverless rewrite | Atlas can inject `MONGODB_URI`, but Vercel’s dynamic IPs require careful network-access consideration. [4] |

## Important hosting distinction

The current backend starts with `node server.js` and calls `app.listen()`. That is a good fit for a long-running Render web service. Do **not** move this Express server unchanged to Vercel. Vercel is appropriate for the frontend and for serverless handlers after a deliberate refactor, not for the existing always-listening server entry point.

## Recommended architecture: Vercel frontend + Render API + Render Postgres

```text
Browser
  │ HTTPS
  ▼
Vercel frontend ── HTTPS /api ──► Render Express API ── private/internal connection ──► Render Postgres
```

The public frontend knows only the API origin, such as `VITE_API_URL=https://api.example.com/api`. The database URL belongs only to the Render API service. Never place `DATABASE_URL`, database passwords, or a MongoDB URI in a `VITE_*` variable or any browser-visible configuration.

## Configure Render Postgres

Create the database and web service in the same Render region. Render documents managed Postgres creation, internal/external connections, and its managed storage model in its Postgres guide.[1]

1. In Render, select **New → Postgres**. Choose a region that matches the current Render API service.
2. Create the database and wait for it to become available.
3. In the Render backend service, add a server-only environment variable named `DATABASE_URL`. Set it from the database’s **internal** connection URL or Render’s database environment-variable binding.
4. Add or confirm the server-only variables `JWT_SECRET` and `CORS_ALLOWED_ORIGINS`. Set `CORS_ALLOWED_ORIGINS` to exact frontend origins, separated by commas; do not use `*` when authenticated browser requests are involved.
5. Keep `VITE_API_URL` in the Vercel frontend set only to the public Render API URL. Do not set `DATABASE_URL` in Vercel when Vercel hosts only the frontend.

## Replace SQLite in the Node backend

This is an application migration, not only a hosting change. The current code uses `sqlite3` callbacks and SQLite `?` placeholders. PostgreSQL uses a connection pool and `$1`, `$2` placeholders. Do not attempt to point the existing SQLite code at a Postgres URL.

Install the PostgreSQL client and a real migration tool:

```bash
npm install pg node-pg-migrate
```

Create a database module similar to this:

```js
// db/postgres.js
const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required for the persistent database');
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function query(text, params = []) {
  return pool.query(text, params);
}

async function withTransaction(work) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { pool, query, withTransaction };
```

Then migrate route code in small, testable increments. For example, a SQLite query such as `SELECT * FROM checkins WHERE user_id = ?` becomes `SELECT ... FROM checkins WHERE user_id = $1`. Replace callback-based `db.get`, `db.all`, and `db.run` helpers with `await query(...)`, and wrap access-grant approval/revocation plus their audit insert in a single transaction.

## PostgreSQL schema mapping

Use a migration tool to create the schema. The following model preserves the current AgeCare entities while using PostgreSQL types and constraints.

| SQLite table | PostgreSQL design |
|---|---|
| `users` | `BIGINT GENERATED ALWAYS AS IDENTITY` primary key; unique email; password hash; name; optional phone/date of birth; `TIMESTAMPTZ` timestamps. |
| `checkins` | Foreign key to `users`; `SMALLINT` mood/energy/pain with checks; `NUMERIC` sleep hours; notes and AI response text; `TIMESTAMPTZ`. |
| `medications` | Foreign key to `users`; `BOOLEAN is_active`; date fields as `DATE`; timestamps as `TIMESTAMPTZ`. |
| `appointments` | Foreign key to `users`; `appointment_at TIMESTAMPTZ`; use a named column rather than a local-time string. |
| `vitals` | Foreign key to `users`; numeric fields; `recorded_at TIMESTAMPTZ`. |
| `family_contacts` | Foreign key to owner; optional `linked_user_id`; notification preferences as booleans. |
| `care_access_grants` | Pair of foreign keys to patient and caregiver; unique patient–caregiver pair; enum/check status; `JSONB` scopes; expiry/revocation fields. |
| `care_access_audit` | Metadata-only access audit; foreign keys to grant/actor/patient; indexed by patient and timestamp. |

Example grant migration:

```sql
CREATE TABLE care_access_grants (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  patient_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  caregiver_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  relationship TEXT,
  status TEXT NOT NULL CHECK (status IN ('pending', 'active', 'denied', 'revoked', 'expired')),
  requested_scopes JSONB NOT NULL DEFAULT '["checkins:read"]'::jsonb,
  granted_scopes JSONB,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  granted_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  revoked_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (patient_user_id, caregiver_user_id)
);

CREATE INDEX care_access_grants_caregiver_active_idx
  ON care_access_grants (caregiver_user_id, status);
```

## Safely migrate existing SQLite data

Perform the migration in a staging copy before touching production data.

1. Stop writes briefly or place the old API in maintenance mode.
2. Copy and retain the SQLite file as an encrypted, read-only rollback artifact.
3. Run the PostgreSQL schema migrations on the new database.
4. Export tables in parent-before-child order: `users`, `family_contacts`, care records, grants, and audit data.
5. Import in the same order while preserving legacy integer IDs, then reset PostgreSQL sequences to `MAX(id)`.
6. Validate table counts, user emails, foreign-key integrity, active grant counts, and a sample of record timestamps.
7. Switch `DATABASE_URL`, deploy the Postgres-aware backend, and run the ordinary health plus care-access authorization tests with disposable accounts.
8. Keep the SQLite rollback artifact until the agreed retention window ends; do not keep it in the application repository or a public bucket.

## MongoDB Atlas alternative

Choose MongoDB only if flexible, document-shaped records outweigh relational consistency. For this application, that trade-off is weak: access grants and their audits should remain transactional and relational. If you select MongoDB, model `users`, `checkins`, `medications`, `appointments`, `vitals`, `familyContacts`, `careAccessGrants`, and `careAccessAudit` as separate collections. Add compound indexes such as `{ patientUserId: 1, caregiverUserId: 1 }` for grants and `{ userId: 1, createdAt: -1 }` for check-ins. Use MongoDB transactions for patient approval/revocation plus audit creation.

MongoDB Atlas’s Vercel integration can provision resources and inject a server-only `MONGODB_URI` into Vercel environments, but its integration documentation explains that Vercel uses dynamic IPs and may require an all-address access-list entry.[4] For sensitive care data, treat that as a security review point, not a convenience default. For Render, Atlas recommends matching the database region to the Render service and allowlisting the service’s outbound addresses.[3]

## Verification checklist

| Check | Expected result |
|---|---|
| Render API health | `GET /api/health` responds successfully after the Postgres deployment. |
| Database migration | Migration ledger is current and all expected tables/indexes exist. |
| Connection secrecy | `DATABASE_URL` appears only in Render server settings; it is absent from Vercel browser variables and Git history. |
| Shared history | A pending grant returns `403`; patient approval enables only `checkins:read`; revocation returns the caregiver to `403`. |
| Vercel | Browser requests go to the public Render API; no database request or database credential reaches the browser. |
| Recovery | A restore test can recover a staging database backup and preserve grants and audit data. |

## References

[1] [Create and Connect to Render Postgres](https://render.com/docs/postgresql-creating-connecting)

[2] [Postgres on Vercel](https://vercel.com/docs/postgres)

[3] [Connecting to MongoDB Atlas on Render](https://render.com/docs/connect-to-mongodb-atlas)

[4] [MongoDB Atlas Vercel Integration](https://www.mongodb.com/docs/atlas/reference/partner-integrations/vercel/)

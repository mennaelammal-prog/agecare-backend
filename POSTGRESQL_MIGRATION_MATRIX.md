# PostgreSQL Migration Matrix

## Adapter rule

Every route and service receives the database through `getDb()`. When `DATABASE_URL` is set without `AGECARE_DB_PATH` or `DB_PATH`, `PostgresCompatDatabase` retains the same `get`, `all`, `run`, and `exec` callback contract used by the existing route code. It changes `?` bindings to `$1…$n`, changes `datetime('now')` to `CURRENT_TIMESTAMP`, and returns generated insert IDs through `this.lastID`.

## Schema and startup migration matrix

| SQLite artifact | PostgreSQL equivalent | Location |
|---|---|---|
| `users` plus startup `name`, `role`, `updated_at`, reset columns | Complete `users` table with identity ID, case-insensitive email index, role constraint, timestamps, and recovery columns | `database/postgresSchema.js` |
| `checkins` and user index | `checkins` with foreign key, care-value checks, timestamp, user/time index | `database/postgresSchema.js` |
| `medications` and user index | `medications` with retained `is_active` API flag and user index | `database/postgresSchema.js` |
| `appointments` and user index | `appointments` with `is_active`, timestamp, and user/date index | `database/postgresSchema.js` |
| SQLite `vitals` schema versus route `vital_signs` | `vital_signs`, matching the active route name, with user/time index | `database/postgresSchema.js` |
| `family_contacts` and family migrations | Complete contact/link/notification fields, owner and linked-user references, active/link indexes | `database/postgresSchema.js` |
| Care access migration tables and indexes | `care_access_grants`, `care_access_audit`, scopes/status fields, uniqueness, and indexes | `database/postgresSchema.js` |
| Chat route dependency | `chat_history` with user foreign key and timestamp | `database/postgresSchema.js` |
| Notification service dependency | `notification_log` with contact/check-in references, retry state, and index | `database/postgresSchema.js` |

## API and service query matrix

| Module | Query operations | PostgreSQL compatibility rationale |
|---|---|---|
| `middleware/auth.js` | Authenticated user and role lookup by ID | `?` becomes `$1`; role is returned from the durable `users` row. |
| `routes/auth.js` | Case-insensitive existing-user lookup, insert, login lookup, profile lookup | `LOWER()` is portable; insert gets `RETURNING id`; SQLite timestamp expression is normalized. |
| `routes/checkin.js` | Check-in insert and own-history list with limit | Bindings and generated ID adapt; `LIMIT` accepts a PostgreSQL binding. |
| `routes/family.js` | Contact insert, active list, soft delete | Bindings adapt; numeric notification flags are preserved for API compatibility. |
| `routes/familyLink.js` | Caregiver role lookup, case-insensitive patient lookup, existing-link lookup, link insert, linked-patient join | `LOWER`, joins, and bindings are portable; insert ID adapts. |
| `routes/medications.js` | Create, update, list active, soft delete | Bindings adapt; `is_active` remains route-compatible. |
| `routes/appointments.js` | Create, update, list active, soft delete | Bindings adapt; schema adds the route-required active field. |
| `routes/vitals.js` | Create, update, list by timestamp, delete | Bindings adapt; PostgreSQL schema uses `vital_signs` to match routes. |
| `routes/chat.js` | Conversation inserts and bounded history reads | Bindings adapt; schema includes model/token metadata used by inserts. |
| `routes/careAccess.js` | Patient lookup, grant request/update/list/approve/revoke, bounded check-in reads | Bindings adapt; current `CURRENT_TIMESTAMP` SQL is already portable. |
| `services/careAccess.js` | Grant authorization lookup and audit insertion | Its `getRow`/`getAll`/`run` wrappers continue to call the adapter’s callback API. |
| `services/notification.js` | Notification queue insert, contact join, retry update, active-contact list | Bindings adapt; `datetime('now')` becomes `CURRENT_TIMESTAMP`; `notification_log` is included. |
| `migrations/familyContacts.js`, `migrations/careAccess.js` | SQLite-specific table/column repair statements | Run only on SQLite. PostgreSQL starts from the complete idempotent schema instead. |

## Explicit non-goals

The migration does not automatically transfer data from an existing SQLite file. Production data transfer requires owner-controlled export/import, preserved IDs, sequence reset, count and foreign-key checks, and a secured rollback artifact.

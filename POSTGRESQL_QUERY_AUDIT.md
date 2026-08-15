# AgeCare PostgreSQL Query Audit

## Scope

The backend keeps its existing Express route contract and callback-oriented `getDb()` surface. When `DATABASE_URL` is set and no explicit SQLite path is supplied, `database/postgresAdapter.js` supplies that surface through a PostgreSQL pool. It converts positional SQLite `?` parameters to PostgreSQL `$1`, `$2`, and converts the remaining SQLite timestamp expression `datetime('now')` to `CURRENT_TIMESTAMP`.

## Route and service coverage

| Area | Route/service | Database operations | PostgreSQL handling |
|---|---|---|---|
| Authentication | `routes/auth.js` | User lookup, account insert, profile lookup | Placeholder conversion; `datetime('now')` conversion; role persisted in `users.role`. |
| Session enforcement | `middleware/auth.js` | User and role lookup | Placeholder conversion; role is read from the durable user row. |
| Daily care | `routes/checkin.js` | Insert and history reads | Placeholder conversion; generated IDs are returned through adapter `lastID`. |
| Family contacts | `routes/family.js` | Insert, list, soft-delete | Placeholder conversion; numeric notification flags retained for backward-compatible API responses. |
| Patient linking | `routes/familyLink.js` | Role lookup, case-insensitive patient lookup, link insert/list | Placeholder conversion; caregiver role is enforced server-side. |
| Medications | `routes/medications.js` | CRUD and soft-delete | Placeholder conversion; `is_active` is mapped as a small integer for existing route compatibility. |
| Appointments | `routes/appointments.js` | CRUD and soft-delete | Placeholder conversion; `appointment_date` is `TIMESTAMPTZ` in PostgreSQL. |
| Vital signs | `routes/vitals.js` | CRUD/history | Placeholder conversion; schema uses the route’s actual `vital_signs` table name. |
| Care chat | `routes/chat.js` | Chat history inserts/history reads | Placeholder conversion; `chat_history` is present in the PostgreSQL schema. |
| Consent access | `routes/careAccess.js`, `services/careAccess.js` | Grants, approvals, revocations, shared check-in reads, audit inserts | Placeholder conversion; grant and audit tables, uniqueness, and required indexes are created in the schema. |
| Notifications | `services/notification.js` | Notification queue insert, joins, retry updates | Placeholder and timestamp conversion; `notification_log` is present in the PostgreSQL schema. |

## Schema and migration contract

`database/postgresSchema.js` creates the account, care, Family Circle, consent/audit, chat, and notification tables plus their indexes with `CREATE ... IF NOT EXISTS`. PostgreSQL startup runs that schema before accepting requests. SQLite startup continues to run the existing `schema.sql` and idempotent `ALTER TABLE` migrations when an explicit local database path is supplied.

## Deliberate limitations

This adapter does not copy production SQLite data automatically. A production transfer requires a planned export/import, preserved identifiers, sequence reset, count/foreign-key validation, and a rollback artifact. It must be performed by the service owner using a secure database connection and should not be attempted through browser forms or chat.

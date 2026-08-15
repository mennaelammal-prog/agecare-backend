# AgeCare Multi-Client Deployment Contract

## Why accounts appeared to disappear

The active backend is the root `server.js` service and its database module uses SQLite. If `AGECARE_DB_PATH` or `DB_PATH` is not configured, it falls back to `agecare.db` inside the application directory. On a hosting service with an ephemeral filesystem, a restart or redeploy can replace that file. The API can then report that an email is already registered in one browser session while a previously issued token returns `User no longer exists` after the database has been replaced or restored inconsistently.

## Required Render configuration

For a single-instance Render deployment, attach a persistent disk and set `AGECARE_DB_PATH` to a file on that disk, for example `/var/data/agecare.db`. The disk mount path must exist before the service starts. Redeploy only after confirming the disk is attached. The `/api/health` response now exposes only a boolean `database.persistentStorageConfigured` indicator; it never exposes the database path or any records.

For multiple instances, autoscaling, or a higher-volume production service, use a managed PostgreSQL database and migrate the schema and data before switching traffic. SQLite on one persistent disk is not a multi-instance database architecture and should not be used when multiple backend instances may write concurrently.

## Account and linking semantics

A caregiver must sign in with the caregiver’s own registered AgeCare account. The patient-link form must receive the patient’s separately registered email address. Linking the caregiver’s own email is rejected with an explicit explanation. A successful link creates a relationship record; it does not independently grant access to the patient’s care history. Shared-history access remains governed by the consent-based care-access grants and scopes.

## Safe verification sequence

After configuring persistent storage and redeploying, call `/api/health` without credentials and confirm `database.persistentStorageConfigured` is `true`. Register two non-production accounts using separate addresses, sign in as the caregiver, enter the patient’s registered email in Link a patient, and confirm the link appears after a fresh browser reload. Do not use real patient records for deployment testing, and do not share passwords or bearer tokens in support messages.

# AgeCare Managed PostgreSQL Rollout

## Purpose

This runbook replaces the ephemeral SQLite database used by the current Render Free web service with managed PostgreSQL. It is the required durability change for multi-client accounts, Family Circle links, consent grants, and audit records.

> Do not paste a database URL, password, access token, or patient data into chat, screenshots, or browser forms outside the Render environment-variable field.

## Choose the database tier before creating it

Render Free Postgres is acceptable only for a short-lived technical test. It has 1 GB of storage, expires after 30 days, has no backups, and is not recommended for production applications. For an AgeCare service intended for many clients, choose a paid Render Postgres instance with a retention and backup plan appropriate to the organization’s privacy and operational requirements.[1] [2]

| Use case | Database choice | Result |
|---|---|---|
| Brief proof-of-connection test | Render Free Postgres | Works for testing; expires after 30 days and has no backups. |
| Live multi-client care application | Paid Render Postgres | Durable managed relational storage with paid-database recovery features. |

## Step 1 — Create the PostgreSQL database

In the Render Dashboard, select **New → Postgres**. Name it `agecare-postgres` or a similarly clear service name. Select the **same region** as the `agecare-backend-2` web service; Render recommends same-region services so they can use the private network with lower latency.[1]

Choose the database tier selected above and create the service. Wait until the database status is **Available**.

## Step 2 — Copy the internal connection URL

Open the database’s **Connect** or **Info** page. Copy its **Internal Database URL**, not its external URL. Render provides the internal URL for services in the same region and account; it keeps the backend-to-database connection on Render’s private network.[1]

Do not place this value in the frontend, GitHub, a `VITE_*` environment variable, or chat.

## Step 3 — Configure the AgeCare backend environment

Open the `agecare-backend-2` Render web service, then open **Environment**. Add this server-only variable:

| Variable | Value |
|---|---|
| `DATABASE_URL` | The internal PostgreSQL URL copied in Step 2 |

Remove `AGECARE_DB_PATH` and `DB_PATH` if either is present. The backend deliberately chooses PostgreSQL only when `DATABASE_URL` is set and no SQLite path is configured.

Keep `JWT_SECRET` unchanged and private. Preserve the existing CORS configuration for the AgeCare frontend origin.

## Step 4 — Deploy the PostgreSQL-aware backend

Select **Manual Deploy → Deploy latest commit**. The required backend release is commit `5d4a1d7` plus the PostgreSQL migration commit created after this rollout preparation is pushed. Wait for the deployment to reach **Live**.

At startup, the backend automatically creates the PostgreSQL account, care-record, Family Circle, consent/audit, chat, and notification-log tables with idempotent `CREATE ... IF NOT EXISTS` statements. It does not log the connection URL.

## Step 5 — Verify the health contract

Open:

```text
https://agecare-backend-2.onrender.com/api/health
```

The expected response has these non-sensitive fields:

```json
{
  "status": "ok",
  "database": {
    "driver": "postgres",
    "persistentStorageConfigured": true,
    "connection": "ready"
  }
}
```

If `connection` is `unavailable`, check only that `DATABASE_URL` uses the **internal** URL, both services share a region, and no SQLite path variable remains. Do not share the URL itself.

## Step 6 — Existing SQLite data decision

The deployment does **not** automatically copy the old SQLite file. That avoids accidentally moving health or contact data through an unsafe path.

If the previous SQLite service was ephemeral, its records may already be unavailable after restarts; in that case, begin with a clean PostgreSQL database and register new accounts. If there is a known SQLite file with records that must be preserved, stop here and use a staged owner-controlled export/import: preserve parent-before-child IDs, import into a non-production database first, reset sequences, compare counts and foreign-key integrity, and retain an encrypted rollback artifact outside the repository.[3]

## Step 7 — Verify patient and caregiver flows with disposable accounts

Use two new non-production addresses. Create the patient account first, selecting **My own care**. Sign out. Create a different account for the family member, selecting **A family member or caregiver**.

While signed in to the caregiver account, select **Link a patient**, enter the patient account’s separate registered email, use **Find patient**, verify the returned identity, and select **Confirm link**. A patient account intentionally cannot link itself or another patient.

## Step 8 — Verify persistence and Family Circle

Refresh the browser, sign in again, and open **Family Circle**. It should load without the former contact-fetch failure and retain the confirmed link. Recheck `/api/health` only for the non-sensitive database status fields.

## References

[1] [Create and Connect to Render Postgres](https://render.com/docs/postgresql-creating-connecting)

[2] [Render Free Instance Limitations](https://render.com/docs/free)

[3] [AgeCare Persistent Database Migration Guide](./PERSISTENT_DATABASE_MIGRATION_GUIDE.md)

# Shared-History Deployment and Vercel Verification Runbook

## Deployment-ready changes

The backend now exposes consent-first care access under `/api/care-access`. It includes patient approval, scope-limited shared check-in reads, expiry and revocation, and metadata-only audit events. The backend start command now runs the complete root server (`node server.js`) rather than the incomplete `src/server.js` tree. Runtime dependencies used by the server, including `twilio` and `joi`, are declared in `package.json`.

## Before deployment

Run the following in the backend repository after reviewing the changes:

```bash
npm ci
npm test
```

The current test suite validates the migration schema, active grant policy, patient approval, unauthorized denial, scope-safe response fields, audit creation, and immediate revocation. It uses temporary SQLite databases and does not create or alter real care data.

Ensure the production service has a strong `JWT_SECRET`. Set `CORS_ALLOWED_ORIGINS` to any additional exact Vercel origin not already included in `server.js`, as a comma-separated list. The current code already includes these Vercel origins:

```text
https://family-care-chi.vercel.app
https://family-care-em3wyiw9e-family-care2.vercel.app
```

Do not put database URLs, password values, API tokens, or user bearer tokens into client-side Vercel variables.

> **Persistence check:** this backend currently stores data in a local SQLite file. Before deploying to an autoscaled or ephemeral host, attach a persistent disk or migrate the database to a managed database. Otherwise, care records and access grants may be lost when the service restarts or is redeployed.

## User-controlled deployment

Review and push the changed backend files to the repository connected to the backend host, then trigger the host’s normal deployment workflow. Do not deploy the `src/server.js` tree; `package.json` now intentionally starts `server.js` at repository root.

After the deployment becomes healthy, confirm:

```text
GET https://<backend-domain>/api/health
```

The response should be a JSON object containing `"status":"ok"`. Inspect backend logs once to confirm migration messages for the `care access grants` and `care access audit` tables.

## Vercel verification

The existing Vercel frontend can make calls to the new backend only after the deployed backend is reachable and its domain is configured as the frontend’s API base URL. The currently deployed frontend does not yet provide a complete consent-grant user interface, so use a controlled test environment or add that UI before asking real users to test the feature.

Use two disposable test accounts created through the normal app flow: a **patient** and a **caregiver**. Do not use real patient records. The verification sequence is:

| Step | Expected outcome |
|---|---|
| Caregiver requests `checkins:read` for the patient | `202`; no patient-account enumeration in the response. |
| Caregiver reads the grant before approval | `403`. |
| Patient views and approves the pending request | `200`; only the patient can approve. |
| Caregiver reads `GET /api/care-access/grants/:grantId/checkins` | `200`; only selected check-in fields are returned and `ai_response` is absent. |
| An unrelated account uses the same grant ID | `403`. |
| Patient revokes the grant | `200`. |
| Caregiver repeats the read | `403` immediately. |

In the Vercel browser network panel, confirm that requests originate from the Vercel domain, the backend returns CORS headers for that origin, and no authorization token appears in rendered page content, console logs, or query strings.

## Endpoint summary

| Endpoint | Caller | Purpose |
|---|---|---|
| `POST /api/care-access/requests` | Caregiver | Request a patient-approved `checkins:read` grant. |
| `GET /api/care-access/incoming` | Patient | List pending requests for the signed-in patient. |
| `POST /api/care-access/:grantId/approve` | Patient | Activate approved scopes and optional expiry. |
| `POST /api/care-access/:grantId/revoke` | Patient | Revoke pending or active access immediately. |
| `GET /api/care-access/grants` | Caregiver | List the caregiver’s active grants. |
| `GET /api/care-access/grants/:grantId/checkins` | Caregiver | Read scope-authorized patient history. |

## Production note

This is an implementation runbook, not legal advice. Before enabling shared care records for production users, complete applicable privacy, security, retention, incident-response, and legal review for the jurisdictions in which the service operates.

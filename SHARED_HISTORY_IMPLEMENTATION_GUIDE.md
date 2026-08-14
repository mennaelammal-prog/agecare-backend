# AgeCare Shared-History Endpoint: Consent-First Implementation Guide

## Purpose and current gap

The current AgeCare backend authenticates a user with a bearer JWT, then identifies that user through `req.userId`. The current `POST /api/family/link/link` route lets a family user create a `family_contacts` relationship with a patient, but it does so **without the patient approving access**. The existing `GET /api/checkin/history` route deliberately reads only rows where `checkins.user_id = req.userId`. Therefore, it is correct that a caregiver cannot presently read a linked patient’s history.

> **Do not treat `family_contacts.linked_user_id` as consent.** It is a relationship/contact record initiated by the caregiver, not an access grant made by the patient.

The recommended design is **relationship-based authorization with explicit, patient-controlled scopes**. Access must be denied unless a currently active grant explicitly authorizes the requested caregiver and resource. This aligns with OWASP guidance to use least privilege, deny by default, validate permissions on every request, and prefer relationship/attribute-based authorization for object-level access decisions.[1]

| Existing behavior | Why it is insufficient | Replacement |
|---|---|---|
| Caregiver links a patient by email | The patient does not affirm the relationship or choose what may be read. | Create a `pending` access request, then require the patient to approve it. |
| `family_contacts` stores contact and notification fields | `notify_email` and `notify_sms` concern message delivery, not data sharing. | Store authorization in dedicated grant and scope records. |
| `GET /checkin/history` filters by the caller’s `req.userId` | Correctly prevents cross-user reads, but cannot serve an authorized caregiver. | Add a separate grant-bound endpoint that verifies caregiver, status, expiry, and scope. |
| `SELECT * FROM checkins` | It returns more fields than a caregiver may need, including the AI response. | Return a minimal, scope-specific projection. |

## Consent and privacy policy

The patient must control whether history is shared. A caregiver may request access, but the server must place the request in `pending` state. Only the patient may grant, narrow, expire, or revoke it. Do not infer consent from email address matching, a family contact, notification preferences, or a UI checkbox selected by the caregiver.

| Rule | Required server behavior |
|---|---|
| Grantor | Only `patient_user_id` can approve or revoke that patient’s grant. |
| Grantee | Only the exact `caregiver_user_id` on the active grant can use it. |
| Scope | Start with `checkins:read`. Do not include write, medication, appointment, vitals, chat, or AI-response access by default. |
| Duration | Allow the patient to set an optional expiry. Treat missing expiry as a product decision; a short default with renewal is safer. |
| Revocation | Mark the grant `revoked` and reject it immediately on every later request. Do not cache authorization decisions in the client. |
| Least disclosure | Return only the requested, consented data fields. For the initial scope, omit `ai_response`. |
| Patient discovery | A request by email should return a generic accepted response; do not disclose whether the email belongs to a patient. |
| Auditability | Log successful reads, approvals, revocations, and denied attempts without writing medical content to the audit table. |

The design should record the requester, patient, action, grant ID, scope, timestamp, result, and request identifier. If the service is subject to HIPAA or another health-data regime, obtain legal and privacy review before production; HHS audit materials emphasize documented policies and evidence around privacy, security, and access decisions.[2]

## Recommended data model

Use a separate access-grant record rather than overloading `family_contacts`. The following SQLite schema supports an approval workflow, expiry, revocation, individual scopes, and immutable audit events.

```sql
CREATE TABLE IF NOT EXISTS care_access_grants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_user_id INTEGER NOT NULL,
  caregiver_user_id INTEGER NOT NULL,
  relationship TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK(status IN ('pending', 'active', 'denied', 'revoked', 'expired')),
  requested_scopes TEXT NOT NULL DEFAULT '["checkins:read"]',
  granted_scopes TEXT,
  requested_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  granted_at DATETIME,
  expires_at DATETIME,
  revoked_at DATETIME,
  revoked_by_user_id INTEGER,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(patient_user_id, caregiver_user_id),
  FOREIGN KEY(patient_user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(caregiver_user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(revoked_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_care_access_patient
  ON care_access_grants(patient_user_id, status);
CREATE INDEX IF NOT EXISTS idx_care_access_caregiver
  ON care_access_grants(caregiver_user_id, status);

CREATE TABLE IF NOT EXISTS care_access_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  grant_id INTEGER,
  actor_user_id INTEGER NOT NULL,
  patient_user_id INTEGER,
  action TEXT NOT NULL,
  scope TEXT,
  outcome TEXT NOT NULL CHECK(outcome IN ('allowed', 'denied', 'changed')),
  record_count INTEGER,
  request_id TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(grant_id) REFERENCES care_access_grants(id) ON DELETE SET NULL,
  FOREIGN KEY(actor_user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(patient_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_care_access_audit_patient
  ON care_access_audit(patient_user_id, created_at DESC);
```

Add a migration object to the existing `migrate.js` array, for example `create_care_access_grants_and_audit`. This preserves the project’s current migration ledger instead of changing a live database manually. Run it only after a database backup and a staging verification.

## Endpoint contract

Use a grant ID, not a raw `patientId`, when a caregiver reads history. This makes the relationship being relied on explicit and prevents a client from turning a guessed patient identifier into an authorization decision.

| Method and route | Caller | Purpose | Essential authorization |
|---|---|---|---|
| `POST /api/care-access/requests` | Caregiver | Ask a patient for one or more scopes. | Authenticated caller; generic response even if patient cannot be found. |
| `GET /api/care-access/incoming` | Patient | List the patient’s pending requests. | `patient_user_id = req.userId`. |
| `POST /api/care-access/:grantId/approve` | Patient | Activate selected scopes and optional expiry. | Grant belongs to patient; grant is pending. |
| `POST /api/care-access/:grantId/revoke` | Patient | Immediately remove caregiver access. | Grant belongs to patient; status becomes revoked. |
| `GET /api/care-access/grants` | Caregiver | List the caregiver’s own active grants. | `caregiver_user_id = req.userId`. |
| `GET /api/care-access/grants/:grantId/checkins?limit=30` | Caregiver | Read a patient’s shared check-ins. | Active, unexpired grant; caller is grantee; `checkins:read` is granted. |

The history response should deliberately omit `ai_response` until the patient separately grants a future scope such as `checkins:ai-response:read`.

```json
{
  "success": true,
  "grant": {
    "id": 41,
    "patient": { "name": "Patient display name" },
    "scope": "checkins:read",
    "expires_at": "2026-10-01T00:00:00Z"
  },
  "count": 2,
  "data": [
    {
      "id": 912,
      "mood": 3,
      "energy": 2,
      "pain": 4,
      "sleep_hours": 6.5,
      "notes": "Tired after a poor night of sleep.",
      "created_at": "2026-08-15T09:20:00Z"
    }
  ]
}
```

## Core authorization helper

Place the decision in one reusable server-side helper. The client must never decide whether a caregiver is allowed to read records.

```js
// services/careAccess.js
function parseScopes(raw) {
  try { return Array.isArray(JSON.parse(raw || '[]')) ? JSON.parse(raw || '[]') : []; }
  catch { return []; }
}

async function requireActiveCareScope(db, { caregiverUserId, grantId, scope }) {
  const grant = await new Promise((resolve, reject) => {
    db.get(
      `SELECT id, patient_user_id, caregiver_user_id, status, granted_scopes, expires_at
       FROM care_access_grants
       WHERE id = ? AND caregiver_user_id = ?`,
      [grantId, caregiverUserId],
      (err, row) => err ? reject(err) : resolve(row)
    );
  });

  if (!grant || grant.status !== 'active') return null;
  if (grant.expires_at && new Date(grant.expires_at) <= new Date()) return null;
  if (!parseScopes(grant.granted_scopes).includes(scope)) return null;
  return grant;
}

module.exports = { requireActiveCareScope };
```

## Read-only shared-history route

Register the route under a new `routes/careAccess.js` module and mount it in `server.js` with `app.use('/api/care-access', careAccessRoutes)`. The key property is that the query uses the patient ID **only after** `requireActiveCareScope` approves the particular grant for the authenticated caregiver.

```js
router.get('/grants/:grantId/checkins', authMiddleware, async (req, res) => {
  const grantId = Number(req.params.grantId);
  const requested = Number.parseInt(req.query.limit, 10);
  const limit = Number.isInteger(requested) ? Math.min(Math.max(requested, 1), 50) : 30;
  if (!Number.isSafeInteger(grantId) || grantId <= 0) {
    return res.status(400).json({ error: 'Invalid grant ID.' });
  }

  try {
    const db = getDb();
    const grant = await requireActiveCareScope(db, {
      caregiverUserId: req.userId,
      grantId,
      scope: 'checkins:read',
    });
    if (!grant) {
      await auditCareAccess(db, { actorUserId: req.userId, grantId, action: 'checkins.read', outcome: 'denied' });
      return res.status(403).json({ error: 'You do not have active permission to view this history.' });
    }

    const rows = await all(db,
      `SELECT id, mood, energy, pain, sleep_hours, notes, created_at
       FROM checkins
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT ?`,
      [grant.patient_user_id, limit]
    );
    await auditCareAccess(db, {
      actorUserId: req.userId,
      patientUserId: grant.patient_user_id,
      grantId,
      action: 'checkins.read',
      scope: 'checkins:read',
      outcome: 'allowed',
      recordCount: rows.length,
    });
    return res.json({ success: true, count: rows.length, data: rows });
  } catch (error) {
    console.error('[CareAccess] Shared history error:', error.message);
    return res.status(500).json({ error: 'Failed to retrieve shared history.' });
  }
});
```

Use parameterized SQL exactly as shown. Do not interpolate `grantId`, `patient_user_id`, `limit`, or any user-provided value into the SQL text.

## Approval and revocation behavior

The patient approval route must select the grant with `WHERE id = ? AND patient_user_id = req.userId AND status = 'pending'`. On approval, validate a closed list of scopes, write `status = 'active'`, `granted_scopes`, `granted_at`, `expires_at`, and `updated_at`, then add an audit event. On revoke, use `WHERE id = ? AND patient_user_id = req.userId AND status = 'active'`, set `status = 'revoked'`, `revoked_at`, `revoked_by_user_id`, and add another audit event. A successful revoke must make the next caregiver history request return `403` immediately.

Never let a caregiver create an active grant, change granted scopes, prolong expiry, or revoke a grant belonging to the patient. Avoid relying on `req.userRole` for this feature because the current middleware assigns every authenticated user a default `patient` role. The decision must be made from the specific grant’s caregiver, patient, status, scope, and expiry attributes.

## Test matrix

Create focused route tests with a temporary SQLite database. Seed one patient, one authorized caregiver, and one unrelated user. Tests should prove both the positive case and every important denial path.

| Scenario | Expected result |
|---|---|
| No bearer token | `401` and no check-ins returned. |
| Caregiver with no grant | `403`; no patient-existence detail. |
| Pending grant | `403`. |
| Active grant without `checkins:read` | `403`. |
| Active grant held by a different caregiver | `403`. |
| Revoked or expired grant | `403`, even if the caregiver used the endpoint before. |
| Active `checkins:read` grant | `200`; only that patient’s selected check-in fields are returned. |
| Attempted `limit=10000` | Response is capped at 50 records. |
| Successful read | One audit row records actor, patient, grant, scope, count, action, and allowed outcome. |
| Patient revokes grant | Following caregiver request is immediately denied and a revoke audit row exists. |

## Rollout order

First, back up the SQLite database and add the migration. Next, deploy the request, approval, list, revoke, and read-only history routes behind automated tests. Then update the redesigned frontend to list active grants and call `/api/care-access/grants/:grantId/checkins` only after the caregiver has connected their account. Keep the current Family Circle explanation until the new endpoint is deployed and verified with both patient and caregiver test accounts.

For a production healthcare deployment, add security review, privacy review, audit-log retention rules, incident response procedures, encryption-at-rest and in-transit verification, and jurisdiction-specific compliance review. This guide is an implementation pattern, not legal advice.

## References

[1] [OWASP Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html)

[2] [HHS OCR HIPAA Audit Protocol](https://www.hhs.gov/hipaa/for-professionals/compliance-enforcement/audit/protocol/index.html)

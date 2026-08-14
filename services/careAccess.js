function parseScopes(raw) {
  if (Array.isArray(raw)) return raw;
  try {
    const parsed = JSON.parse(raw || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function isActiveGrantForScope(grant, caregiverUserId, scope, now = new Date()) {
  if (!grant || Number(grant.caregiver_user_id) !== Number(caregiverUserId)) return false;
  if (grant.status !== "active") return false;
  if (grant.expires_at && new Date(grant.expires_at) <= now) return false;
  return parseScopes(grant.granted_scopes).includes(scope);
}

function getRow(db, sql, params = []) {
  return new Promise((resolve, reject) => db.get(sql, params, (err, row) => err ? reject(err) : resolve(row)));
}

function getAll(db, sql, params = []) {
  return new Promise((resolve, reject) => db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows)));
}

function run(db, sql, params = []) {
  return new Promise((resolve, reject) => db.run(sql, params, function onRun(err) {
    if (err) return reject(err);
    resolve({ id: this.lastID, changes: this.changes });
  }));
}

async function requireActiveCareScope(db, { caregiverUserId, grantId, scope }) {
  const grant = await getRow(db,
    `SELECT id, patient_user_id, caregiver_user_id, status, granted_scopes, expires_at
     FROM care_access_grants
     WHERE id = ? AND caregiver_user_id = ?`,
    [grantId, caregiverUserId]);
  return isActiveGrantForScope(grant, caregiverUserId, scope) ? grant : null;
}

async function auditCareAccess(db, { grantId = null, actorUserId, patientUserId = null, action, scope = null, outcome, recordCount = null, requestId = null }) {
  await run(db,
    `INSERT INTO care_access_audit
       (grant_id, actor_user_id, patient_user_id, action, scope, outcome, record_count, request_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [grantId, actorUserId, patientUserId, action, scope, outcome, recordCount, requestId]);
}

module.exports = { auditCareAccess, getAll, getRow, isActiveGrantForScope, parseScopes, requireActiveCareScope, run };

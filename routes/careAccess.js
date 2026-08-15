const express = require('express');
const { auditCareAccess, getAll, getRow, requireActiveCareScope, run } = require('../services/careAccess');
const { sendCareAccessRequestEmail } = require('../services/notification');

const router = express.Router();
const ALLOWED_SCOPES = new Set(['checkins:read']);

function genericRequestResponse(res) {
  return res.status(202).json({
    success: true,
    message: 'If the patient can receive requests, they can review this access request in their care settings.',
  });
}

function requestedScopes(value) {
  const scopes = Array.isArray(value) && value.length ? value : ['checkins:read'];
  return scopes.length <= 10 && scopes.every((scope) => ALLOWED_SCOPES.has(scope)) ? scopes : null;
}

function normalizedExpiry(expiresAt, durationDays) {
  if (durationDays !== undefined) {
    const days = Number(durationDays);
    if (![1, 7, 30, 90].includes(days)) return { error: 'Choose a permitted access duration.' };
    const date = new Date();
    date.setUTCDate(date.getUTCDate() + days);
    return { value: date.toISOString() };
  }
  if (!expiresAt) return { value: null };
  const date = new Date(expiresAt);
  if (Number.isNaN(date.getTime()) || date <= new Date()) return { error: 'Expiry must be a valid future date.' };
  const max = new Date();
  max.setFullYear(max.getFullYear() + 1);
  if (date > max) return { error: 'Expiry may not be more than one year away.' };
  return { value: date.toISOString() };
}

// A caregiver can request access, but cannot create an active grant.
router.post('/requests', async (req, res) => {
  const email = String(req.body.patient_email || '').trim().toLowerCase();
  const relationship = String(req.body.relationship || 'Family').trim().slice(0, 80);
  const scopes = requestedScopes(req.body.requested_scopes);
  if (!email || !email.includes('@')) return res.status(400).json({ error: 'A valid patient email is required.' });
  if (!scopes) return res.status(400).json({ error: 'Requested scopes are not permitted.' });

  try {
    const db = req.app.locals.db;
    const patient = await getRow(db, 'SELECT id, email FROM users WHERE lower(email) = ?', [email]);
    if (!patient || Number(patient.id) === Number(req.userId)) return genericRequestResponse(res);

    const existing = await getRow(db,
      'SELECT id, status FROM care_access_grants WHERE patient_user_id = ? AND caregiver_user_id = ?',
      [patient.id, req.userId]);
    if (existing && ['pending', 'active'].includes(existing.status)) return genericRequestResponse(res);

    let grantId;
    if (existing) {
      await run(db,
        `UPDATE care_access_grants
         SET relationship = ?, status = 'pending', requested_scopes = ?, granted_scopes = NULL,
             granted_at = NULL, expires_at = NULL, revoked_at = NULL, revoked_by_user_id = NULL,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [relationship, JSON.stringify(scopes), existing.id]);
      grantId = existing.id;
    } else {
      const created = await run(db,
        `INSERT INTO care_access_grants
         (patient_user_id, caregiver_user_id, relationship, status, requested_scopes)
         VALUES (?, ?, ?, 'pending', ?)`,
        [patient.id, req.userId, relationship, JSON.stringify(scopes)]);
      grantId = created.id;
    }
    await auditCareAccess(db, { grantId, actorUserId: req.userId, patientUserId: patient.id, action: 'grant.request', scope: scopes.join(','), outcome: 'changed' });
    sendCareAccessRequestEmail({ to: patient.email }).catch((error) => {
      console.error('[CareAccess] Consent request email error:', error.message);
    });
    return genericRequestResponse(res);
  } catch (error) {
    console.error('[CareAccess] Request error:', error.message);
    return res.status(500).json({ error: 'Unable to create access request.' });
  }
});

// The patient sees only requests addressed to them.
router.get('/incoming', async (req, res) => {
  try {
    const rows = await getAll(req.app.locals.db,
      `SELECT g.id, g.relationship, g.requested_scopes, g.requested_at,
              u.id AS caregiver_id, u.name AS caregiver_name, u.email AS caregiver_email
       FROM care_access_grants g
       JOIN users u ON u.id = g.caregiver_user_id
       WHERE g.patient_user_id = ? AND g.status = 'pending'
       ORDER BY g.requested_at DESC`, [req.userId]);
    return res.json({ success: true, count: rows.length, data: rows });
  } catch (error) {
    console.error('[CareAccess] Incoming error:', error.message);
    return res.status(500).json({ error: 'Unable to retrieve access requests.' });
  }
});

router.post('/:grantId/approve', async (req, res) => {
  const grantId = Number(req.params.grantId);
  const scopes = requestedScopes(req.body.scopes);
  const expiry = normalizedExpiry(req.body.expires_at, req.body.expires_in_days);
  if (!Number.isSafeInteger(grantId) || grantId <= 0) return res.status(400).json({ error: 'Invalid grant ID.' });
  if (!scopes) return res.status(400).json({ error: 'Granted scopes are not permitted.' });
  if (expiry.error) return res.status(400).json({ error: expiry.error });

  try {
    const db = req.app.locals.db;
    const changed = await run(db,
      `UPDATE care_access_grants
       SET status = 'active', granted_scopes = ?, granted_at = CURRENT_TIMESTAMP,
           expires_at = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND patient_user_id = ? AND status = 'pending'`,
      [JSON.stringify(scopes), expiry.value, grantId, req.userId]);
    if (!changed.changes) return res.status(404).json({ error: 'Pending access request not found.' });
    await auditCareAccess(db, { grantId, actorUserId: req.userId, patientUserId: req.userId, action: 'grant.approve', scope: scopes.join(','), outcome: 'changed' });
    return res.json({ success: true, expires_at: expiry.value, message: 'Care access has been approved.' });
  } catch (error) {
    console.error('[CareAccess] Approve error:', error.message);
    return res.status(500).json({ error: 'Unable to approve access request.' });
  }
});

router.post('/:grantId/revoke', async (req, res) => {
  const grantId = Number(req.params.grantId);
  if (!Number.isSafeInteger(grantId) || grantId <= 0) return res.status(400).json({ error: 'Invalid grant ID.' });
  try {
    const db = req.app.locals.db;
    const changed = await run(db,
      `UPDATE care_access_grants
       SET status = 'revoked', revoked_at = CURRENT_TIMESTAMP, revoked_by_user_id = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND patient_user_id = ? AND status IN ('pending', 'active')`,
      [req.userId, grantId, req.userId]);
    if (!changed.changes) return res.status(404).json({ error: 'Active access request not found.' });
    await auditCareAccess(db, { grantId, actorUserId: req.userId, patientUserId: req.userId, action: 'grant.revoke', outcome: 'changed' });
    return res.json({ success: true, message: 'Care access has been revoked.' });
  } catch (error) {
    console.error('[CareAccess] Revoke error:', error.message);
    return res.status(500).json({ error: 'Unable to revoke care access.' });
  }
});

// A caregiver sees only their own active grants.
router.get('/grants', async (req, res) => {
  try {
    const rows = await getAll(req.app.locals.db,
      `SELECT g.id, g.relationship, g.granted_scopes, g.granted_at, g.expires_at,
              u.name AS patient_name
       FROM care_access_grants g
       JOIN users u ON u.id = g.patient_user_id
       WHERE g.caregiver_user_id = ? AND g.status = 'active'
         AND (g.expires_at IS NULL OR g.expires_at > CURRENT_TIMESTAMP)
       ORDER BY g.granted_at DESC`, [req.userId]);
    return res.json({ success: true, count: rows.length, data: rows });
  } catch (error) {
    console.error('[CareAccess] Grant list error:', error.message);
    return res.status(500).json({ error: 'Unable to retrieve care grants.' });
  }
});

// The patient can review their own currently active permissions and each selected expiry.
router.get('/patient-grants', async (req, res) => {
  try {
    const rows = await getAll(req.app.locals.db,
      `SELECT g.id, g.relationship, g.granted_scopes, g.granted_at, g.expires_at,
              u.name AS caregiver_name
       FROM care_access_grants g
       JOIN users u ON u.id = g.caregiver_user_id
       WHERE g.patient_user_id = ? AND g.status = 'active'
         AND (g.expires_at IS NULL OR g.expires_at > CURRENT_TIMESTAMP)
       ORDER BY g.granted_at DESC`, [req.userId]);
    return res.json({ success: true, count: rows.length, data: rows });
  } catch (error) {
    console.error('[CareAccess] Patient grant list error:', error.message);
    return res.status(500).json({ error: 'Unable to retrieve active permissions.' });
  }
});

// A grant ID, not a user-supplied patient ID, controls the cross-user read.
router.get('/grants/:grantId/checkins', async (req, res) => {
  const grantId = Number(req.params.grantId);
  const requestedLimit = Number.parseInt(req.query.limit, 10);
  const limit = Number.isInteger(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 50) : 30;
  if (!Number.isSafeInteger(grantId) || grantId <= 0) return res.status(400).json({ error: 'Invalid grant ID.' });
  try {
    const db = req.app.locals.db;
    const grant = await requireActiveCareScope(db, { caregiverUserId: req.userId, grantId, scope: 'checkins:read' });
    if (!grant) {
      await auditCareAccess(db, { grantId, actorUserId: req.userId, action: 'checkins.read', scope: 'checkins:read', outcome: 'denied' });
      return res.status(403).json({ error: 'You do not have active permission to view this history.' });
    }
    const rows = await getAll(db,
      `SELECT id, mood, energy, pain, sleep_hours, notes, created_at
       FROM checkins WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`,
      [grant.patient_user_id, limit]);
    await auditCareAccess(db, { grantId, actorUserId: req.userId, patientUserId: grant.patient_user_id, action: 'checkins.read', scope: 'checkins:read', outcome: 'allowed', recordCount: rows.length });
    return res.json({ success: true, count: rows.length, data: rows });
  } catch (error) {
    console.error('[CareAccess] Shared history error:', error.message);
    return res.status(500).json({ error: 'Unable to retrieve shared history.' });
  }
});

module.exports = router;

const statements = [
  {
    label: 'care access grants table',
    sql: `CREATE TABLE IF NOT EXISTS care_access_grants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      patient_user_id INTEGER NOT NULL,
      caregiver_user_id INTEGER NOT NULL,
      relationship TEXT,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'active', 'denied', 'revoked', 'expired')),
      requested_scopes TEXT NOT NULL DEFAULT '["checkins:read"]',
      granted_scopes TEXT,
      requested_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      granted_at DATETIME,
      expires_at DATETIME,
      revoked_at DATETIME,
      revoked_by_user_id INTEGER,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(patient_user_id, caregiver_user_id)
    )`,
  },
  { label: 'care access patient index', sql: 'CREATE INDEX IF NOT EXISTS idx_care_access_patient ON care_access_grants(patient_user_id, status)' },
  { label: 'care access caregiver index', sql: 'CREATE INDEX IF NOT EXISTS idx_care_access_caregiver ON care_access_grants(caregiver_user_id, status)' },
  {
    label: 'care access audit table',
    sql: `CREATE TABLE IF NOT EXISTS care_access_audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      grant_id INTEGER,
      actor_user_id INTEGER NOT NULL,
      patient_user_id INTEGER,
      action TEXT NOT NULL,
      scope TEXT,
      outcome TEXT NOT NULL CHECK(outcome IN ('allowed', 'denied', 'changed')),
      record_count INTEGER,
      request_id TEXT,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
  },
  { label: 'care access audit index', sql: 'CREATE INDEX IF NOT EXISTS idx_care_access_audit_patient ON care_access_audit(patient_user_id, created_at DESC)' },
];

module.exports = { statements };

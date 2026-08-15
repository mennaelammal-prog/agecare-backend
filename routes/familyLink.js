const express = require("express");
const router = express.Router();
const { getDb } = require("../db");
const { authMiddleware } = require("../middleware/auth");

// GET /api/family/link/lookup?patient_email=... - Confirm the registered patient identity before linking
router.get("/lookup", authMiddleware, async (req, res) => {
  const patientEmailInput = typeof req.query.patient_email === 'string' ? req.query.patient_email : '';
  const patient_email = patientEmailInput.trim().toLowerCase();
  if (!patient_email) return res.status(400).json({ error: "Patient email is required" });

  try {
    const db = getDb();
    const caregiver = await new Promise(function(resolve, reject) {
      db.get("SELECT role FROM users WHERE id = ?", [req.userId], function(err, row) {
        if (err) reject(err);
        else resolve(row);
      });
    });
    if (!caregiver || caregiver.role !== 'caregiver') {
      return res.status(403).json({ error: "Only a family or caregiver account can link a patient. Create or sign in to a separate caregiver account first." });
    }
    const patient = await new Promise(function(resolve, reject) {
      db.get("SELECT id, email, name FROM users WHERE LOWER(email) = LOWER(?)", [patient_email], function(err, row) {
        if (err) reject(err);
        else resolve(row);
      });
    });
    if (!patient) return res.status(404).json({ error: "No registered patient account matches that email." });
    if (patient.id === req.userId) return res.status(400).json({ error: "Use the patient’s registered email, not your own caregiver email." });
    res.json({ success: true, patient: { email: patient.email, name: patient.name || patient.email } });
  } catch (err) {
    console.error("[FamilyLink] Lookup error:", err.message);
    res.status(500).json({ error: "Failed to look up patient" });
  }
});

// POST /api/family/link - Link to a patient by email
router.post("/link", authMiddleware, async (req, res) => {
  const patientEmailInput = typeof req.body.patient_email === 'string' ? req.body.patient_email : '';
  const patient_email = patientEmailInput.trim().toLowerCase();
  const relationship = typeof req.body.relationship === 'string' ? req.body.relationship.trim() : '';
  const familyUserId = req.userId;

  if (!patient_email) {
    return res.status(400).json({ error: "Patient email is required" });
  }

  try {
    const db = getDb();

    const caregiver = await new Promise(function(resolve, reject) {
      db.get("SELECT role FROM users WHERE id = ?", [familyUserId], function(err, row) {
        if (err) reject(err);
        else resolve(row);
      });
    });
    if (!caregiver || caregiver.role !== 'caregiver') {
      return res.status(403).json({ error: "Only a family or caregiver account can link a patient. Create or sign in to a separate caregiver account first." });
    }

    // Find patient by email
    const patient = await new Promise(function(resolve, reject) {
      db.get("SELECT id, email, name FROM users WHERE LOWER(email) = LOWER(?)", [patient_email], function(err, row) {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (!patient) {
      return res.status(404).json({ error: "Patient not found. Make sure they have registered." });
    }

    if (patient.id === familyUserId) {
      return res.status(400).json({ error: "Use the patient’s registered email, not your own caregiver email." });
    }

    // Check if already linked
    const existing = await new Promise(function(resolve, reject) {
      db.get(
        "SELECT id FROM family_contacts WHERE user_id = ? AND linked_user_id = ?",
        [familyUserId, patient.id],
        function(err, row) {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });

    if (existing) {
      return res.status(409).json({ error: "Already linked to this patient" });
    }

    // Create link
    await new Promise(function(resolve, reject) {
      db.run(
        "INSERT INTO family_contacts (user_id, name, relationship, linked_user_id) VALUES (?, ?, ?, ?)",
        [familyUserId, patient.name || patient.email, relationship || "Family", patient.id],
        function(err) {
          if (err) reject(err);
          else resolve({ id: this.lastID });
        }
      );
    });

    res.json({
      success: true,
      message: "Linked to " + (patient.name || patient.email),
      patient: { id: patient.id, email: patient.email, name: patient.name }
    });
  } catch (err) {
    console.error("[FamilyLink] Error:", err.message);
    res.status(500).json({ error: "Failed to link patient" });
  }
});

// GET /api/family/linked - Get patients linked to current user
router.get("/linked", authMiddleware, async (req, res) => {
  const familyUserId = req.userId;

  try {
    const db = getDb();

    const rows = await new Promise(function(resolve, reject) {
      db.all(
        "SELECT fc.id, fc.name, fc.relationship, fc.linked_user_id, u.email, u.name as patient_name " +
        "FROM family_contacts fc " +
        "LEFT JOIN users u ON fc.linked_user_id = u.id " +
        "WHERE fc.user_id = ?",
        [familyUserId],
        function(err, rows) {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });

    res.json({
      success: true,
      count: rows.length,
      data: rows
    });
  } catch (err) {
    console.error("[FamilyLink] Error:", err.message);
    res.status(500).json({ error: "Failed to fetch linked patients" });
  }
});

module.exports = router;

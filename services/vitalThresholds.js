/**
 * Default reference ranges used to flag a vital-sign reading as worth a
 * gentle heads-up. These are general population reference ranges commonly
 * used as a starting point for "worth a second look" thresholds -- NOT a
 * diagnosis, NOT personalized medical advice, and not a substitute for a
 * resident's own doctor setting targets specific to them (this app has no
 * clinician role/portal to capture that yet -- see
 * docs/AUSTRALIAN_AGED_CARE_ARCHITECTURE.md section 3.2 for the fuller
 * per-patient clinical_thresholds design this is a deliberately simpler
 * stand-in for). Deliberately erred wide (not tight) to avoid false alarms
 * for an older-adult population, many of whom have medically-normal
 * baselines outside a young-healthy-adult range (e.g. treated hypertension,
 * beta-blocker-lowered resting heart rate).
 *
 * Two severities:
 * - 'warning': outside a common general reference range -- informational,
 *   not urgent.
 * - 'critical': at or beyond a widely-recognized "seek medical attention"
 *   threshold (e.g. hypertensive crisis, hypoxemia) -- treated as urgent.
 */
const DEFAULT_THRESHOLDS = {
  blood_pressure_sys: {
    label: 'Systolic blood pressure', unit: 'mmHg',
    low_critical: 90, low_warning: 100, high_warning: 140, high_critical: 180,
  },
  blood_pressure_dia: {
    label: 'Diastolic blood pressure', unit: 'mmHg',
    low_critical: 50, low_warning: 60, high_warning: 90, high_critical: 120,
  },
  heart_rate: {
    label: 'Heart rate', unit: 'bpm',
    low_critical: 40, low_warning: 50, high_warning: 100, high_critical: 130,
  },
  spo2: {
    label: 'Oxygen saturation', unit: '%',
    low_critical: 90, low_warning: 94, high_warning: null, high_critical: null,
  },
  temperature: {
    label: 'Temperature', unit: '°C',
    low_critical: 35, low_warning: 35.5, high_warning: 38, high_critical: 39.5,
  },
  blood_sugar: {
    label: 'Blood sugar', unit: 'mmol/L',
    low_critical: 3.9, low_warning: 4.5, high_warning: 11.1, high_critical: 16.7,
  },
};

/**
 * Returns one breach entry per metric that's outside range, most severe
 * classification first per metric. `vitals` is the raw request body shape
 * used by routes/vitals.js (blood_pressure_sys, heart_rate, etc.) -- a
 * missing/null/non-numeric value for a metric is simply not evaluated,
 * not treated as a breach.
 */
function evaluateVitals(vitals) {
  const breaches = [];
  for (const [metric, range] of Object.entries(DEFAULT_THRESHOLDS)) {
    const raw = vitals[metric];
    if (raw === null || raw === undefined || raw === '') continue;
    const value = Number(raw);
    if (Number.isNaN(value)) continue;

    let severity = null;
    if (range.low_critical != null && value <= range.low_critical) severity = 'critical';
    else if (range.high_critical != null && value >= range.high_critical) severity = 'critical';
    else if (range.low_warning != null && value <= range.low_warning) severity = 'warning';
    else if (range.high_warning != null && value >= range.high_warning) severity = 'warning';

    if (severity) breaches.push({ metric, label: range.label, unit: range.unit, value, severity });
  }
  return breaches;
}

module.exports = { DEFAULT_THRESHOLDS, evaluateVitals };

const test = require('node:test');
const assert = require('node:assert/strict');
const { evaluateVitals } = require('../services/vitalThresholds');

test('evaluateVitals ignores missing, null, and non-numeric values', () => {
  assert.deepEqual(evaluateVitals({}), []);
  assert.deepEqual(evaluateVitals({ heart_rate: null, spo2: '', temperature: undefined }), []);
  assert.deepEqual(evaluateVitals({ heart_rate: 'not a number' }), []);
});

test('evaluateVitals reports nothing for readings within the general reference range', () => {
  assert.deepEqual(evaluateVitals({
    blood_pressure_sys: 120, blood_pressure_dia: 80, heart_rate: 72, spo2: 98, temperature: 36.8, blood_sugar: 5.5,
  }), []);
});

test('evaluateVitals classifies warning vs critical correctly per metric', () => {
  const breaches = evaluateVitals({ heart_rate: 135, spo2: 92, blood_sugar: 3.5 });
  const byMetric = Object.fromEntries(breaches.map((b) => [b.metric, b.severity]));
  assert.equal(byMetric.heart_rate, 'critical'); // >= 130
  assert.equal(byMetric.spo2, 'warning'); // <= 94 but > 90
  assert.equal(byMetric.blood_sugar, 'critical'); // <= 3.9
});

test('evaluateVitals treats a boundary value as a breach (inclusive thresholds)', () => {
  const breaches = evaluateVitals({ heart_rate: 100 }); // exactly high_warning
  assert.equal(breaches.length, 1);
  assert.equal(breaches[0].severity, 'warning');
});

test('evaluateVitals has no high threshold for spo2 (a high reading is never a breach)', () => {
  assert.deepEqual(evaluateVitals({ spo2: 100 }), []);
});

test('evaluateVitals reports multiple simultaneous breaches independently', () => {
  const breaches = evaluateVitals({ blood_pressure_sys: 185, blood_pressure_dia: 65, heart_rate: 45 });
  const metrics = breaches.map((b) => b.metric).sort();
  assert.deepEqual(metrics, ['blood_pressure_sys', 'heart_rate']);
  assert.equal(breaches.find((b) => b.metric === 'blood_pressure_sys').severity, 'critical');
  assert.equal(breaches.find((b) => b.metric === 'heart_rate').severity, 'warning');
});

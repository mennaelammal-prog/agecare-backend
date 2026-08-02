import React, { useState, useEffect } from 'react';
import api from '../api';

export default function VitalSigns() {
  const [vitals, setVitals] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({
    blood_pressure_sys: '', blood_pressure_dia: '', heart_rate: '',
    temperature: '', weight: '', blood_sugar: '', spo2: '', notes: '',
  });

  useEffect(() => { fetchVitals(); }, []);

  const fetchVitals = async () => {
    try {
      const response = await api.get('/vitals');
      setVitals(response.data.data);
    } catch (err) { console.error('Failed to fetch vitals:', err); }
  };

  const resetForm = () => {
    setFormData({ blood_pressure_sys: '', blood_pressure_dia: '', heart_rate: '', temperature: '', weight: '', blood_sugar: '', spo2: '', notes: '' });
    setEditingId(null);
    setShowForm(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingId) {
        await api.put(`/vitals/${editingId}`, formData);
      } else {
        await api.post('/vitals', formData);
      }
      resetForm();
      fetchVitals();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to save vitals');
    }
  };

  const handleEdit = (v) => {
    setFormData({
      blood_pressure_sys: v.blood_pressure_sys || '',
      blood_pressure_dia: v.blood_pressure_dia || '',
      heart_rate: v.heart_rate || '',
      temperature: v.temperature || '',
      weight: v.weight || '',
      blood_sugar: v.blood_sugar || '',
      spo2: v.spo2 || '',
      notes: v.notes || '',
    });
    setEditingId(v.id);
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this record?')) return;
    try { await api.delete(`/vitals/${id}`); fetchVitals(); }
    catch (err) { alert('Failed to delete'); }
  };

  const getBPStatus = (sys, dia) => {
    if (!sys || !dia) return null;
    if (sys >= 140 || dia >= 90) return { label: 'High', color: '#e74c3c' };
    if (sys <= 90 || dia <= 60) return { label: 'Low', color: '#f39c12' };
    return { label: 'Normal', color: '#27ae60' };
  };

  const getHRStatus = (hr) => {
    if (!hr) return null;
    if (hr > 100) return { label: 'High', color: '#e74c3c' };
    if (hr < 60) return { label: 'Low', color: '#f39c12' };
    return { label: 'Normal', color: '#27ae60' };
  };

  const getTempStatus = (t) => {
    if (!t) return null;
    if (t >= 38) return { label: 'Fever', color: '#e74c3c' };
    if (t < 35.5) return { label: 'Low', color: '#f39c12' };
    return { label: 'Normal', color: '#27ae60' };
  };

  const getSpO2Status = (spo2) => {
    if (!spo2) return null;
    if (spo2 < 90) return { label: 'Critical', color: '#e74c3c' };
    if (spo2 < 95) return { label: 'Low', color: '#f39c12' };
    return { label: 'Normal', color: '#27ae60' };
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h2 style={styles.title}>🩺 Vital Signs</h2>
        <button onClick={() => { if (showForm) resetForm(); else setShowForm(true); }} style={styles.addBtn}>
          {showForm ? 'Cancel' : '+ Record Vitals'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} style={styles.form}>
          <h3 style={styles.formTitle}>{editingId ? '✏️ Edit Vital Signs' : '➕ New Vital Signs'}</h3>
          <div style={styles.formRow}>
            <div style={styles.formGroup}>
              <label style={styles.label}>Blood Pressure (Sys/Dia)</label>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <input type="number" placeholder="120" value={formData.blood_pressure_sys} onChange={(e) => setFormData({...formData, blood_pressure_sys: e.target.value})} style={styles.input} />
                <span style={{ fontSize: '18px' }}>/</span>
                <input type="number" placeholder="80" value={formData.blood_pressure_dia} onChange={(e) => setFormData({...formData, blood_pressure_dia: e.target.value})} style={styles.input} />
              </div>
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Heart Rate (bpm)</label>
              <input type="number" placeholder="72" value={formData.heart_rate} onChange={(e) => setFormData({...formData, heart_rate: e.target.value})} style={styles.input} />
            </div>
          </div>
          <div style={styles.formRow}>
            <div style={styles.formGroup}>
              <label style={styles.label}>Temperature (°C)</label>
              <input type="number" step="0.1" placeholder="36.6" value={formData.temperature} onChange={(e) => setFormData({...formData, temperature: e.target.value})} style={styles.input} />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Weight (kg)</label>
              <input type="number" step="0.1" placeholder="70" value={formData.weight} onChange={(e) => setFormData({...formData, weight: e.target.value})} style={styles.input} />
            </div>
          </div>
          <div style={styles.formRow}>
            <div style={styles.formGroup}>
              <label style={styles.label}>Blood Sugar (mg/dL)</label>
              <input type="number" placeholder="100" value={formData.blood_sugar} onChange={(e) => setFormData({...formData, blood_sugar: e.target.value})} style={styles.input} />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>SpO2 (%)</label>
              <input type="number" placeholder="98" value={formData.spo2} onChange={(e) => setFormData({...formData, spo2: e.target.value})} style={styles.input} />
            </div>
          </div>
          <div style={styles.formGroup}>
            <label style={styles.label}>Notes</label>
            <input value={formData.notes} onChange={(e) => setFormData({...formData, notes: e.target.value})} style={styles.input} placeholder="Fasting, after meal, feeling dizzy, etc." />
          </div>
          <button type="submit" style={styles.submitBtn}>{editingId ? '💾 Update Vitals' : '💾 Save Vital Signs'}</button>
        </form>
      )}

      <div style={styles.list}>
        {vitals.length === 0 ? (
          <p style={styles.empty}>No vital signs recorded yet. Track your BP, heart rate, and more!</p>
        ) : (
          vitals.map((v) => (
            <div key={v.id} style={styles.card}>
              <div style={styles.cardInfo}>
                <p style={styles.date}>📅 {new Date(v.recorded_at).toLocaleString()}</p>
                <div style={styles.vitalsGrid}>
                  {v.blood_pressure_sys && v.blood_pressure_dia && (
                    <div style={styles.vitalItem}>
                      <span style={styles.vitalLabel}>BP</span>
                      <span style={styles.vitalValue}>{v.blood_pressure_sys}/{v.blood_pressure_dia}</span>
                      {(() => { const s = getBPStatus(v.blood_pressure_sys, v.blood_pressure_dia); return s ? <span style={{...styles.status, color: s.color}}>{s.label}</span> : null; })()}
                    </div>
                  )}
                  {v.heart_rate && (
                    <div style={styles.vitalItem}>
                      <span style={styles.vitalLabel}>HR</span>
                      <span style={styles.vitalValue}>{v.heart_rate} bpm</span>
                      {(() => { const s = getHRStatus(v.heart_rate); return s ? <span style={{...styles.status, color: s.color}}>{s.label}</span> : null; })()}
                    </div>
                  )}
                  {v.temperature && (
                    <div style={styles.vitalItem}>
                      <span style={styles.vitalLabel}>Temp</span>
                      <span style={styles.vitalValue}>{v.temperature}°C</span>
                      {(() => { const s = getTempStatus(v.temperature); return s ? <span style={{...styles.status, color: s.color}}>{s.label}</span> : null; })()}
                    </div>
                  )}
                  {v.weight && (
                    <div style={styles.vitalItem}>
                      <span style={styles.vitalLabel}>Weight</span>
                      <span style={styles.vitalValue}>{v.weight} kg</span>
                    </div>
                  )}
                  {v.blood_sugar && (
                    <div style={styles.vitalItem}>
                      <span style={styles.vitalLabel}>Sugar</span>
                      <span style={styles.vitalValue}>{v.blood_sugar} mg/dL</span>
                    </div>
                  )}
                  {v.spo2 && (
                    <div style={styles.vitalItem}>
                      <span style={styles.vitalLabel}>SpO2</span>
                      <span style={styles.vitalValue}>{v.spo2}%</span>
                      {(() => { const s = getSpO2Status(v.spo2); return s ? <span style={{...styles.status, color: s.color}}>{s.label}</span> : null; })()}
                    </div>
                  )}
                </div>
                {v.notes && <p style={styles.notes}>📝 {v.notes}</p>}
              </div>
              <div style={styles.cardActions}>
                <button onClick={() => handleEdit(v)} style={styles.editBtn}>✏️</button>
                <button onClick={() => handleDelete(v.id)} style={styles.deleteBtn}>🗑️</button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

const styles = {
  container: { background: 'white', borderRadius: '16px', padding: '24px', boxShadow: '0 2px 12px rgba(0,0,0,0.08)' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' },
  title: { margin: 0, color: '#333', fontSize: '22px' },
  addBtn: { padding: '10px 20px', background: '#667eea', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', fontWeight: '600' },
  form: { background: '#f8f9fa', padding: '20px', borderRadius: '12px', marginBottom: '20px', display: 'flex', flexDirection: 'column', gap: '14px' },
  formTitle: { margin: '0 0 10px 0', color: '#555', fontSize: '16px' },
  formRow: { display: 'flex', gap: '12px', flexWrap: 'wrap' },
  formGroup: { flex: 1, minWidth: '180px', display: 'flex', flexDirection: 'column', gap: '6px' },
  label: { fontSize: '14px', fontWeight: '600', color: '#555' },
  input: { padding: '10px', borderRadius: '8px', border: '1px solid #ddd', fontSize: '14px', width: '100%' },
  submitBtn: { padding: '12px', background: '#48bb78', color: 'white', border: 'none', borderRadius: '8px', fontSize: '15px', fontWeight: '600', cursor: 'pointer' },
  list: { display: 'flex', flexDirection: 'column', gap: '12px' },
  empty: { textAlign: 'center', color: '#999', padding: '40px' },
  card: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', background: '#f8f9fa', borderRadius: '10px', border: '1px solid #e0e0e0' },
  cardInfo: { flex: 1 },
  date: { fontSize: '13px', color: '#888', marginBottom: '10px' },
  vitalsGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: '10px' },
  vitalItem: { background: 'white', padding: '10px', borderRadius: '8px', textAlign: 'center', border: '1px solid #eee' },
  vitalLabel: { display: 'block', fontSize: '11px', color: '#888', textTransform: 'uppercase', letterSpacing: '1px' },
  vitalValue: { display: 'block', fontSize: '17px', fontWeight: '700', color: '#333', margin: '4px 0' },
  status: { fontSize: '11px', fontWeight: '700' },
  notes: { margin: '10px 0 0 0', fontSize: '13px', color: '#666', fontStyle: 'italic' },
  cardActions: { display: 'flex', gap: '6px' },
  editBtn: { padding: '8px 12px', background: '#e0e7ff', color: '#667eea', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '14px' },
  deleteBtn: { padding: '8px 12px', background: '#fee', color: '#e74c3c', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '14px' },
};
import React, { useState, useEffect } from 'react';
import api from '../api';

export default function Medications() {
  const [medications, setMedications] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({
    name: '', dosage: '', frequency: 'Daily', time_of_day: 'Morning',
    start_date: '', end_date: '', notes: '',
  });

  useEffect(() => { fetchMeds(); }, []);

  const fetchMeds = async () => {
    try {
      const response = await api.get('/medications');
      setMedications(response.data.data);
    } catch (err) { console.error('Failed to fetch medications:', err); }
  };

  const resetForm = () => {
    setFormData({ name: '', dosage: '', frequency: 'Daily', time_of_day: 'Morning', start_date: '', end_date: '', notes: '' });
    setEditingId(null);
    setShowForm(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingId) {
        await api.put(`/medications/${editingId}`, formData);
      } else {
        await api.post('/medications', formData);
      }
      resetForm();
      fetchMeds();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to save medication');
    }
  };

  const handleEdit = (med) => {
    setFormData({
      name: med.name, dosage: med.dosage, frequency: med.frequency || 'Daily',
      time_of_day: med.time_of_day || 'Morning', start_date: med.start_date || '',
      end_date: med.end_date || '', notes: med.notes || '',
    });
    setEditingId(med.id);
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = async (id) => {
    if (!confirm('Remove this medication?')) return;
    try { await api.delete(`/medications/${id}`); fetchMeds(); }
    catch (err) { alert('Failed to remove'); }
  };

  const getReminderStatus = (timeOfDay) => {
    const hour = new Date().getHours();
    const times = { 'Morning': 8, 'Afternoon': 14, 'Evening': 18, 'Bedtime': 21 };
    const targetHour = times[timeOfDay] || 8;
    if (hour >= targetHour && hour < targetHour + 3) return { label: 'Due now!', color: '#e74c3c', bg: '#fef2f2' };
    if (hour >= targetHour - 2 && hour < targetHour) return { label: 'Soon', color: '#f39c12', bg: '#fffbeb' };
    return { label: 'Upcoming', color: '#27ae60', bg: '#f0fdf4' };
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h2 style={styles.title}>💊 Medications & Reminders</h2>
        <button onClick={() => { if (showForm) resetForm(); else setShowForm(true); }} style={styles.addBtn}>
          {showForm ? 'Cancel' : '+ Add Medication'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} style={styles.form}>
          <h3 style={styles.formTitle}>{editingId ? '✏️ Edit Medication' : '➕ New Medication'}</h3>
          <div style={styles.formRow}>
            <div style={styles.formGroup}>
              <label style={styles.label}>Medication Name *</label>
              <input value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} style={styles.input} required placeholder="e.g. Aspirin" />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Dosage *</label>
              <input value={formData.dosage} onChange={(e) => setFormData({...formData, dosage: e.target.value})} style={styles.input} required placeholder="e.g. 100mg" />
            </div>
          </div>
          <div style={styles.formRow}>
            <div style={styles.formGroup}>
              <label style={styles.label}>Frequency</label>
              <select value={formData.frequency} onChange={(e) => setFormData({...formData, frequency: e.target.value})} style={styles.input}>
                <option>Daily</option><option>Twice daily</option><option>Weekly</option><option>As needed</option>
              </select>
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Time of Day</label>
              <select value={formData.time_of_day} onChange={(e) => setFormData({...formData, time_of_day: e.target.value})} style={styles.input}>
                <option>Morning</option><option>Afternoon</option><option>Evening</option><option>Bedtime</option>
              </select>
            </div>
          </div>
          <div style={styles.formRow}>
            <div style={styles.formGroup}>
              <label style={styles.label}>Start Date</label>
              <input type="date" value={formData.start_date} onChange={(e) => setFormData({...formData, start_date: e.target.value})} style={styles.input} />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>End Date (optional)</label>
              <input type="date" value={formData.end_date} onChange={(e) => setFormData({...formData, end_date: e.target.value})} style={styles.input} />
            </div>
          </div>
          <div style={styles.formGroup}>
            <label style={styles.label}>Notes</label>
            <input value={formData.notes} onChange={(e) => setFormData({...formData, notes: e.target.value})} style={styles.input} placeholder="Take with food, side effects, etc." />
          </div>
          <button type="submit" style={styles.submitBtn}>{editingId ? '💾 Update Medication' : '💾 Save Medication'}</button>
        </form>
      )}

      <div style={styles.list}>
        {medications.length === 0 ? (
          <p style={styles.empty}>No medications added yet. Add your first medication to get reminders!</p>
        ) : (
          medications.map((med) => {
            const reminder = getReminderStatus(med.time_of_day);
            return (
              <div key={med.id} style={{...styles.card, background: reminder.bg, borderColor: reminder.color}}>
                <div style={styles.cardInfo}>
                  <div style={styles.cardHeader}>
                    <h3 style={styles.cardName}>{med.name}</h3>
                    <span style={{...styles.reminderBadge, background: reminder.color}}>{reminder.label}</span>
                  </div>
                  <p style={styles.cardDetail}>💊 {med.dosage} · {med.frequency} · {med.time_of_day}</p>
                  {med.start_date && <p style={styles.cardDetail}>📅 {med.start_date}{med.end_date ? ` → ${med.end_date}` : ''}</p>}
                  {med.notes && <p style={styles.cardDetail}>📝 {med.notes}</p>}
                </div>
                <div style={styles.cardActions}>
                  <button onClick={() => handleEdit(med)} style={styles.editBtn}>✏️</button>
                  <button onClick={() => handleDelete(med.id)} style={styles.deleteBtn}>🗑️</button>
                </div>
              </div>
            );
          })
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
  input: { padding: '10px', borderRadius: '8px', border: '1px solid #ddd', fontSize: '14px' },
  submitBtn: { padding: '12px', background: '#48bb78', color: 'white', border: 'none', borderRadius: '8px', fontSize: '15px', fontWeight: '600', cursor: 'pointer' },
  list: { display: 'flex', flexDirection: 'column', gap: '12px' },
  empty: { textAlign: 'center', color: '#999', padding: '40px' },
  card: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', borderRadius: '10px', border: '2px solid', transition: 'all 0.2s' },
  cardHeader: { display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '6px' },
  cardInfo: { flex: 1 },
  cardName: { margin: 0, fontSize: '17px', color: '#333' },
  cardDetail: { margin: '3px 0', fontSize: '13px', color: '#666' },
  reminderBadge: { padding: '4px 10px', borderRadius: '20px', color: 'white', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase' },
  cardActions: { display: 'flex', gap: '6px' },
  editBtn: { padding: '8px 12px', background: '#e0e7ff', color: '#667eea', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '14px' },
  deleteBtn: { padding: '8px 12px', background: '#fee', color: '#e74c3c', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '14px' },
};
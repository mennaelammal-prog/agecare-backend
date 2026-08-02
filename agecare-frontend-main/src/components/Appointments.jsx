import React, { useState, useEffect } from 'react';
import api from '../api';

export default function Appointments() {
  const [appointments, setAppointments] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({
    doctor_name: '', specialty: '', location: '', appointment_date: '', notes: '',
  });

  useEffect(() => { fetchAppointments(); }, []);

  const fetchAppointments = async () => {
    try {
      const response = await api.get('/appointments');
      setAppointments(response.data.data);
    } catch (err) { console.error('Failed to fetch appointments:', err); }
  };

  const resetForm = () => {
    setFormData({ doctor_name: '', specialty: '', location: '', appointment_date: '', notes: '' });
    setEditingId(null);
    setShowForm(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingId) {
        await api.put(`/appointments/${editingId}`, formData);
      } else {
        await api.post('/appointments', formData);
      }
      resetForm();
      fetchAppointments();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to save appointment');
    }
  };

  const handleEdit = (appt) => {
    const dateObj = new Date(appt.appointment_date);
    const localDate = new Date(dateObj.getTime() - dateObj.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    setFormData({
      doctor_name: appt.doctor_name, specialty: appt.specialty || '',
      location: appt.location || '', appointment_date: localDate, notes: appt.notes || '',
    });
    setEditingId(appt.id);
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = async (id) => {
    if (!confirm('Cancel this appointment?')) return;
    try { await api.delete(`/appointments/${id}`); fetchAppointments(); }
    catch (err) { alert('Failed to cancel'); }
  };

  const getAppointmentStatus = (dateStr) => {
    const now = new Date();
    const apptDate = new Date(dateStr);
    const diffHours = (apptDate - now) / (1000 * 60 * 60);
    if (diffHours < 0) return { label: 'Past', color: '#999', bg: '#f3f4f6' };
    if (diffHours <= 24) return { label: 'Tomorrow!', color: '#e74c3c', bg: '#fef2f2' };
    if (diffHours <= 72) return { label: 'Soon', color: '#f39c12', bg: '#fffbeb' };
    return { label: 'Upcoming', color: '#3b82f6', bg: '#eff6ff' };
  };

  const getDaysUntil = (dateStr) => {
    const now = new Date();
    const apptDate = new Date(dateStr);
    const diffDays = Math.ceil((apptDate - now) / (1000 * 60 * 60 * 24));
    if (diffDays < 0) return 'Past';
    if (diffDays === 0) return 'Today!';
    if (diffDays === 1) return 'Tomorrow';
    return `${diffDays} days`;
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h2 style={styles.title}>📅 Doctor Appointments</h2>
        <button onClick={() => { if (showForm) resetForm(); else setShowForm(true); }} style={styles.addBtn}>
          {showForm ? 'Cancel' : '+ Add Appointment'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} style={styles.form}>
          <h3 style={styles.formTitle}>{editingId ? '✏️ Edit Appointment' : '➕ New Appointment'}</h3>
          <div style={styles.formRow}>
            <div style={styles.formGroup}>
              <label style={styles.label}>Doctor Name *</label>
              <input value={formData.doctor_name} onChange={(e) => setFormData({...formData, doctor_name: e.target.value})} style={styles.input} required placeholder="Dr. Smith" />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Specialty</label>
              <input value={formData.specialty} onChange={(e) => setFormData({...formData, specialty: e.target.value})} style={styles.input} placeholder="Cardiology" />
            </div>
          </div>
          <div style={styles.formRow}>
            <div style={styles.formGroup}>
              <label style={styles.label}>Location</label>
              <input value={formData.location} onChange={(e) => setFormData({...formData, location: e.target.value})} style={styles.input} placeholder="City Hospital, Room 205" />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Date & Time *</label>
              <input type="datetime-local" value={formData.appointment_date} onChange={(e) => setFormData({...formData, appointment_date: e.target.value})} style={styles.input} required />
            </div>
          </div>
          <div style={styles.formGroup}>
            <label style={styles.label}>Notes</label>
            <input value={formData.notes} onChange={(e) => setFormData({...formData, notes: e.target.value})} style={styles.input} placeholder="Bring insurance card, lab results, etc." />
          </div>
          <button type="submit" style={styles.submitBtn}>{editingId ? '💾 Update Appointment' : '💾 Save Appointment'}</button>
        </form>
      )}

      <div style={styles.list}>
        {appointments.length === 0 ? (
          <p style={styles.empty}>No appointments scheduled. Add your next doctor visit!</p>
        ) : (
          appointments.map((appt) => {
            const status = getAppointmentStatus(appt.appointment_date);
            return (
              <div key={appt.id} style={{...styles.card, background: status.bg, borderColor: status.color}}>
                <div style={styles.cardInfo}>
                  <div style={styles.cardHeader}>
                    <h3 style={styles.cardName}>👨‍⚕️ {appt.doctor_name}</h3>
                    <span style={{...styles.badge, background: status.color}}>{status.label}</span>
                  </div>
                  {appt.specialty && <p style={styles.cardDetail}>🏥 {appt.specialty}</p>}
                  <p style={styles.cardDetail}>📅 {new Date(appt.appointment_date).toLocaleString()}</p>
                  <p style={styles.cardDetail}>⏰ {getDaysUntil(appt.appointment_date)}</p>
                  {appt.location && <p style={styles.cardDetail}>📍 {appt.location}</p>}
                  {appt.notes && <p style={styles.cardDetail}>📝 {appt.notes}</p>}
                </div>
                <div style={styles.cardActions}>
                  <button onClick={() => handleEdit(appt)} style={styles.editBtn}>✏️</button>
                  <button onClick={() => handleDelete(appt.id)} style={styles.deleteBtn}>🗑️</button>
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
  badge: { padding: '4px 10px', borderRadius: '20px', color: 'white', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase' },
  cardActions: { display: 'flex', gap: '6px' },
  editBtn: { padding: '8px 12px', background: '#e0e7ff', color: '#667eea', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '14px' },
  deleteBtn: { padding: '8px 12px', background: '#fee', color: '#e74c3c', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '14px' },
};
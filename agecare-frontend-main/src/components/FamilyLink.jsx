import React, { useState, useEffect } from 'react';
import api from '../api';

export default function FamilyLink() {
  const [patientEmail, setPatientEmail] = useState('');
  const [relationship, setRelationship] = useState('');
  const [linkedPatients, setLinkedPatients] = useState([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchLinkedPatients();
  }, []);

  async function fetchLinkedPatients() {
    try {
      const res = await api.get('/family/link/linked');
      setLinkedPatients(res.data.data || []);
    } catch (err) {
      console.error('Failed to fetch linked patients:', err);
    }
  }

  async function handleLink(e) {
    e.preventDefault();
    setMessage('');
    setError('');
    setLoading(true);

    try {
      const res = await api.post('/family/link/link', {
        patient_email: patientEmail,
        relationship: relationship || 'Family'
      });
      setMessage(res.data.message);
      setPatientEmail('');
      setRelationship('');
      fetchLinkedPatients();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to link patient');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={styles.container}>
      <h2 style={styles.title}>Link to Family Member</h2>
      <p style={styles.subtitle}>Enter the email of the person you want to monitor</p>

      {message && <div style={styles.success}>{message}</div>}
      {error && <div style={styles.error}>{error}</div>}

      <form onSubmit={handleLink} style={styles.form}>
        <div style={styles.formGroup}>
          <label style={styles.label}>Patient's Email</label>
          <input
            type="email"
            value={patientEmail}
            onChange={(e) => setPatientEmail(e.target.value)}
            style={styles.input}
            placeholder="patient@example.com"
            required
          />
        </div>

        <div style={styles.formGroup}>
          <label style={styles.label}>Relationship (optional)</label>
          <input
            type="text"
            value={relationship}
            onChange={(e) => setRelationship(e.target.value)}
            style={styles.input}
            placeholder="Son, Daughter, Caregiver..."
          />
        </div>

        <button type="submit" style={styles.button} disabled={loading}>
          {loading ? 'Linking...' : 'Link to Patient'}
        </button>
      </form>

      {linkedPatients.length > 0 && (
        <div style={styles.linkedSection}>
          <h3 style={styles.linkedTitle}>Your Linked Patients</h3>
          {linkedPatients.map((p) => (
            <div key={p.id} style={styles.linkedCard}>
              <div>
                <strong>{p.patient_name || p.name || 'Unknown'}</strong>
                <span style={styles.relationship}>{p.relationship}</span>
              </div>
              <div style={styles.email}>{p.email}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const styles = {
  container: {
    background: 'white',
    borderRadius: '16px',
    padding: '24px',
    boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
  },
  title: {
    margin: '0 0 8px 0',
    fontSize: '22px',
    color: '#333',
  },
  subtitle: {
    margin: '0 0 20px 0',
    color: '#666',
    fontSize: '14px',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
    marginBottom: '24px',
  },
  formGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  label: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#555',
  },
  input: {
    padding: '12px',
    borderRadius: '8px',
    border: '1px solid #ddd',
    fontSize: '15px',
  },
  button: {
    padding: '14px',
    background: '#667eea',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    fontSize: '16px',
    fontWeight: '600',
    cursor: 'pointer',
  },
  success: {
    background: '#d4edda',
    color: '#155724',
    padding: '12px',
    borderRadius: '8px',
    marginBottom: '16px',
  },
  error: {
    background: '#fee',
    color: '#e74c3c',
    padding: '12px',
    borderRadius: '8px',
    marginBottom: '16px',
  },
  linkedSection: {
    borderTop: '1px solid #eee',
    paddingTop: '20px',
  },
  linkedTitle: {
    margin: '0 0 12px 0',
    fontSize: '18px',
    color: '#333',
  },
  linkedCard: {
    padding: '14px',
    background: '#f8f9fa',
    borderRadius: '10px',
    marginBottom: '10px',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  relationship: {
    marginLeft: '10px',
    padding: '2px 8px',
    background: '#667eea',
    color: 'white',
    borderRadius: '12px',
    fontSize: '12px',
  },
  email: {
    fontSize: '13px',
    color: '#888',
  },
};
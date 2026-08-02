import React, { useState, useEffect } from 'react';
import api from '../api';

export default function FamilyContacts() {
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    relationship: '',
    email: '',
    phone: '',
    notify_email: true,
    notify_sms: false,
  });

  useEffect(() => {
    fetchContacts();
  }, []);

  const fetchContacts = async () => {
    try {
      const response = await api.get('/family');
      setContacts(response.data.data);
    } catch (err) {
      console.error('Failed to fetch contacts:', err);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      await api.post('/family', formData);
      setFormData({
        name: '',
        relationship: '',
        email: '',
        phone: '',
        notify_email: true,
        notify_sms: false,
      });
      setShowForm(false);
      fetchContacts();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to add contact');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Remove this contact?')) return;
    
    try {
      await api.delete(`/family/${id}`);
      fetchContacts();
    } catch (err) {
      alert('Failed to remove contact');
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h2 style={styles.title}>👨‍👩‍👧 Family Contacts</h2>
        <button onClick={() => setShowForm(!showForm)} style={styles.addBtn}>
          {showForm ? 'Cancel' : '+ Add Contact'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} style={styles.form}>
          <div style={styles.formRow}>
            <div style={styles.formGroup}>
              <label style={styles.label}>Name</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({...formData, name: e.target.value})}
                style={styles.input}
                required
              />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Relationship</label>
              <input
                type="text"
                value={formData.relationship}
                onChange={(e) => setFormData({...formData, relationship: e.target.value})}
                style={styles.input}
                placeholder="Son, Daughter, etc."
                required
              />
            </div>
          </div>

          <div style={styles.formRow}>
            <div style={styles.formGroup}>
              <label style={styles.label}>Email</label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({...formData, email: e.target.value})}
                style={styles.input}
              />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Phone</label>
              <input
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData({...formData, phone: e.target.value})}
                style={styles.input}
                placeholder="+1234567890"
              />
            </div>
          </div>

          <div style={styles.checkboxRow}>
            <label style={styles.checkbox}>
              <input
                type="checkbox"
                checked={formData.notify_email}
                onChange={(e) => setFormData({...formData, notify_email: e.target.checked})}
              />
              Email notifications
            </label>
            <label style={styles.checkbox}>
              <input
                type="checkbox"
                checked={formData.notify_sms}
                onChange={(e) => setFormData({...formData, notify_sms: e.target.checked})}
              />
              SMS notifications
            </label>
          </div>

          <button type="submit" disabled={loading} style={styles.submitBtn}>
            {loading ? 'Saving...' : 'Save Contact'}
          </button>
        </form>
      )}

      <div style={styles.list}>
        {contacts.length === 0 ? (
          <p style={styles.empty}>No family contacts added yet.</p>
        ) : (
          contacts.map((contact) => (
            <div key={contact.id} style={styles.card}>
              <div style={styles.cardInfo}>
                <h3 style={styles.cardName}>{contact.name}</h3>
                <p style={styles.cardRelation}>{contact.relationship}</p>
                {contact.email && <p style={styles.cardDetail}>📧 {contact.email}</p>}
                {contact.phone && <p style={styles.cardDetail}>📱 {contact.phone}</p>}
                <div style={styles.badges}>
                  {contact.notify_email ? <span style={styles.badge}>📧 Email</span> : null}
                  {contact.notify_sms ? <span style={styles.badge}>📱 SMS</span> : null}
                </div>
              </div>
              <button
                onClick={() => handleDelete(contact.id)}
                style={styles.deleteBtn}
              >
                🗑️
              </button>
            </div>
          ))
        )}
      </div>
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
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '20px',
  },
  title: {
    margin: 0,
    color: '#333',
    fontSize: '22px',
  },
  addBtn: {
    padding: '10px 20px',
    background: '#667eea',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '600',
  },
  form: {
    background: '#f8f9fa',
    padding: '20px',
    borderRadius: '12px',
    marginBottom: '20px',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  formRow: {
    display: 'flex',
    gap: '12px',
    flexWrap: 'wrap',
  },
  formGroup: {
    flex: 1,
    minWidth: '200px',
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
    padding: '10px',
    borderRadius: '8px',
    border: '1px solid #ddd',
    fontSize: '14px',
  },
  checkboxRow: {
    display: 'flex',
    gap: '20px',
  },
  checkbox: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '14px',
    cursor: 'pointer',
  },
  submitBtn: {
    padding: '12px',
    background: '#48bb78',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    fontSize: '15px',
    fontWeight: '600',
    cursor: 'pointer',
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  empty: {
    textAlign: 'center',
    color: '#999',
    padding: '40px',
  },
  card: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '16px',
    background: '#f8f9fa',
    borderRadius: '10px',
    border: '1px solid #e0e0e0',
  },
  cardInfo: {
    flex: 1,
  },
  cardName: {
    margin: '0 0 4px 0',
    fontSize: '16px',
    color: '#333',
  },
  cardRelation: {
    margin: '0 0 8px 0',
    color: '#667eea',
    fontSize: '14px',
    fontWeight: '600',
  },
  cardDetail: {
    margin: '2px 0',
    fontSize: '13px',
    color: '#666',
  },
  badges: {
    display: 'flex',
    gap: '6px',
    marginTop: '8px',
  },
  badge: {
    padding: '4px 10px',
    background: '#e0e7ff',
    color: '#667eea',
    borderRadius: '20px',
    fontSize: '12px',
    fontWeight: '600',
  },
  deleteBtn: {
    padding: '8px 12px',
    background: '#fee',
    color: '#e74c3c',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '16px',
  },
};
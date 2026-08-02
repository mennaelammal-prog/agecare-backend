import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import CheckInForm from './CheckInForm';
import Chat from './Chat';
import FamilyContacts from './FamilyContacts';
import History from './History';
import Medications from './Medications';
import Appointments from './Appointments';
import VitalSigns from './VitalSigns';
import FamilyLink from './FamilyLink';

export default function Dashboard() {
  const { logout } = useAuth();
  const [activeTab, setActiveTab] = useState('checkin');

  const tabs = [
    { id: 'checkin', label: 'Daily Check-in', icon: '✅' },
    { id: 'chat', label: 'AI Chat', icon: '💬' },
    { id: 'medications', label: 'Medications', icon: '💊' },
    { id: 'appointments', label: 'Appointments', icon: '📅' },
    { id: 'vitals', label: 'Vital Signs', icon: '🩺' },
    { id: 'family', label: 'Family', icon: '👨‍👩‍👧' },
    { id: 'familylink', label: 'Link Patient', icon: '🔗' },
    { id: 'history', label: 'History', icon: '📊' },
  ];

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <h1 style={styles.logo}>🏥 Age Care App</h1>
        <button onClick={logout} style={styles.logoutBtn}>Logout</button>
      </header>

      <nav style={styles.nav}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              ...styles.tab,
              ...(activeTab === tab.id ? styles.tabActive : {}),
            }}
          >
            <span style={styles.tabIcon}>{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </nav>

      <main style={styles.main}>
        {activeTab === 'checkin' && <CheckInForm />}
        {activeTab === 'chat' && <Chat />}
        {activeTab === 'medications' && <Medications />}
        {activeTab === 'appointments' && <Appointments />}
        {activeTab === 'vitals' && <VitalSigns />}
        {activeTab === 'family' && <FamilyContacts />}
        {activeTab === 'familylink' && <FamilyLink />}
        {activeTab === 'history' && <History />}
      </main>
    </div>
  );
}

const styles = {
  container: {
    minHeight: '100vh',
    background: '#f5f7fa',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '16px 24px',
    background: 'white',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
  },
  logo: {
    margin: 0,
    fontSize: '22px',
    color: '#333',
  },
  logoutBtn: {
    padding: '8px 16px',
    background: '#e74c3c',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
  },
  nav: {
    display: 'flex',
    gap: '6px',
    padding: '12px 16px',
    background: 'white',
    borderBottom: '1px solid #eee',
    overflowX: 'auto',
    flexWrap: 'wrap',
  },
  tab: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    padding: '8px 14px',
    border: 'none',
    borderRadius: '8px',
    background: '#f0f0f0',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: '500',
    whiteSpace: 'nowrap',
  },
  tabActive: {
    background: '#667eea',
    color: 'white',
  },
  tabIcon: {
    fontSize: '16px',
  },
  main: {
    padding: '20px',
    maxWidth: '900px',
    margin: '0 auto',
  },
};
import React, { useState, useEffect } from 'react';
import api from '../api';

export default function CheckInForm() {
  const [mood, setMood] = useState(3);
  const [energy, setEnergy] = useState(3);
  const [pain, setPain] = useState(2);
  const [sleepHours, setSleepHours] = useState(7);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const moods = [
    { val: 1, emoji: '😢', label: 'Very Low', suggestPain: 8 },
    { val: 2, emoji: '😕', label: 'Low', suggestPain: 6 },
    { val: 3, emoji: '😐', label: 'Okay', suggestPain: 4 },
    { val: 4, emoji: '🙂', label: 'Good', suggestPain: 2 },
    { val: 5, emoji: '😊', label: 'Excellent', suggestPain: 0 },
  ];

  const energies = [
    { val: 1, emoji: '😫', label: 'Exhausted' },
    { val: 2, emoji: '😪', label: 'Tired' },
    { val: 3, emoji: '😐', label: 'Average' },
    { val: 4, emoji: '💪', label: 'Energetic' },
    { val: 5, emoji: '⚡', label: 'Very Energetic' },
  ];

  // Auto-suggest pain level when mood changes
  useEffect(() => {
    const selected = moods.find(m => m.val === mood);
    if (selected) {
      setPain(selected.suggestPain);
    }
  }, [mood]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setResult(null);

    try {
      const response = await api.post('/checkin', {
        mood,
        energy,
        pain,
        sleep_hours: sleepHours,
        notes: notes || undefined,
      });
      setResult(response.data.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to submit check-in');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <h2 style={styles.title}>Daily Check-in</h2>

      <form onSubmit={handleSubmit} style={styles.form}>
        {/* Mood */}
        <div style={styles.section}>
          <label style={styles.label}>How is your mood today?</label>
          <div style={styles.scale}>
            {moods.map((m) => (
              <button
                key={m.val}
                type="button"
                onClick={() => setMood(m.val)}
                style={{
                  ...styles.scaleBtn,
                  ...(mood === m.val ? styles.scaleBtnActive : {}),
                }}
              >
                <div style={styles.emoji}>{m.emoji}</div>
                <div style={styles.scaleLabel}>{m.label}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Energy */}
        <div style={styles.section}>
          <label style={styles.label}>Energy level?</label>
          <div style={styles.scale}>
            {energies.map((e) => (
              <button
                key={e.val}
                type="button"
                onClick={() => setEnergy(e.val)}
                style={{
                  ...styles.scaleBtn,
                  ...(energy === e.val ? styles.scaleBtnActive : {}),
                }}
              >
                <div style={styles.emoji}>{e.emoji}</div>
                <div style={styles.scaleLabel}>{e.label}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Pain - now auto-updates from mood! */}
        <div style={styles.section}>
          <label style={styles.label}>
            Pain level: <strong style={{ color: getPainColor(pain), fontSize: '20px' }}>{pain}/10</strong>
          </label>
          <input
            type="range"
            min="0"
            max="10"
            value={pain}
            onChange={(e) => setPain(Number(e.target.value))}
            style={{
              ...styles.slider,
              accentColor: getPainColor(pain),
            }}
          />
          <div style={styles.sliderLabels}>
            <span style={{ color: '#27ae60', fontWeight: 600 }}>No Pain (0)</span>
            <span style={{ color: '#f39c12', fontWeight: 600 }}>Moderate (5)</span>
            <span style={{ color: '#e74c3c', fontWeight: 600 }}>Severe (10)</span>
          </div>
          <p style={styles.hint}>Auto-suggested from your mood. Drag to adjust if needed.</p>
        </div>

        {/* Sleep */}
        <div style={styles.section}>
          <label style={styles.label}>Sleep hours: <strong>{sleepHours}h</strong></label>
          <input
            type="range"
            min="0"
            max="12"
            step="0.5"
            value={sleepHours}
            onChange={(e) => setSleepHours(Number(e.target.value))}
            style={styles.slider}
          />
          <div style={styles.sliderLabels}>
            <span>0h</span>
            <span>6h</span>
            <span>12h</span>
          </div>
        </div>

        {/* Notes */}
        <div style={styles.section}>
          <label style={styles.label}>Additional notes (optional)</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="How are you feeling today? Any concerns?"
            style={styles.textarea}
            rows={3}
          />
        </div>

        {error && <p style={styles.error}>{error}</p>}

        <button type="submit" disabled={loading} style={styles.submitBtn}>
          {loading ? 'Submitting...' : 'Submit Check-in'}
        </button>
      </form>

      {result && (
        <div style={styles.resultCard}>
          <h3 style={styles.resultTitle}>Check-in Recorded!</h3>
          <div style={styles.aiResponse}>
            <strong>AI Response:</strong>
            <p>{result.ai_response}</p>
          </div>
        </div>
      )}
    </div>
  );
}

function getPainColor(pain) {
  if (pain === 0) return '#27ae60';
  if (pain <= 3) return '#2ecc71';
  if (pain <= 5) return '#f39c12';
  if (pain <= 7) return '#e67e22';
  return '#e74c3c';
}

const styles = {
  container: {
    background: 'white',
    borderRadius: '16px',
    padding: '24px',
    boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
  },
  title: {
    margin: '0 0 20px 0',
    color: '#333',
    fontSize: '22px',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '24px',
  },
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  label: {
    fontSize: '16px',
    fontWeight: '600',
    color: '#444',
  },
  scale: {
    display: 'flex',
    gap: '10px',
    flexWrap: 'wrap',
  },
  scaleBtn: {
    flex: 1,
    minWidth: '90px',
    padding: '14px 10px',
    border: '2px solid #e0e0e0',
    borderRadius: '12px',
    background: 'white',
    cursor: 'pointer',
    textAlign: 'center',
    transition: 'all 0.2s',
  },
  scaleBtnActive: {
    borderColor: '#667eea',
    background: '#f0f4ff',
    transform: 'scale(1.05)',
    boxShadow: '0 4px 12px rgba(102,126,234,0.2)',
  },
  emoji: {
    fontSize: '32px',
    marginBottom: '6px',
  },
  scaleLabel: {
    fontSize: '13px',
    color: '#666',
    fontWeight: '500',
  },
  slider: {
    width: '100%',
    height: '10px',
    borderRadius: '5px',
    cursor: 'pointer',
  },
  sliderLabels: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '13px',
    color: '#888',
    marginTop: '4px',
  },
  hint: {
    fontSize: '12px',
    color: '#667eea',
    margin: '4px 0 0 0',
    fontStyle: 'italic',
  },
  textarea: {
    padding: '14px',
    borderRadius: '10px',
    border: '1px solid #ddd',
    fontSize: '15px',
    resize: 'vertical',
    fontFamily: 'inherit',
    outline: 'none',
  },
  error: {
    color: '#e74c3c',
    fontSize: '14px',
    fontWeight: '500',
  },
  submitBtn: {
    padding: '16px',
    background: '#667eea',
    color: 'white',
    border: 'none',
    borderRadius: '12px',
    fontSize: '17px',
    fontWeight: '600',
    cursor: 'pointer',
    boxShadow: '0 4px 12px rgba(102,126,234,0.3)',
    transition: 'transform 0.2s',
  },
  resultCard: {
    marginTop: '24px',
    padding: '20px',
    background: '#f0fff4',
    borderRadius: '12px',
    border: '2px solid #68d391',
  },
  resultTitle: {
    margin: '0 0 12px 0',
    color: '#276749',
    fontSize: '18px',
  },
  aiResponse: {
    color: '#333',
    lineHeight: '1.7',
    fontSize: '15px',
  },
};
import React, { useState, useEffect } from 'react';
import api from '../api';

export default function History() {
  const [checkins, setCheckins] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchHistory();
  }, []);

  const fetchHistory = async () => {
    try {
      const response = await api.get('/checkin/history?limit=30');
      setCheckins(response.data.data);
    } catch (err) {
      console.error('Failed to fetch history:', err);
    } finally {
      setLoading(false);
    }
  };

  const getMoodEmoji = (mood) => {
    const emojis = ['', '😢', '😕', '😐', '🙂', '😊'];
    return emojis[mood] || '😐';
  };

  const getMoodColor = (mood) => {
    const colors = ['', '#e74c3c', '#e67e22', '#f39c12', '#2ecc71', '#27ae60'];
    return colors[mood] || '#999';
  };

  const getPainColor = (pain) => {
    if (pain === 0) return '#27ae60';
    if (pain <= 3) return '#f39c12';
    if (pain <= 6) return '#e67e22';
    return '#e74c3c';
  };

  if (loading) {
    return <div style={styles.loading}>Loading history...</div>;
  }

  return (
    <div style={styles.container}>
      <h2 style={styles.title}>📊 Check-in History</h2>

      {checkins.length === 0 ? (
        <div style={styles.empty}>
          <p>No check-ins yet.</p>
          <p>Submit your first daily check-in to see it here!</p>
        </div>
      ) : (
        <>
          {/* Summary Stats */}
          <div style={styles.stats}>
            <div style={styles.statCard}>
              <div style={styles.statValue}>{checkins.length}</div>
              <div style={styles.statLabel}>Total Check-ins</div>
            </div>
            <div style={styles.statCard}>
              <div style={styles.statValue}>
                {getMoodEmoji(Math.round(checkins.reduce((a, c) => a + c.mood, 0) / checkins.length))}
              </div>
              <div style={styles.statLabel}>Avg Mood</div>
            </div>
            <div style={styles.statCard}>
              <div style={styles.statValue}>
                {(checkins.reduce((a, c) => a + (c.sleep_hours || 0), 0) / checkins.length).toFixed(1)}h
              </div>
              <div style={styles.statLabel}>Avg Sleep</div>
            </div>
          </div>

          {/* Timeline */}
          <div style={styles.timeline}>
            {checkins.map((checkin, index) => (
              <div key={checkin.id} style={styles.timelineItem}>
                <div style={styles.timelineDate}>
                  {new Date(checkin.created_at).toLocaleDateString('en-US', {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                  })}
                </div>
                
                <div style={styles.timelineCard}>
                  <div style={styles.timelineHeader}>
                    <span style={{...styles.moodBadge, background: getMoodColor(checkin.mood)}}>
                      {getMoodEmoji(checkin.mood)} Mood {checkin.mood}/5
                    </span>
                    <span style={{...styles.painBadge, background: getPainColor(checkin.pain)}}>
                      Pain {checkin.pain}/10
                    </span>
                  </div>

                  <div style={styles.timelineDetails}>
                    <div style={styles.detail}>
                      <span style={styles.detailLabel}>Energy:</span>
                      <div style={styles.bar}>
                        <div style={{
                          ...styles.barFill,
                          width: `${(checkin.energy / 5) * 100}%`,
                          background: '#667eea',
                        }} />
                      </div>
                      <span>{checkin.energy}/5</span>
                    </div>

                    {checkin.sleep_hours && (
                      <div style={styles.detail}>
                        <span style={styles.detailLabel}>Sleep:</span>
                        <span>{checkin.sleep_hours} hours</span>
                      </div>
                    )}

                    {checkin.notes && (
                      <div style={styles.notes}>
                        <span style={styles.detailLabel}>Notes:</span>
                        <p style={styles.notesText}>{checkin.notes}</p>
                      </div>
                    )}

                    {checkin.ai_response && (
                      <div style={styles.aiResponse}>
                        <span style={styles.aiLabel}>🤖 AI Response:</span>
                        <p style={styles.aiText}>{checkin.ai_response}</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
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
    margin: '0 0 20px 0',
    color: '#333',
    fontSize: '22px',
  },
  loading: {
    textAlign: 'center',
    padding: '40px',
    color: '#666',
  },
  empty: {
    textAlign: 'center',
    padding: '60px 20px',
    color: '#999',
  },
  stats: {
    display: 'flex',
    gap: '12px',
    marginBottom: '24px',
    flexWrap: 'wrap',
  },
  statCard: {
    flex: 1,
    minWidth: '100px',
    background: '#f8f9fa',
    padding: '16px',
    borderRadius: '12px',
    textAlign: 'center',
  },
  statValue: {
    fontSize: '28px',
    fontWeight: '700',
    color: '#667eea',
  },
  statLabel: {
    fontSize: '13px',
    color: '#666',
    marginTop: '4px',
  },
  timeline: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  timelineItem: {
    display: 'flex',
    gap: '16px',
  },
  timelineDate: {
    width: '80px',
    fontSize: '13px',
    color: '#666',
    fontWeight: '600',
    paddingTop: '12px',
    flexShrink: 0,
  },
  timelineCard: {
    flex: 1,
    background: '#f8f9fa',
    padding: '16px',
    borderRadius: '12px',
    border: '1px solid #e0e0e0',
  },
  timelineHeader: {
    display: 'flex',
    gap: '8px',
    marginBottom: '12px',
    flexWrap: 'wrap',
  },
  moodBadge: {
    padding: '6px 12px',
    borderRadius: '20px',
    color: 'white',
    fontSize: '13px',
    fontWeight: '600',
  },
  painBadge: {
    padding: '6px 12px',
    borderRadius: '20px',
    color: 'white',
    fontSize: '13px',
    fontWeight: '600',
  },
  timelineDetails: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  detail: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    fontSize: '14px',
  },
  detailLabel: {
    fontWeight: '600',
    color: '#555',
    minWidth: '60px',
  },
  bar: {
    flex: 1,
    height: '8px',
    background: '#e0e0e0',
    borderRadius: '4px',
    overflow: 'hidden',
    maxWidth: '200px',
  },
  barFill: {
    height: '100%',
    borderRadius: '4px',
    transition: 'width 0.3s',
  },
  notes: {
    marginTop: '4px',
  },
  notesText: {
    margin: '4px 0 0 0',
    color: '#666',
    fontSize: '14px',
    lineHeight: '1.5',
  },
  aiResponse: {
    marginTop: '8px',
    padding: '12px',
    background: '#e0e7ff',
    borderRadius: '8px',
  },
  aiLabel: {
    fontSize: '13px',
    fontWeight: '600',
    color: '#667eea',
  },
  aiText: {
    margin: '6px 0 0 0',
    color: '#555',
    fontSize: '13px',
    lineHeight: '1.5',
    fontStyle: 'italic',
  },
};
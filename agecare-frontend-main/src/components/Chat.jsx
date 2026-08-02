import React, { useState, useRef, useEffect } from 'react';
import api from '../api';

export default function Chat() {
  const [message, setMessage] = useState('');
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [history]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!message.trim() || loading) return;

    const userMsg = message.trim();
    setMessage('');
    setLoading(true);

    setHistory(prev => [...prev, { role: 'user', content: userMsg }]);

    try {
      const response = await api.post('/chat', {
        message: userMsg,
        history: history.map(h => ({ role: h.role, content: h.content })),
      });

      const aiResponse = response.data.data.response;
      setHistory(prev => [...prev, { role: 'assistant', content: aiResponse }]);

    } catch (err) {
      console.error('Chat error:', err);
      setHistory(prev => [...prev, {
        role: 'assistant',
        content: 'Sorry, I encountered an error. Please try again.'
      }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <h2 style={styles.title}>AI Health Assistant</h2>

      <div style={styles.chatBox}>
        {history.length === 0 && (
          <div style={styles.welcome}>
            <p>Hello! I am your AI health assistant.</p>
            <p>Ask me about health, wellness, or how you are feeling today.</p>
          </div>
        )}

        {history.map((msg, i) => (
          <div
            key={i}
            style={{
              ...styles.message,
              ...(msg.role === 'user' ? styles.userMsg : styles.assistantMsg),
            }}
          >
            <div style={styles.messageHeader}>
              {msg.role === 'user' ? 'You' : 'Assistant'}
            </div>
            <div style={styles.messageContent}>{msg.content}</div>
          </div>
        ))}

        {loading && (
          <div style={styles.loading}>
            <span>Thinking</span>
            <span style={styles.dots}>...</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={handleSubmit} style={styles.inputArea}>
        <input
          type="text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Type your message..."
          style={styles.input}
          disabled={loading}
        />
        <button type="submit" disabled={loading} style={styles.sendBtn}>
          {loading ? '...' : 'Send'}
        </button>
      </form>
    </div>
  );
}

const styles = {
  container: {
    background: 'white',
    borderRadius: '16px',
    padding: '24px',
    boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
    display: 'flex',
    flexDirection: 'column',
    height: '600px',
  },
  title: {
    margin: '0 0 16px 0',
    color: '#333',
    fontSize: '22px',
  },
  chatBox: {
    flex: 1,
    overflowY: 'auto',
    padding: '16px',
    background: '#f8f9fa',
    borderRadius: '12px',
    marginBottom: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  welcome: {
    textAlign: 'center',
    color: '#666',
    padding: '40px 20px',
  },
  message: {
    maxWidth: '80%',
    padding: '12px 16px',
    borderRadius: '12px',
    lineHeight: '1.5',
  },
  userMsg: {
    alignSelf: 'flex-end',
    background: '#667eea',
    color: 'white',
  },
  assistantMsg: {
    alignSelf: 'flex-start',
    background: 'white',
    border: '1px solid #e0e0e0',
  },
  messageHeader: {
    fontSize: '12px',
    fontWeight: '600',
    marginBottom: '4px',
    opacity: 0.8,
  },
  messageContent: {
    fontSize: '14px',
    whiteSpace: 'pre-wrap',
  },
  loading: {
    padding: '12px',
    alignSelf: 'flex-start',
    color: '#667eea',
    fontSize: '14px',
  },
  dots: {
    letterSpacing: '2px',
  },
  inputArea: {
    display: 'flex',
    gap: '8px',
  },
  input: {
    flex: 1,
    padding: '12px 16px',
    borderRadius: '10px',
    border: '1px solid #ddd',
    fontSize: '15px',
    outline: 'none',
  },
  sendBtn: {
    padding: '12px 24px',
    background: '#667eea',
    color: 'white',
    border: 'none',
    borderRadius: '10px',
    fontSize: '15px',
    fontWeight: '600',
    cursor: 'pointer',
  },
};
import React, { createContext, useState, useEffect, useContext } from 'react';
import api from '../api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      fetchUserProfile(token);
    } else {
      setLoading(false);
    }
  }, []);

  async function fetchUserProfile(token) {
    try {
      const res = await api.get('/auth/me');
      setUser(res.data.user);
    } catch (err) {
      console.error('Auth check failed:', err);
      localStorage.removeItem('token');
    } finally {
      setLoading(false);
    }
  }

  function login(token, userData) {
    localStorage.setItem('token', token);
    setUser(userData);
  }

  function logout() {
    localStorage.removeItem('token');
    setUser(null);
    window.location.href = '/login';
  }

  return (
    <AuthContext.Provider value={{
      user,
      isLoggedIn: !!user,
      isAdmin: user?.role === 'admin',
      login,
      logout,
      loading
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { authAPI } from '../services/api';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const logoutTimerRef = useRef(null);

  // Schedule auto-logout when the 12h JWT expires
  const scheduleAutoLogout = (expiresAt) => {
    if (logoutTimerRef.current) clearTimeout(logoutTimerRef.current);
    const ms = new Date(expiresAt).getTime() - Date.now();
    if (ms <= 0) return;
    logoutTimerRef.current = setTimeout(() => {
      localStorage.removeItem('hris_token');
      localStorage.removeItem('hris_user');
      localStorage.removeItem('hris_token_expires');
      if (typeof window !== 'undefined') window.location.href = '/login';
    }, ms);
  };

  useEffect(() => {
    const token = localStorage.getItem('hris_token');
    const stored = localStorage.getItem('hris_user');
    const expiresAt = localStorage.getItem('hris_token_expires');

    if (token && stored) {
      // Client-side expiry check — avoid a network round-trip for stale tokens
      if (expiresAt && new Date(expiresAt).getTime() <= Date.now()) {
        localStorage.removeItem('hris_token');
        localStorage.removeItem('hris_user');
        localStorage.removeItem('hris_token_expires');
        setLoading(false);
        return;
      }

      setUser(JSON.parse(stored));
      if (expiresAt) scheduleAutoLogout(expiresAt);

      authAPI.me().then(res => {
        const u = {
          id: res.data.id,
          email: res.data.email,
          role: res.data.role,
          employeeId: res.data.employee_id,
          firstName: res.data.first_name,
          lastName: res.data.last_name,
          avatarUrl: res.data.avatar_url,
        };
        setUser(u);
        localStorage.setItem('hris_user', JSON.stringify(u));
      }).catch(() => {
        // 401 from server — token expired or revoked
        localStorage.removeItem('hris_token');
        localStorage.removeItem('hris_user');
        localStorage.removeItem('hris_token_expires');
        setUser(null);
      }).finally(() => setLoading(false));
    } else {
      setLoading(false);
    }

    return () => {
      if (logoutTimerRef.current) clearTimeout(logoutTimerRef.current);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const login = async (email, password) => {
    const res = await authAPI.login({ email, password });
    const { token, user: userData, expiresAt } = res.data;
    // Fallback: compute 12h expiry if backend doesn't send it (shouldn't happen)
    const expiry = expiresAt || new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();
    localStorage.setItem('hris_token', token);
    localStorage.setItem('hris_user', JSON.stringify(userData));
    localStorage.setItem('hris_token_expires', expiry);
    setUser(userData);
    scheduleAutoLogout(expiry);
    return userData;
  };

  const logout = () => {
    if (logoutTimerRef.current) clearTimeout(logoutTimerRef.current);
    // Revoke session on server (fire-and-forget — token still in localStorage at call time)
    authAPI.logout().catch(() => {});
    localStorage.removeItem('hris_token');
    localStorage.removeItem('hris_user');
    localStorage.removeItem('hris_token_expires');
    setUser(null);
  };

  const permissions = {
    isAdmin: user?.role === 'super_admin',
    isHR: ['super_admin', 'hr_admin'].includes(user?.role),
    isTeamLead: ['super_admin', 'hr_admin', 'team_lead'].includes(user?.role),
    canManageAll: ['super_admin', 'hr_admin'].includes(user?.role),
    isEmployee: user?.role === 'employee',
    isSelfOnly: user?.role === 'employee',
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, loading, permissions }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);

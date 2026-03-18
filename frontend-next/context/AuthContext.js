import React, { createContext, useContext, useState, useEffect } from 'react';
import { authAPI } from '../services/api';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try {
      const token = localStorage.getItem('hris_token');
      const stored = localStorage.getItem('hris_user');
      if (token && stored) {
        let parsedUser = null;
        try { parsedUser = JSON.parse(stored); } catch (e) {
          localStorage.removeItem('hris_token');
          localStorage.removeItem('hris_user');
          setLoading(false);
          return;
        }
        setUser(parsedUser);
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
          localStorage.removeItem('hris_token');
          localStorage.removeItem('hris_user');
          setUser(null);
        }).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    } catch (e) {
      setLoading(false);
    }
  }, []);

  const login = async (email, password) => {
    const res = await authAPI.login({ email, password });
    const { token, user: userData } = res.data;
    localStorage.setItem('hris_token', token);
    localStorage.setItem('hris_user', JSON.stringify(userData));
    setUser(userData);
    return userData;
  };

  const logout = () => {
    localStorage.removeItem('hris_token');
    localStorage.removeItem('hris_user');
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

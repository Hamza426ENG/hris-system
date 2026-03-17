import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Employees from './pages/Employees';
import EmployeeProfile from './pages/EmployeeProfile';
import Organogram from './pages/Organogram';
import Leaves from './pages/Leaves';
import Payroll from './pages/Payroll';
import PayrollDetail from './pages/PayrollDetail';
import Salary from './pages/Salary';
import Reports from './pages/Reports';
import Settings from './pages/Settings';

const PrivateRoute = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return (
    <div className="min-h-screen bg-oe-bg flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-10 h-10 border-2 border-oe-primary border-t-transparent rounded-full animate-spin" />
        <span className="text-oe-muted text-sm">Loading HRIS...</span>
      </div>
    </div>
  );
  return user ? children : <Navigate to="/login" replace />;
};

const PublicRoute = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return null;
  return user ? <Navigate to="/" replace /> : children;
};

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter basename={process.env.PUBLIC_URL}>
        <Routes>
          <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
          <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
            <Route index element={<Dashboard />} />
            <Route path="employees" element={<Employees />} />
            <Route path="employees/:id" element={<EmployeeProfile />} />
            <Route path="organogram" element={<Organogram />} />
            <Route path="leaves" element={<Leaves />} />
            <Route path="payroll" element={<Payroll />} />
            <Route path="payroll/:id" element={<PayrollDetail />} />
            <Route path="salary" element={<Salary />} />
            <Route path="reports" element={<Reports />} />
            <Route path="settings" element={<Settings />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

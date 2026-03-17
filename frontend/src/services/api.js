import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || '/api';

const api = axios.create({ baseURL: API_URL });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('hris_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  // Bypass localtunnel reminder page for API requests
  config.headers['bypass-tunnel-reminder'] = 'true';
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('hris_token');
      localStorage.removeItem('hris_user');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export const authAPI = {
  login: (data) => api.post('/auth/login', data),
  me: () => api.get('/auth/me'),
  changePassword: (data) => api.put('/auth/change-password', data),
};

export const employeesAPI = {
  list: (params) => api.get('/employees', { params }),
  get: (id) => api.get(`/employees/${id}`),
  create: (data) => api.post('/employees', data),
  bulkImport: (employees) => api.post('/employees/bulk', { employees }),
  update: (id, data) => api.put(`/employees/${id}`, data),
  delete: (id) => api.delete(`/employees/${id}`),
  updateAvatar: (id, avatar_url) => api.put(`/employees/${id}/avatar`, { avatar_url }),
  getLeaves: (id) => api.get(`/employees/${id}/leaves`),
  getSalary: (id) => api.get(`/employees/${id}/salary`),
  getPayroll: (id) => api.get(`/employees/${id}/payroll`),
};

export const departmentsAPI = {
  list: () => api.get('/departments'),
  get: (id) => api.get(`/departments/${id}`),
  create: (data) => api.post('/departments', data),
  update: (id, data) => api.put(`/departments/${id}`, data),
  delete: (id) => api.delete(`/departments/${id}`),
};

export const positionsAPI = {
  list: (params) => api.get('/positions', { params }),
  create: (data) => api.post('/positions', data),
  update: (id, data) => api.put(`/positions/${id}`, data),
  delete: (id) => api.delete(`/positions/${id}`),
};

export const leavesAPI = {
  list: (params) => api.get('/leaves', { params }),
  get: (id) => api.get(`/leaves/${id}`),
  create: (data) => api.post('/leaves', data),
  approve: (id, data) => api.put(`/leaves/${id}/approve`, data),
  reject: (id, data) => api.put(`/leaves/${id}/reject`, data),
  cancel: (id) => api.put(`/leaves/${id}/cancel`),
  types: () => api.get('/leaves/types'),
  createType: (data) => api.post('/leaves/types', data),
  updateType: (id, data) => api.put(`/leaves/types/${id}`, data),
  balances: (empId, params) => api.get(`/leaves/balances/${empId}`, { params }),
};

export const salaryAPI = {
  list: () => api.get('/salary'),
  create: (data) => api.post('/salary', data),
  update: (id, data) => api.put(`/salary/${id}`, data),
};

export const payrollAPI = {
  list: () => api.get('/payroll'),
  get: (id) => api.get(`/payroll/${id}`),
  create: (data) => api.post('/payroll', data),
  generate: (id) => api.post(`/payroll/${id}/generate`),
  complete: (id) => api.put(`/payroll/${id}/complete`),
  cancel: (id) => api.put(`/payroll/${id}/cancel`),
  updateItem: (itemId, data) => api.put(`/payroll/items/${itemId}`, data),
};

export const organogramAPI = {
  get: () => api.get('/organogram'),
};

export const reportsAPI = {
  headcount: (params) => api.get('/reports/headcount', { params }),
  leaves: (params) => api.get('/reports/leaves', { params }),
  payroll: (params) => api.get('/reports/payroll', { params }),
  salary: () => api.get('/reports/salary'),
};

export const dashboardAPI = {
  stats: () => api.get('/dashboard/stats'),
};

export const announcementsAPI = {
  list: () => api.get('/announcements'),
  create: (data) => api.post('/announcements', data),
  delete: (id) => api.delete(`/announcements/${id}`),
};

export const adminAPI = {
  users: (params) => api.get('/admin/users', { params }),
  updateRole: (id, role) => api.put(`/admin/users/${id}/role`, { role }),
  toggleUser: (id) => api.put(`/admin/users/${id}/toggle`),
};

export default api;

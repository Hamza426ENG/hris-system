import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '/api';

const api = axios.create({ baseURL: API_URL });

api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('hris_token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  config.headers['bypass-tunnel-reminder'] = 'true';
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      if (typeof window !== 'undefined') {
        localStorage.removeItem('hris_token');
        localStorage.removeItem('hris_user');
        window.location.href = '/login';
      }
    }
    return Promise.reject(err);
  }
);

export const authAPI = {
  login: (data) => api.post('/auth/login', data),
  me: () => api.get('/auth/me'),
  logout: () => api.post('/auth/logout'),
  changePassword: (data) => api.put('/auth/change-password', data),
};

export const employeesAPI = {
  list: (params) => api.get('/employees', { params }),
  get: (id) => api.get(`/employees/${id}`),
  create: (data) => api.post('/employees', data),
  update: (id, data) => api.put(`/employees/${id}`, data),
  delete: (id) => api.delete(`/employees/${id}`),
  activate: (id) => api.patch(`/employees/${id}/activate`),
  updateAvatar: (id, avatar_url) => api.put(`/employees/${id}/avatar`, { avatar_url }),
  getLeaves: (id) => api.get(`/employees/${id}/leaves`),
  getSalary: (id) => api.get(`/employees/${id}/salary`),
  getPayroll: (id) => api.get(`/employees/${id}/payroll`),
  getResignation: (id) => api.get(`/employees/${id}/resignation`),
  downloadTemplate: () => api.get('/employees/sample-template', { responseType: 'blob' }),
  bulkImport: (formData) => api.post('/employees/bulk-import', formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
  exportAll: () => api.get('/employees/export', { responseType: 'blob' }),
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
  list: (params) => api.get('/announcements', { params }),
  create: (data) => api.post('/announcements', data),
  update: (id, data) => api.patch(`/announcements/${id}`, data),
  delete: (id) => api.delete(`/announcements/${id}`),
};

export const adminAPI = {
  users: (params) => api.get('/admin/users', { params }),
  createUser: (data) => api.post('/admin/users', data),
  updateRole: (id, role) => api.put(`/admin/users/${id}/role`, { role }),
  toggleUser: (id) => api.put(`/admin/users/${id}/toggle`),
  deleteUser: (id) => api.delete(`/admin/users/${id}`),
  updatePassword: (id, password) => api.put(`/admin/users/${id}/password`, { password }),
  sessions: (params) => api.get('/admin/sessions', { params }),
  revokeSession: (id) => api.delete(`/admin/sessions/${id}`),
  revokeUserSessions: (userId) => api.delete(`/admin/sessions/user/${userId}`),
};

export const attendanceAPI = {
  // Self-service
  today: () => api.get('/attendance/today'),
  checkIn: () => api.post('/attendance/checkin'),
  checkOut: () => api.post('/attendance/checkout'),
  history: (params) => api.get('/attendance/history', { params }),
  // Summary dashboard
  summary: (empId, params) => api.get(`/attendance/summary/${empId}`, { params }),
  // Admin / HR
  listAll: (params) => api.get('/attendance/all', { params }),
  getEmployee: (empId, params) => api.get(`/attendance/employee/${empId}`, { params }),
  createManual: (data) => api.post('/attendance/manual', data),
  update: (id, data) => api.put(`/attendance/${id}`, data),
  delete: (id) => api.delete(`/attendance/${id}`),
  liveToday: () => api.get('/attendance/live-today'),
  streamUrl: (token) => `${API_URL}/attendance/stream?token=${encodeURIComponent(token)}`,
  syncStatus: () => api.get('/attendance/sync-status'),
  syncNow: () => api.post('/attendance/sync-now'),
};

export const auditLogsAPI = {
  list: (params) => api.get('/logs', { params }),
};

export const performanceAPI = {
  getLatest: (empId) => api.get(`/performance/employee/${empId}`),
  create: (empId, data) => api.post(`/performance/employee/${empId}`, data),
  update: (empId, data) => api.post(`/performance/employee/${empId}`, data),
  history: (empId, params) => api.get(`/performance/history/${empId}`, { params }),
};

export const adminDataAPI = {
  updateEmployee: (id, data) => api.put(`/admin-data/employees/${id}`, data),
  seedSampleData: () => api.post('/admin-data/seed-sample-data'),
};

export const configAPI = {
  get: () => api.get('/config'),
};

export const profileRequestsAPI = {
  list: (params) => api.get('/profile-requests', { params }),
  create: (data) => api.post('/profile-requests', data),
  approve: (id, data) => api.put(`/profile-requests/${id}/approve`, data),
  reject: (id, data) => api.put(`/profile-requests/${id}/reject`, data),
  pendingCount: () => api.get('/profile-requests/pending/count'),
};

export const ticketsAPI = {
  // Tickets CRUD
  list: (params) => api.get('/tickets', { params }),
  get: (id) => api.get(`/tickets/${id}`),
  create: (data) => api.post('/tickets', data),
  update: (id, data) => api.patch(`/tickets/${id}`, data),
  delete: (id) => api.delete(`/tickets/${id}`),
  resolve: (id, data) => api.post(`/tickets/${id}/resolve`, data),
  close: (id, data) => api.post(`/tickets/${id}/close`, data),
  reopen: (id, data) => api.post(`/tickets/${id}/reopen`, data),
  // Stats & Analytics
  stats: () => api.get('/tickets/stats/summary'),
  analytics: (params) => api.get('/tickets/analytics/dashboard', { params }),
  // Categories & SLA
  categories: () => api.get('/tickets/categories'),
  createCategory: (data) => api.post('/tickets/categories', data),
  slaRules: () => api.get('/tickets/sla-rules'),
  // Assignable users
  assignableUsers: () => api.get('/tickets/assignable-users'),
  // Comments
  addComment: (ticketId, data) => api.post(`/tickets/${ticketId}/comments`, data),
  editComment: (ticketId, commentId, data) => api.patch(`/tickets/${ticketId}/comments/${commentId}`, data),
  deleteComment: (ticketId, commentId) => api.delete(`/tickets/${ticketId}/comments/${commentId}`),
  // Attachments
  uploadAttachment: (ticketId, formData) => api.post(`/tickets/${ticketId}/attachments`, formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
  downloadAttachment: (ticketId, attachmentId) => api.get(`/tickets/${ticketId}/attachments/${attachmentId}/download`, { responseType: 'blob' }),
  deleteAttachment: (ticketId, attachmentId) => api.delete(`/tickets/${ticketId}/attachments/${attachmentId}`),
  // Notifications
  notifications: (params) => api.get('/tickets/notifications', { params }),
  markNotificationsRead: (data) => api.post('/tickets/notifications/mark-read', data),
};

export const edgeBotAPI = {
  // Chat
  send: (data) => api.post('/chat', data),
  // Sessions
  sessions: () => api.get('/chat/sessions'),
  getSession: (id) => api.get(`/chat/sessions/${id}`),
  deleteSession: (id) => api.delete(`/chat/sessions/${id}`),
};

export const knowledgeBaseAPI = {
  list: (params) => api.get('/knowledge-base', { params }),
  categories: () => api.get('/knowledge-base/categories'),
  get: (id) => api.get(`/knowledge-base/${id}`),
  create: (data) => api.post('/knowledge-base', data),
  update: (id, data) => api.put(`/knowledge-base/${id}`, data),
  delete: (id) => api.delete(`/knowledge-base/${id}`),
};

export const itInventoryAPI = {
  // Assets CRUD
  listAssets: (params) => api.get('/it-inventory/assets', { params }),
  getAsset: (id) => api.get(`/it-inventory/assets/${id}`),
  createAsset: (data) => api.post('/it-inventory/assets', data),
  updateAsset: (id, data) => api.put(`/it-inventory/assets/${id}`, data),
  deleteAsset: (id) => api.delete(`/it-inventory/assets/${id}`),
  // Assignment & Return
  assignAsset: (id, data) => api.post(`/it-inventory/assets/${id}/assign`, data),
  returnAsset: (id, data) => api.post(`/it-inventory/assets/${id}/return`, data),
  // Employee Asset View
  myAssets: () => api.get('/it-inventory/my-assets'),
  employeeAssets: (empId) => api.get(`/it-inventory/employee/${empId}/assets`),
  // Maintenance
  listMaintenance: (params) => api.get('/it-inventory/maintenance', { params }),
  createMaintenance: (data) => api.post('/it-inventory/maintenance', data),
  updateMaintenance: (id, data) => api.put(`/it-inventory/maintenance/${id}`, data),
  // Audit Log
  auditLog: (params) => api.get('/it-inventory/audit-log', { params }),
  // Dashboard & Reports
  dashboard: () => api.get('/it-inventory/dashboard'),
  warrantyReport: (params) => api.get('/it-inventory/reports/warranty', { params }),
  unassignedReport: () => api.get('/it-inventory/reports/unassigned'),
  repairCostsReport: () => api.get('/it-inventory/reports/repair-costs'),
  employeeAssetsReport: (params) => api.get('/it-inventory/reports/employee-assets', { params }),
  // Employees for dropdowns
  employees: () => api.get('/it-inventory/employees'),
};

export const devicesAPI = {
  list: () => api.get('/devices'),
  get: (id) => api.get(`/devices/${id}`),
  create: (data) => api.post('/devices', data),
  update: (id, data) => api.put(`/devices/${id}`, data),
  delete: (id) => api.delete(`/devices/${id}`),
  test: (id) => api.post(`/devices/${id}/test`),
  sync: (id, params) => api.post(`/devices/${id}/sync`, null, { params }),
  getUsers: (id) => api.get(`/devices/${id}/users`),
  mapUser: (id, data) => api.post(`/devices/${id}/map-user`, data),
  getMappings: (id) => api.get(`/devices/${id}/mappings`),
  getRawLogs: (id, params) => api.get(`/devices/${id}/raw-logs`, { params }),
};

export const documentsAPI = {
  // List documents for an employee
  list: (employeeId, params) => api.get(`/documents/employee/${employeeId}`, { params }),
  // Upload a document (multipart/form-data)
  upload: (employeeId, formData) =>
    api.post(`/documents/employee/${employeeId}`, formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
  // Download or view a document (returns blob)
  download: (id) => api.get(`/documents/${id}/download`, { responseType: 'blob' }),
  // View URL includes token so window.open() works without Authorization header
  viewUrl: (id) => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('hris_token') : '';
    return `${API_URL}/documents/${id}/view?token=${encodeURIComponent(token || '')}`;
  },
  // Update status (verify / reject / expire)
  updateStatus: (id, data) => api.put(`/documents/${id}/status`, data),
  // Update metadata
  update: (id, data) => api.put(`/documents/${id}`, data),
  // Delete
  delete: (id) => api.delete(`/documents/${id}`),
  // Expiring documents report
  expiring: (days) => api.get('/documents/expiring', { params: { days } }),
};

export const resignationsAPI = {
  list: (params) => api.get('/resignations', { params }),
  get: (id) => api.get(`/resignations/${id}`),
  create: (data) => api.post('/resignations', data),
  update: (id, data) => api.put(`/resignations/${id}`, data),
  approve: (id) => api.put(`/resignations/${id}/approve`),
  reject: (id, data) => api.put(`/resignations/${id}/reject`, data),
  complete: (id) => api.put(`/resignations/${id}/complete`),
  withdraw: (id) => api.put(`/resignations/${id}/withdraw`),
  delete: (id) => api.delete(`/resignations/${id}`),
};

export const attendanceSettingsAPI = {
  get: () => api.get('/attendance/settings'),
  update: (data) => api.put('/attendance/settings', data),
};

export default api;

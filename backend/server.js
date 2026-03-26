require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const migrate = require('./migrate');
const attendanceSyncScheduler = require('./services/attendanceSyncScheduler');

const app = express();

// Disable ETags so all successful responses return 200 (not 304 Not Modified).
// ETags are useful for bandwidth reduction but cause confusion in development
// and when clients expect fresh data on every request.
app.set('etag', false);

// Run DB migration on startup
migrate().catch(console.error);

// Middleware
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms`);
  });
  next();
});

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok', time: new Date() }));
app.get('/', (req, res) => res.json({ message: 'HRIS API v1.0', status: 'running' }));

// Routes
app.use('/api/config', require('./routes/config'));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/employees', require('./routes/employees'));
app.use('/api/departments', require('./routes/departments'));
app.use('/api/positions', require('./routes/positions'));
app.use('/api/leaves', require('./routes/leaves'));
app.use('/api/salary', require('./routes/salary'));
app.use('/api/payroll', require('./routes/payroll'));
app.use('/api/organogram', require('./routes/organogram'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/announcements', require('./routes/announcements'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/admin-data', require('./routes/admin-data'));
app.use('/api/chat', require('./routes/chat'));
app.use('/api/knowledge-base', require('./routes/knowledge-base'));
app.use('/api/attendance', require('./routes/attendance'));
app.use('/api/performance', require('./routes/performance'));
app.use('/api/logs', require('./routes/logs'));
app.use('/api/devices', require('./routes/devices'));
app.use('/api/tickets', require('./routes/tickets'));
app.use('/api/it-inventory', require('./routes/it-inventory'));
app.use('/api/profile-requests', require('./routes/profile-requests'));
app.use('/api/documents',        require('./routes/documents'));
app.use('/api/resignations',     require('./routes/resignations'));
app.use('/api/work-shifts',      require('./routes/work-shifts'));
app.use('/api/transport',        require('./routes/transport'));

// Serve document uploads (authenticated)
app.use('/uploads/documents', require('./middleware/auth').authenticate, require('express').static(path.join(__dirname, 'uploads', 'documents')));

// Serve ticket attachment uploads
app.use('/uploads/tickets', require('./middleware/auth').authenticate, require('express').static(path.join(__dirname, 'uploads', 'tickets')));

// 404
app.use((req, res) => res.status(404).json({ error: 'Route not found' }));

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error', message: err.message });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`HRIS Backend running on port ${PORT}`);

  // Start ZKTeco attendance auto-sync scheduler
  attendanceSyncScheduler.start();
});

// Graceful shutdown — stop scheduler and disconnect devices
process.on('SIGTERM', () => {
  attendanceSyncScheduler.stop();
  const zkService = require('./services/zktecoService');
  zkService.disconnectAll();
});
process.on('SIGINT', () => {
  attendanceSyncScheduler.stop();
  const zkService = require('./services/zktecoService');
  zkService.disconnectAll();
  process.exit(0);
});

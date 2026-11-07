require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const authRoutes = require('./routes/auth');
const syncRoutes = require('./routes/sync');
const profileRoutes = require('./routes/profile');
const historyRoutes = require('./routes/history');
const mealsRoutes = require('./routes/meals');
const workoutRoutes = require('./routes/workouts');

const app = express();
const PORT = process.env.PORT || 3000;

// CORS for mobile app clients
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json());

// Routes
app.use('/v1/auth', authRoutes);
app.use('/v1/sync', syncRoutes);
app.use('/v1/profile', profileRoutes);
app.use('/v1/history', historyRoutes);
app.use('/v1/meals', mealsRoutes);
app.use('/v1/workouts', workoutRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  const dbState = mongoose.connection.readyState;
  const dbStatus = dbState === 1 ? 'connected' : 'disconnected';
  const httpStatus = dbState === 1 ? 200 : 503;

  res.status(httpStatus).json({
    status: dbState === 1 ? 'healthy' : 'unhealthy',
    timestamp: new Date().toISOString(),
    database: dbStatus,
    uptime: process.uptime(),
  });
});

app.get('/v1/health', (req, res) => {
  const dbState = mongoose.connection.readyState;
  const dbStatus = dbState === 1 ? 'connected' : 'disconnected';
  const httpStatus = dbState === 1 ? 200 : 503;

  res.status(httpStatus).json({
    status: dbState === 1 ? 'healthy' : 'unhealthy',
    timestamp: new Date().toISOString(),
    database: dbStatus,
    uptime: process.uptime(),
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/nutrisimple')
  .then(() => {
    console.log('Connected to MongoDB');
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  });

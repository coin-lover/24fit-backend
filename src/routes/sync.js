const express = require('express');
const UserData = require('../models/UserData');
const Workout = require('../models/Workout');
const { authenticateToken } = require('../middleware/auth');
const { validatePagination } = require('../utils/pagination');
const {
  validateWorkoutSession,
  toInternalWorkout,
  upsertByClientId,
  validateDateRange,
  toApiFormat,
} = require('../services/workoutService');

const router = express.Router();

function isValidDateString(dateStr) {
  if (typeof dateStr !== 'string') return false;
  const regex = /^\d{4}-\d{2}-\d{2}$/;
  if (!regex.test(dateStr)) return false;
  const date = new Date(dateStr);
  return !Number.isNaN(date.getTime());
}

function parseTimestamp(timestampValue) {
  if (timestampValue === undefined || timestampValue === null) {
    return Date.now();
  }

  if (typeof timestampValue === 'number' && Number.isFinite(timestampValue)) {
    return timestampValue;
  }

  if (typeof timestampValue === 'string') {
    // Try parsing as number first (Unix seconds or milliseconds)
    const numeric = Number(timestampValue);
    if (Number.isFinite(numeric)) {
      return numeric;
    }

    // Try parsing as ISO date string
    const parsed = new Date(timestampValue).getTime();
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }

  return null;
}

function generateMealId(date, timestamp, item) {
  const safeItem = String(item)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `${date}-${timestamp}-${safeItem}`;
}

function validateMealInput(date, item, totalCalories) {
  if (!date || !isValidDateString(date)) {
    return { valid: false, error: 'Invalid or missing date. Expected YYYY-MM-DD.' };
  }

  if (!item || typeof item !== 'string' || item.trim().length === 0) {
    return { valid: false, error: 'Invalid or missing item. Expected non-empty string.' };
  }

  if (typeof totalCalories !== 'number' || Number.isNaN(totalCalories) || totalCalories < 0) {
    return { valid: false, error: 'Invalid or missing total_calories. Expected non-negative number.' };
  }

  return { valid: true };
}

// POST /v1/sync/profile
router.post('/profile', authenticateToken, async (req, res) => {
  try {
    const { server_user_id, profile } = req.body;
    if (!server_user_id || server_user_id !== req.userId) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    await UserData.findOneAndUpdate(
      { userId: req.userId },
      { profile, updatedAt: new Date() },
      { upsert: true, new: true }
    );

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('Sync profile error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /v1/sync/meals
router.post('/meals', authenticateToken, async (req, res) => {
  try {
    const { server_user_id, date, timestamp, item, total_calories } = req.body;

    if (!server_user_id || server_user_id !== req.userId) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const validation = validateMealInput(date, item, total_calories);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }

    const parsedTimestamp = parseTimestamp(timestamp);
    if (parsedTimestamp === null) {
      return res.status(400).json({ error: 'Invalid timestamp.' });
    }

    let userData = await UserData.findOne({ userId: req.userId });
    if (!userData) {
      userData = new UserData({ userId: req.userId, meals: [] });
    }

    const trimmedItem = item.trim();
    const serverMealId = generateMealId(date, parsedTimestamp, trimmedItem);
    const existingIndex = userData.meals.findIndex(
      (m) => m.server_meal_id === serverMealId
    );

    const mealRecord = {
      server_meal_id: serverMealId,
      date,
      timestamp: parsedTimestamp,
      item: trimmedItem,
      total_calories: total_calories,
      updated_at: new Date().toISOString(),
    };

    if (existingIndex >= 0) {
      userData.meals[existingIndex] = mealRecord;
    } else {
      userData.meals.push(mealRecord);
    }

    userData.updatedAt = new Date();
    await userData.save();

    return res.status(200).json({ server_meal_id: serverMealId });
  } catch (err) {
    console.error('Sync meals error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /v1/sync/data
router.get('/data', authenticateToken, async (req, res) => {
  try {
    const { server_user_id } = req.query;
    if (!server_user_id || server_user_id !== req.userId) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const userData = await UserData.findOne({ userId: req.userId }).lean();
    if (!userData) {
      return res.status(200).json({ profile: null, meals: [] });
    }

    return res.status(200).json({
      profile: userData.profile || null,
      meals: userData.meals || [],
    });
  } catch (err) {
    console.error('Sync data error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /v1/sync/workouts
router.post('/workouts', authenticateToken, async (req, res) => {
  try {
    const { server_user_id, client_workout_id, workout } = req.body;

    if (!server_user_id || server_user_id !== req.userId) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    if (typeof client_workout_id !== 'string' || client_workout_id.trim().length === 0) {
      return res.status(400).json({ error: 'Invalid or missing client_workout_id. Expected non-empty string.' });
    }

    const validation = validateWorkoutSession(workout, { requireClientId: false });
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }

    const { created, workout: savedWorkout } = await upsertByClientId(
      req.userId,
      client_workout_id,
      toInternalWorkout(workout)
    );

    return res.status(created ? 201 : 200).json({
      server_workout_id: savedWorkout._id.toString(),
      client_workout_id: savedWorkout.clientWorkoutId,
      synced_at: savedWorkout.updatedAt.getTime(),
    });
  } catch (err) {
    console.error('Sync workouts error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /v1/sync/workouts
router.get('/workouts', authenticateToken, async (req, res) => {
  try {
    const { server_user_id, start_date, end_date } = req.query;

    if (!server_user_id || server_user_id !== req.userId) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const pagination = validatePagination(req.query);
    if (!pagination.valid) {
      return res.status(pagination.error.status).json({ error: pagination.error.message });
    }

    const filter = { userId: req.userId };
    if (start_date || end_date) {
      const range = validateDateRange(start_date, end_date);
      if (!range.valid) {
        return res.status(400).json({ error: range.error });
      }
      filter.startedAt = { $gte: range.gte, $lte: range.lte };
    }

    const total = await Workout.countDocuments(filter);
    const workouts = await Workout.find(filter)
      .sort({ startedAt: -1 })
      .skip((pagination.page - 1) * pagination.limit)
      .limit(pagination.limit);

    return res.status(200).json({
      workouts: workouts.map(toApiFormat),
      pagination: {
        page: pagination.page,
        limit: pagination.limit,
        total,
      },
    });
  } catch (err) {
    console.error('Get sync workouts error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
module.exports.generateMealId = generateMealId;
module.exports.validateMealInput = validateMealInput;
module.exports.parseTimestamp = parseTimestamp;
module.exports.isValidDateString = isValidDateString;

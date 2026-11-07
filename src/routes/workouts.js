const express = require('express');
const mongoose = require('mongoose');
const Workout = require('../models/Workout');
const { authenticateToken } = require('../middleware/auth');
const {
  validateWorkoutSession,
  toInternalWorkout,
  computeStats,
} = require('../services/workoutService');

const router = express.Router();

// PUT /v1/workouts/:id
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(404).json({ error: 'Workout not found' });
    }

    const workout = await Workout.findOne({ _id: req.params.id, userId: req.userId });
    if (!workout) {
      return res.status(404).json({ error: 'Workout not found' });
    }

    if (req.body && typeof req.body === 'object'
      && req.body.client_workout_id !== undefined
      && req.body.client_workout_id !== workout.clientWorkoutId) {
      return res.status(400).json({ error: 'client_workout_id cannot be modified' });
    }

    const validation = validateWorkoutSession(req.body, { requireClientId: false });
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }

    const internal = toInternalWorkout(req.body);
    workout.name = internal.name;
    workout.startedAt = internal.startedAt;
    workout.finishedAt = internal.finishedAt;
    workout.exercises = internal.exercises;

    const stats = computeStats(internal.exercises, internal.startedAt, internal.finishedAt);
    workout.volumeKg = stats.volumeKg;
    workout.totalSets = stats.totalSets;
    workout.durationMinutes = stats.durationMinutes;

    await workout.save();

    return res.status(200).json({
      server_workout_id: workout._id.toString(),
      updated_at: workout.updatedAt.getTime(),
    });
  } catch (err) {
    console.error('Update workout error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /v1/workouts/:id
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(404).json({ error: 'Workout not found' });
    }

    const result = await Workout.deleteOne({ _id: req.params.id, userId: req.userId });
    if (result.deletedCount === 0) {
      return res.status(404).json({ error: 'Workout not found' });
    }

    return res.status(204).send();
  } catch (err) {
    console.error('Delete workout error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;

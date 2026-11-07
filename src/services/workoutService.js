const Workout = require('../models/Workout');

const MAX_EXERCISES = 100;
const MAX_SETS_PER_EXERCISE = 100;
const MAX_DATE_RANGE_DAYS = 365;

function isValidDateValue(value) {
  if (typeof value !== 'string' || value.trim().length === 0) return false;
  return !Number.isNaN(new Date(value).getTime());
}

function isNullableNumber(value) {
  return value === null || value === undefined
    || (typeof value === 'number' && Number.isFinite(value));
}

function isNullableString(value) {
  return value === null || value === undefined || typeof value === 'string';
}

function validateWorkoutSession(body, { requireClientId = true } = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { valid: false, error: 'Invalid workout body. Expected JSON object.' };
  }

  if (requireClientId && (typeof body.client_workout_id !== 'string' || body.client_workout_id.trim().length === 0)) {
    return { valid: false, error: 'Invalid or missing client_workout_id. Expected non-empty string.' };
  }

  if (!isValidDateValue(body.started_at)) {
    return { valid: false, error: 'Invalid or missing started_at. Expected ISO 8601 string.' };
  }

  if (!isValidDateValue(body.finished_at)) {
    return { valid: false, error: 'Invalid or missing finished_at. Expected ISO 8601 string.' };
  }

  if (new Date(body.finished_at) < new Date(body.started_at)) {
    return { valid: false, error: 'finished_at must be on or after started_at.' };
  }

  if (body.name !== undefined && body.name !== null && typeof body.name !== 'string') {
    return { valid: false, error: 'Invalid name. Expected string.' };
  }

  if (!Array.isArray(body.exercises)) {
    return { valid: false, error: 'Invalid or missing exercises. Expected array.' };
  }

  if (body.exercises.length > MAX_EXERCISES) {
    return { valid: false, error: `Too many exercises. Maximum is ${MAX_EXERCISES}.` };
  }

  for (let i = 0; i < body.exercises.length; i += 1) {
    const exercise = body.exercises[i];
    if (!exercise || typeof exercise !== 'object') {
      return { valid: false, error: `Invalid exercise at index ${i}. Expected object.` };
    }
    if (typeof exercise.exercise_id !== 'string' || exercise.exercise_id.trim().length === 0) {
      return { valid: false, error: `Invalid or missing exercise_id for exercise at index ${i}.` };
    }
    if (!isNullableString(exercise.exercise_name)) {
      return { valid: false, error: `Invalid exercise_name for exercise at index ${i}.` };
    }
    if (!isNullableString(exercise.category)) {
      return { valid: false, error: `Invalid category for exercise at index ${i}.` };
    }
    if (!Array.isArray(exercise.sets)) {
      return { valid: false, error: `Invalid or missing sets for exercise at index ${i}. Expected array.` };
    }
    if (exercise.sets.length > MAX_SETS_PER_EXERCISE) {
      return { valid: false, error: `Too many sets for exercise at index ${i}. Maximum is ${MAX_SETS_PER_EXERCISE}.` };
    }

    for (let j = 0; j < exercise.sets.length; j += 1) {
      const set = exercise.sets[j];
      if (!set || typeof set !== 'object') {
        return { valid: false, error: `Invalid set at index ${j} for exercise at index ${i}.` };
      }
      const numericFields = ['set_number', 'kg', 'reps', 'rest_seconds', 'distance_km', 'time_seconds'];
      for (const field of numericFields) {
        if (!isNullableNumber(set[field])) {
          return { valid: false, error: `Invalid ${field} for set at index ${j} of exercise at index ${i}. Expected number or null.` };
        }
      }
      if (set.done !== undefined && set.done !== null && typeof set.done !== 'boolean') {
        return { valid: false, error: `Invalid done for set at index ${j} of exercise at index ${i}. Expected boolean.` };
      }
      if (!isNullableString(set.logged_at)) {
        return { valid: false, error: `Invalid logged_at for set at index ${j} of exercise at index ${i}. Expected ISO 8601 string or null.` };
      }
    }
  }

  return { valid: true };
}

function toInternalWorkout(body) {
  return {
    name: body.name ?? null,
    startedAt: body.started_at,
    finishedAt: body.finished_at,
    exercises: body.exercises.map((exercise) => ({
      exerciseId: exercise.exercise_id,
      exerciseName: exercise.exercise_name ?? null,
      category: exercise.category ?? null,
      sets: exercise.sets.map((set) => ({
        setNumber: set.set_number ?? null,
        kg: set.kg ?? null,
        reps: set.reps ?? null,
        restSeconds: set.rest_seconds ?? null,
        done: set.done ?? false,
        distanceKm: set.distance_km ?? null,
        timeSeconds: set.time_seconds ?? null,
        loggedAt: set.logged_at ?? null,
      })),
    })),
  };
}

function computeStats(exercises, startedAt, finishedAt) {
  let volumeKg = 0;
  let totalSets = 0;

  for (const exercise of exercises) {
    totalSets += exercise.sets.length;
    for (const set of exercise.sets) {
      const isDistanceSet = set.distanceKm !== null && set.distanceKm !== undefined;
      if (set.done && !isDistanceSet
        && typeof set.kg === 'number' && typeof set.reps === 'number') {
        volumeKg += set.kg * set.reps;
      }
    }
  }

  const startedMs = new Date(startedAt).getTime();
  const finishedMs = new Date(finishedAt).getTime();
  const durationMinutes = Number.isNaN(startedMs) || Number.isNaN(finishedMs)
    ? 0
    : Math.round(((finishedMs - startedMs) / 60000) * 10) / 10;

  return { volumeKg: Math.round(volumeKg * 100) / 100, totalSets, durationMinutes };
}

function buildWorkoutFields(userId, clientWorkoutId, internal) {
  const stats = computeStats(internal.exercises, internal.startedAt, internal.finishedAt);
  return {
    userId,
    clientWorkoutId,
    name: internal.name,
    startedAt: internal.startedAt,
    finishedAt: internal.finishedAt,
    exercises: internal.exercises,
    volumeKg: stats.volumeKg,
    totalSets: stats.totalSets,
    durationMinutes: stats.durationMinutes,
  };
}

async function upsertByClientId(userId, clientWorkoutId, internal) {
  const fields = buildWorkoutFields(userId, clientWorkoutId, internal);

  let workout = await Workout.findOne({ userId, clientWorkoutId });
  if (workout) {
    workout.set(fields);
    await workout.save();
    return { created: false, workout };
  }

  try {
    workout = await Workout.create(fields);
    return { created: true, workout };
  } catch (err) {
    // Race: another request created the same (userId, clientWorkoutId) first.
    if (err && err.code === 11000) {
      workout = await Workout.findOne({ userId, clientWorkoutId });
      if (workout) {
        workout.set(fields);
        await workout.save();
        return { created: false, workout };
      }
    }
    throw err;
  }
}

// Validate start_date / end_date query params and return string bounds for
// lexicographic ISO comparison against stored startedAt values.
function validateDateRange(startDate, endDate) {
  if (!startDate || !/^\d{4}-\d{2}-\d{2}$/.test(startDate) || Number.isNaN(new Date(startDate).getTime())) {
    return { valid: false, error: 'Invalid or missing start_date. Expected YYYY-MM-DD.' };
  }
  if (endDate && (!/^\d{4}-\d{2}-\d{2}$/.test(endDate) || Number.isNaN(new Date(endDate).getTime()))) {
    return { valid: false, error: 'Invalid end_date. Expected YYYY-MM-DD.' };
  }

  const effectiveEnd = endDate || startDate;
  if (effectiveEnd < startDate) {
    return { valid: false, error: 'end_date must be on or after start_date' };
  }

  const diffDays = Math.ceil((new Date(effectiveEnd) - new Date(startDate)) / (1000 * 60 * 60 * 24)) + 1;
  if (diffDays > MAX_DATE_RANGE_DAYS) {
    return { valid: false, error: `Date range cannot exceed ${MAX_DATE_RANGE_DAYS} days` };
  }

  return {
    valid: true,
    gte: `${startDate}T00:00:00.000`,
    lte: `${effectiveEnd}T23:59:59.999`,
  };
}

function toApiFormat(workout) {
  const doc = workout.toObject ? workout.toObject() : workout;
  return {
    server_workout_id: doc._id.toString(),
    client_workout_id: doc.clientWorkoutId,
    name: doc.name,
    started_at: doc.startedAt,
    finished_at: doc.finishedAt,
    exercises: (doc.exercises || []).map((exercise) => ({
      exercise_id: exercise.exerciseId,
      exercise_name: exercise.exerciseName,
      category: exercise.category,
      sets: (exercise.sets || []).map((set) => ({
        set_number: set.setNumber,
        kg: set.kg,
        reps: set.reps,
        rest_seconds: set.restSeconds,
        done: set.done,
        distance_km: set.distanceKm,
        time_seconds: set.timeSeconds,
        logged_at: set.loggedAt,
      })),
    })),
    volume_kg: doc.volumeKg,
    total_sets: doc.totalSets,
    duration_minutes: doc.durationMinutes,
  };
}

module.exports = {
  MAX_EXERCISES,
  MAX_SETS_PER_EXERCISE,
  validateWorkoutSession,
  toInternalWorkout,
  computeStats,
  upsertByClientId,
  validateDateRange,
  toApiFormat,
};

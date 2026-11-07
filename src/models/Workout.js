const mongoose = require('mongoose');

const workoutSetSchema = new mongoose.Schema({
  setNumber: { type: Number },
  kg: { type: Number },
  reps: { type: Number },
  restSeconds: { type: Number },
  done: { type: Boolean },
  distanceKm: { type: Number },
  timeSeconds: { type: Number },
  loggedAt: { type: String },
}, { _id: false });

const workoutExerciseSchema = new mongoose.Schema({
  exerciseId: { type: String, required: true },
  exerciseName: { type: String },
  category: { type: String },
  sets: { type: [workoutSetSchema], default: [] },
}, { _id: false });

const workoutSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  clientWorkoutId: { type: String, required: true },
  name: { type: String },
  // ISO 8601 strings as provided by the client (no timezone re-interpretation)
  startedAt: { type: String, required: true },
  finishedAt: { type: String, required: true },
  exercises: { type: [workoutExerciseSchema], default: [] },
  volumeKg: { type: Number, default: 0 },
  totalSets: { type: Number, default: 0 },
  durationMinutes: { type: Number, default: 0 },
}, { timestamps: true });

workoutSchema.index({ userId: 1, clientWorkoutId: 1 }, { unique: true });
workoutSchema.index({ userId: 1, startedAt: 1 });

module.exports = mongoose.model('Workout', workoutSchema);

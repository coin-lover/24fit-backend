## 1. Data Model

- [x] 1.1 Create `src/models/Workout.js` with fields: `userId` (ObjectId ref User, required), `clientWorkoutId` (string, required), `name`, `startedAt`, `finishedAt` (Date), `exercises` (array of objects with `exerciseId`, `exerciseName`, `category`, `sets[]` where each set has `setNumber`, `kg`, `reps`, `restSeconds`, `done`, `distanceKm`, `timeSeconds`, `loggedAt`), derived stats `volumeKg`, `totalSets`, `durationMinutes`, plus `createdAt`/`updatedAt` timestamps
- [x] 1.2 Add unique compound index on `(userId, clientWorkoutId)` and index on `(userId, startedAt)`
- [x] 1.3 Store ISO timestamps as provided by the client (no timezone re-interpretation)

## 2. Service Layer

- [x] 2.1 Create `src/services/workoutService.js` with `validateWorkoutSession(body)` enforcing: required `client_workout_id`, `started_at`, `finished_at`; every exercise has `exercise_id`; set fields typed correctly; `distance_km` / `time_seconds` / `logged_at` nullable; caps on exercises/sets counts
- [x] 2.2 Implement `computeStats(exercises, startedAt, finishedAt)` returning `volume_kg` (done sets, kg×reps, excluding distance sets), `total_sets`, `duration_minutes`
- [x] 2.3 Implement `upsertByClientId(userId, clientWorkoutId, workoutData)` — find by `(userId, clientWorkoutId)`; create → `{ created: true, workout }` or overwrite → `{ created: false, workout }`; handle `E11000` race by retrying the update path

## 3. Sync Endpoints

- [x] 3.1 Add `POST /v1/sync/workouts` in `src/routes/sync.js`: authenticate, verify `server_user_id` matches token user (403 otherwise), validate payload (400), upsert via service, respond 201 `{ server_workout_id, client_workout_id, synced_at }` on create or 200 with same shape on update
- [x] 3.2 Add `GET /v1/sync/workouts` in `src/routes/sync.js`: authenticate, verify `server_user_id` matches token user (403), validate pagination via `validatePagination` (400), apply optional `start_date` / `end_date` filter on `startedAt` reusing history-style range validation (400), return `{ workouts, pagination: { page, limit, total } }` with each workout exposing `server_workout_id`, `client_workout_id`, and derived stats

## 4. CRUD Endpoints

- [x] 4.1 Create `src/routes/workouts.js` with `PUT /v1/workouts/:id`: authenticate, find workout by id owned by token user (404), validate WorkoutSession body (400), overwrite content + recompute stats, respond 200 `{ server_workout_id, updated_at }`
- [x] 4.2 Add `DELETE /v1/workouts/:id`: authenticate, find by id owned by token user (404), hard delete, respond 204
- [x] 4.3 Mount the new workouts router in `src/index.js` (no changes to existing meal/profile/auth route mounts)

## 5. Response Mapping & Envelope

- [x] 5.1 Map internal stored fields back to API camelCase/snake_case shapes per requirements doc (`server_workout_id`, `client_workout_id`, `started_at`, `finished_at`, `exercises[].exercise_id`, `sets[].set_number` / `rest_seconds` / `distance_km` / `time_seconds` / `logged_at`, `volume_kg`, `total_sets`, `duration_minutes`, `synced_at` / `updated_at` as epoch ms)
- [x] 5.2 Use the existing bare-JSON error envelope `{ error: "..." }` with appropriate status codes (400/403/404/500)

## 6. Verification

- [x] 6.1 Manually verify acceptance checklist: idempotent re-push returns 200 without duplicating; pagination + date range return correct subsets; PUT → 200 / DELETE → 204 / missing id → 404; null `distance_km` weight sets store and count correctly; `server_user_id` mismatch → 403
- [x] 6.2 Verify existing meal, profile, history, and auth endpoints respond unchanged (regression check via Postman collection)
- [x] 6.3 Add workout requests to `24fit-backend.postman_collection.json` for the four new endpoints

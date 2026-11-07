## Why

The Linescore mobile app currently has no dedicated endpoint for workout data. Completed training sessions are mapped onto meal records (`item` = training summary, `total_calories` = estimated burn) as a temporary workaround, which pollutes the NutriSimple meal history and loses exercise/set-level detail. The mobile team's `add-account-sync` change (backend-api-requirements.md) defines the required workout endpoints and data structures.

## What Changes

- Add `POST /v1/sync/workouts` — idempotent upsert keyed by `client_workout_id` (new → 201, duplicate → 200 last-write-wins update).
- Add `GET /v1/sync/workouts` — paginated workout list per user, with `start_date` / `end_date` filtering and derived stats (`volume_kg`, `total_sets`, `duration_minutes`).
- Add `PUT /v1/workouts/{id}` — update a workout (200).
- Add `DELETE /v1/workouts/{id}` — hard delete (204, 404 when missing).
- Enforce 403 when `server_user_id` does not match the token's user on all write endpoints.
- Store workout sessions natively (WorkoutSession shape: name, started_at/finished_at, exercises with sets including kg/reps, rest_seconds, done, distance_km, time_seconds, logged_at).
- No changes to existing meals / profile / auth endpoints (transition compatibility — mobile keeps pushing workout summaries as meals until this ships).

## Capabilities

### New Capabilities
- `workout-sync`: Workout data sync endpoints — idempotent push of completed WorkoutSessions keyed by `client_workout_id`, paginated/date-filtered retrieval with derived statistics, and single-record update/delete. Enforces server_user_id ownership (403), last-write-wins semantics, and bare-JSON error envelope.

### Modified Capabilities
<!-- No existing spec-level behavior changes; meal, profile, and auth endpoints remain untouched. -->

## Impact

- **API surface**: 4 new endpoints under `/v1` (sync + CRUD for workouts).
- **Data model**: New `Workout` Mongoose model (per-user workout records with client_workout_id unique per user); `UserData` model untouched.
- **Routes/services**: New `src/routes/workouts.js` (or extension of sync routes) and workout service logic; shared pagination utils reused.
- **Auth**: Existing `authenticateToken` middleware reused; ownership check added for workout writes.
- **Clients**: Linescore mobile app switches from meal-mapped workout summaries to native workout sync (out of scope for this backend repo, but this change unblocks it).
- **Dependencies**: No new dependencies; existing Express + Mongoose stack.

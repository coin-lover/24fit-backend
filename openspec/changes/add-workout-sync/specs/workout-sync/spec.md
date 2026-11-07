## ADDED Requirements

### Requirement: Push a completed workout (idempotent upsert)

The system SHALL provide `POST /v1/sync/workouts` (Bearer token required) that accepts `{ server_user_id, client_workout_id, workout }` and stores the workout natively. `client_workout_id` SHALL be the idempotency key: when no workout with the same `(userId, client_workout_id)` exists, the system SHALL create it and respond `201` with `{ server_workout_id, client_workout_id, synced_at }`; when it already exists, the system SHALL overwrite the stored content (last-write-wins) and respond `200` with the same shape. `synced_at` SHALL be epoch milliseconds.

#### Scenario: First push creates the workout

- **WHEN** an authenticated client POSTs a valid workout payload with a new `client_workout_id`
- **THEN** the system persists the workout and responds `201` with `{ server_workout_id, client_workout_id, synced_at }`

#### Scenario: Duplicate push updates instead of duplicating

- **WHEN** an authenticated client POSTs the same `client_workout_id` again with different content
- **THEN** the stored workout is overwritten (last-write-wins), no second record is created, and the system responds `200` with `{ server_workout_id, client_workout_id, synced_at }`

#### Scenario: server_user_id does not match token user

- **WHEN** an authenticated client pushes a workout whose `server_user_id` differs from the token's user id
- **THEN** the system responds `403` and writes nothing

#### Scenario: Invalid workout payload

- **WHEN** the payload is missing `client_workout_id`, `started_at`, `finished_at`, or any `exercise_id`, or has malformed set fields
- **THEN** the system responds `400` with `{ error }` and writes nothing

### Requirement: Retrieve workouts with pagination and date filtering

The system SHALL provide `GET /v1/sync/workouts?server_user_id=...&page=1&limit=20` (Bearer token required) returning `200` with `{ workouts, pagination: { page, limit, total } }`. It SHALL support optional `start_date` / `end_date` query parameters (YYYY-MM-DD) filtering on the workout's `started_at`, with the same range-validation conventions as the existing history endpoints. Each returned workout SHALL include `server_workout_id`, `client_workout_id`, and derived stats `volume_kg`, `total_sets`, `duration_minutes`.

#### Scenario: Paginated list

- **WHEN** an authenticated client requests workouts with valid `page` and `limit`
- **THEN** the system responds `200` with the requested page and `pagination` containing `page`, `limit`, and `total`

#### Scenario: Date range filter

- **WHEN** an authenticated client requests workouts with `start_date` and `end_date`
- **THEN** only workouts whose `started_at` falls within the range are returned

#### Scenario: Invalid pagination or date range

- **WHEN** the client sends non-positive `page`/`limit` or an invalid date range
- **THEN** the system responds `400` with `{ error }`

#### Scenario: server_user_id does not match token user

- **WHEN** the requested `server_user_id` differs from the token's user id
- **THEN** the system responds `403`

### Requirement: Update a single workout

The system SHALL provide `PUT /v1/workouts/{server_workout_id}` (Bearer token required) accepting a WorkoutSession-shaped body (excluding `server_workout_id` / `client_workout_id` modifications) and respond `200` with `{ server_workout_id, updated_at }` where `updated_at` is epoch milliseconds. The stored derived stats SHALL be recomputed. When the id does not exist, the system SHALL respond `404`.

#### Scenario: Successful update

- **WHEN** an authenticated client PUTs a valid workout body for an existing `server_workout_id` owned by that user
- **THEN** the system overwrites the content, recomputes derived stats, and responds `200` with `{ server_workout_id, updated_at }`

#### Scenario: Workout not found

- **WHEN** the client PUTs a `server_workout_id` that does not exist or belongs to another user
- **THEN** the system responds `404`

#### Scenario: Invalid body

- **WHEN** the PUT body fails WorkoutSession validation
- **THEN** the system responds `400` with `{ error }` and leaves the stored record unchanged

### Requirement: Delete a single workout (hard delete)

The system SHALL provide `DELETE /v1/workouts/{server_workout_id}` (Bearer token required). On success it SHALL respond `204` and permanently remove the record. When the id does not exist, it SHALL respond `404`.

#### Scenario: Successful delete

- **WHEN** an authenticated client deletes an existing `server_workout_id` owned by that user
- **THEN** the system removes the record and responds `204`

#### Scenario: Workout not found

- **WHEN** the client deletes a `server_workout_id` that does not exist or belongs to another user
- **THEN** the system responds `404`

### Requirement: Derived workout statistics

For every stored workout the system SHALL compute and return: `volume_kg` = sum over done sets of `kg × reps`, excluding sets where `distance_km` is not null; `total_sets` = count of all sets; `duration_minutes` = minutes between `started_at` and `finished_at`. Sets with null `distance_km` / `time_seconds` SHALL be treated as normal weight sets and SHALL NOT break volume computation.

#### Scenario: Mixed weight and cardio sets

- **WHEN** a workout contains weight sets (kg/reps, null distance) and cardio sets (distance_km set, no kg/reps volume)
- **THEN** `volume_kg` includes only the done weight sets' kg×reps, `total_sets` counts all sets, and the response succeeds

#### Scenario: Null cardio fields on a weight set

- **WHEN** a weight set has `distance_km: null` and `time_seconds: null`
- **THEN** the set is stored and counted normally without errors

### Requirement: Existing endpoints unchanged

The system SHALL NOT change the behavior of `POST /v1/sync/meals`, `GET /v1/sync/data`, `PUT/DELETE /v1/meals/{id}`, `GET /v1/history*`, profile sync, or auth endpoints. Mobile transition logic mapping workout summaries onto meal records SHALL continue to work.

#### Scenario: Meal push still works after workout endpoints ship

- **WHEN** a client pushes a meal record in the existing format
- **THEN** the system responds exactly as before this change (same status codes and body shapes)

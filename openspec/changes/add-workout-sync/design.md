## Context

The backend (Express + Mongoose, base `https://api.nutrisimple.site`) already serves auth, profile sync, and meal sync/history endpoints. Workout data from the Linescore mobile app currently arrives only as meal-record mappings (transition workaround). The mobile team's requirements doc (`backend-api-requirements.md`, from `Stronger/openspec/changes/add-account-sync/`) defines the exact endpoint shapes, data structures (WorkoutSession), sync semantics (idempotent upsert, last-write-wins, hard delete, 403 on ownership mismatch), and acceptance criteria.

Existing conventions to follow:
- Auth via `authenticateToken` middleware (`Authorization: Bearer <access_token>`).
- Error envelope: bare JSON `{ "error": "..." }` with status code (optionally `{ error, code }`).
- Pagination via `src/utils/pagination.js` (`validatePagination`, `paginateArray`); date-range filtering pattern already exists in `src/routes/history.js`.
- Per-user data currently lives in `UserData` (embedded `meals` array, `userId` unique). Meal records store derived stats (e.g. total calories) at write time.

## Goals / Non-Goals

**Goals:**
- Implement `POST /v1/sync/workouts`, `GET /v1/sync/workouts`, `PUT /v1/workouts/{id}`, `DELETE /v1/workouts/{id}` per the requirements doc.
- Native WorkoutSession persistence with derived stats (`volume_kg`, `total_sets`, `duration_minutes`) computed server-side.
- Idempotent upsert on `client_workout_id` (unique per user), last-write-wins.
- Ownership enforcement: `server_user_id` must match token user on all workout writes → 403.
- Zero behavior change to meals / profile / auth endpoints.

**Non-Goals:**
- Routine (菜單) sync endpoints — explicitly phase 2 in the requirements doc.
- Third-party auth (Apple/Google) integration.
- Changing the mobile app's transition mapping logic.
- Any schema migration of existing meal data.

## Decisions

**D1: Dedicated `Workout` collection instead of embedding in `UserData`.**
Workouts are a separate aggregate with their own CRUD, pagination, and date-range queries; embedding them in a per-user `UserData` document would make pagination/filtering expensive and bloat a single document. Rationale: mirrors how a real sync backend scales, keeps `UserData` untouched (transition compatibility requirement). Alternative: extend `UserData` with a `workouts` array — rejected (grows unbounded per user, conflicts with existing doc shape).

**D2: Unique index `(userId, client_workout_id)` for idempotency.**
`POST /v1/sync/workouts` finds by `userId + client_workout_id`; on hit it replaces content and returns 200 (last-write-wins), on miss it creates and returns 201. Race-safe via the unique index (handle `E11000` by retrying as update). Alternative: generate server id only and never match client ids — rejected (reinstall dedup requirement).

**D3: Derived stats computed at write time, stored on the record.**
`volume_kg` (sum of `kg × reps` over done sets that are not distance sets), `total_sets`, `duration_minutes` (`finished_at - started_at`) are computed on create/update and returned in GET responses. Alternative: compute on read — rejected (trivial cost at write, simpler reads, matches existing meal pattern of storing computed values).

**D4: Server-generated `server_workout_id` (Mongo ObjectId) stored alongside `client_workout_id`.**
Responses and `PUT/DELETE /v1/workouts/{id}` address records by server id; the client id remains the idempotency key. This matches the requirements (PUT/DELETE use `server_workout_id`).

**D5: Keep workouts under `src/routes/sync.js` + `src/routes/workouts.js` split mirroring meals.**
`POST/GET /v1/sync/workouts` in the sync router (push/pull semantics), `PUT/DELETE /v1/workouts/:id` in a workouts router (CRUD semantics) — consistent with how meals/history are already organized. Shared validation helpers for the WorkoutSession shape in the service layer (`src/services/workoutService.js`).

**D6: Date filtering on `started_at` using `start_date` / `end_date` (YYYY-MM-DD), matching history endpoint style.**
Apply the same `MAX_DATE_RANGE_DAYS`-style bound as `history.js` to prevent unbounded queries.

## Risks / Trade-offs

- [Client sends malformed nested sets (kg/reps/distance nullability)] → Strict validation at the boundary: required fields enforced, `distance_km`/`time_seconds`/`logged_at` nullable; 400 with descriptive error before any write.
- [Concurrent duplicate pushes race the upsert] → Unique index on `(userId, client_workout_id)`; catch `E11000` and treat as update path.
- [Mobile sends local-timezone ISO strings] → Store ISO strings as provided (no re-interpretation); derive `duration_minutes` from the two timestamps. Document that durations are client-reported.
- [Large workout lists per user] → Paginated reads with server-side count; index on `(userId, started_at)` for date-range queries.
- [Accidental change to meal endpoints] → Workout code lives in new files; no edits to meal/profile/auth routes beyond (optionally) shared helpers.

## Migration Plan

1. Add `Workout` model + indexes (new collection — no migration of existing data).
2. Add service + routes; mount in `src/index.js`.
3. Deploy; verify acceptance checklist (idempotent push, pagination + date filter, PUT/DELETE 200/204/404, null distance handling, 403 ownership, meal endpoints unchanged).
4. Rollback: remove route mounts; collection left in place is inert.

## Open Questions

- Should `GET /v1/sync/workouts` support `?client_workout_id=` single lookup for client reconciliation? (Not required by the doc — default: no.)
- Any upper bound on `exercises`/`sets` array sizes per workout? (Default: cap at reasonable limits, e.g. 100 exercises / 100 sets each, returning 400 beyond.)

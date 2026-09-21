# Learning Analytics Event History Design

**Date:** 2026-09-21  
**Status:** Approved by the Phase 3 implementation brief and continuation instruction  
**Scope:** Durable, sanitized curriculum event history and one concise teacher Learning Trends section

## Intent and Success Criteria

SharpRunner needs truthful historical teacher analytics without changing the meaning of `UserProgress`. `UserProgress` remains the current and cumulative academic record. A new append-only event table records only facts observed after Phase 3 deployment. The design succeeds when failed attempts, first completions, active-time deltas, and first hint uses can be aggregated by occurrence date without source code, compiler logs, arbitrary metadata, fabricated backfill, replay contamination, or unbounded Node.js scans.

Phase 1 disabled-level and per-student multi-classroom union rules continue to govern which data is visible in teacher analytics. Phase 2 current/latest failure patterns remain a separate current-state feature.

## Audited Write Paths

| Action | Current trusted path | Persisted behavior before Phase 3 | Phase 3 recording point |
| --- | --- | --- | --- |
| Start a curriculum level | `GamePage` calls `POST /api/progress/level/:levelKey/start`; route checks access; `startProgressSession()` sets `startedAt` and session fields | First start is stored on `UserProgress`; later visible resumes replace the active session | Record `level_started` only when `startedAt` changes from null, in the same persistence unit as the progress save |
| Failed solution attempt | Local game outcome calls `POST .../attempt`; backend validates source; transaction locks `UserProgress` | Increments failed `attemptCount` and replaces `latestFailure*` | Inside the existing locked transaction, deduplicate the action ID, mutate progress, and record one sanitized `solution_attempt_failed` |
| Successful solution attempt / first completion | Local success calls `PUT .../level/:levelKey`; backend validates again, finalizes timer, computes score, then saves completion and awards XP | First completion fixes `completedAt`, `finalScore`, and academic result; repeat calls preserve them | Record one `level_completed` event with attempt number and score in the completion transaction; this event also represents the successful attempt |
| Active time | Start, 30-second heartbeat, visibility end, replacement, deadline handling, and completion call `activeLevelTimerService` | Adds only confirmed foreground deltas no greater than the 45-second stale threshold | Record `active_time_recorded` only for positive deltas, atomically with the corresponding cumulative timer save |
| Basic hint | `POST .../hint-use` verifies access, feature setting, and failure threshold | First use sets `hintUsed`, `hintUsedAt`, and `hintType`; reopening does not mutate | Record one `hint_used` with `hintType=basic` only on the first state transition |
| Detailed/situational hint | `POST .../detailed-hint-purchase` calls `purchaseDetailedHint()` | Existing transaction deducts XP once, unlocks and immediately marks the detailed hint used; later calls are idempotent | Record one `hint_used` with `hintType=detailed` and `hintPurchased=true` in that transaction; do not create a second purchase event |
| Replay | A completed start is ephemeral; failed-attempt route reports replay without mutation; repeat completion preserves the original result | No academic attempts, time, score, or XP are changed | Record no academic event. Replay engagement is intentionally outside Phase 3 |
| Reset/restart | Editor and scene reset controls reset client code or scene state only | No backend academic reset exists | Record nothing |
| Latest failure state | Only a backend-validated failed attempt writes `latestFailure*` | One retained current/latest signal, possibly retained after completion | Continue writing the current fields and independently append the sanitized failure event |

The progress router chooses a deterministic primary active membership and applies that classroom's level settings, validator override, schedule, deadline, and hint policy. Phase 3 will resolve this membership once per action and store that exact policy context as `classroomId`. It will never infer a classroom later from analytics filters. The database column remains nullable so deleting a classroom can retain de-identified historical facts through `ON DELETE SET NULL`; successful curriculum actions currently require a valid active membership and therefore normally record a non-null classroom.

## Event Schema

Create `LearningAnalyticsEvents` with:

- `id`: auto-incrementing bigint primary key.
- `studentId`: required user foreign key, cascading on user deletion.
- `classroomId`: nullable classroom foreign key, set null on classroom deletion.
- `levelKey`: required supported curriculum key.
- `lessonKey`: required server-derived curriculum lesson key.
- `eventType`: required controlled string from the five-type taxonomy.
- `occurredAt`: required timestamp of the trusted mutation.
- `attemptNumber`: nullable positive integer for failed attempts and completion.
- `score`: nullable 0–100 value for first completion.
- `failureCategory` and `failureCode`: nullable bounded normalized values for failed attempts.
- `activeSeconds`: nullable positive integer delta for active-time events.
- `hintType`: nullable controlled `basic` or `detailed` value.
- `hintPurchased`: nullable boolean meaningful for hint events.
- `dedupeKey`: required opaque server-built unique key.
- `createdAt`: required insertion timestamp; there is no `updatedAt`.

There is deliberately no source-code, compiler-output, exception, request-payload, authentication, IP, personal-name, or arbitrary JSON metadata column.

Database checks mirror model/service validation. Indexes support the actual reads: unique dedupe key; classroom/student/date scope; student/date lookup; event-type/date grouping; and lesson/level/date filtering. RLS is enabled and public, anonymous, and authenticated Data API privileges are revoked, matching existing backend-owned tables.

## Event Taxonomy and Meaning

- `level_started`: first post-deployment transition from no stored start to started.
- `solution_attempt_failed`: one backend-validated incorrect submission. Category and code come from the sanitized classifier output; attempt number is the cumulative failed-attempt number after mutation.
- `level_completed`: first successful validated completion. It is both the success-attempt fact and the completion fact, avoiding redundant rows. Attempt number is failed attempts plus one; score is the stored first-completion score.
- `active_time_recorded`: a positive confirmed foreground delta accepted by existing session safeguards.
- `hint_used`: first persisted use of a supported hint tier. `hintPurchased=true` identifies the detailed hint purchase/use action without duplicating the fact.

No client endpoint accepts an event type or analytics payload. Clients provide only bounded opaque action/synchronization IDs used for idempotency; trusted backend logic derives every event field.

## Idempotency and Consistency

Failed and successful solution actions receive a stable client-generated `activityId`. The backend validates the identifier and constructs an opaque hashed dedupe key. Failed-attempt handling checks for an existing event while holding the existing `UserProgress` row lock, so a network retry cannot increment the academic attempt or append a second event. First-completion state already prevents duplicate academic completion; the action key additionally protects the event.

Level start and hint events use state-transition keys, so the same student-level fact is recorded at most once. Active-time writes use a per-synchronization `syncId`; only positive accepted deltas create events. The existing session ID, stale-gap limit, tab replacement rule, and foreground synchronization remain authoritative.

Academic state mutation and its event are placed in the same Sequelize transaction where practical:

- failed attempt: existing row-lock transaction;
- completion: a new focused row-lock transaction around timer finalization, score, progress save, and event;
- detailed hint: existing user/progress/XP transaction;
- basic hint and timer mutations: focused transactions.

XP awarding remains its existing separate idempotent transaction after completion. An XP failure can still leave a completed academic result, which is existing behavior and is not broadened into an unrelated transaction redesign.

## Historical Analytics

The existing `GET /api/teacher/analytics` response gains `historical`:

```text
historical: {
  trackingSince,
  hasData,
  bucket,
  series: [{ periodStart, attempts, successfulAttempts, failedAttempts,
             completions, activeSeconds, hintUses, firstAttemptSuccesses }],
  failures: [{ category, label, count }],
  semantics
}
```

PostgreSQL performs period grouping and conditional counts. Normal seven-day, thirty-day, and short custom ranges use daily buckets; long custom/all-time ranges use monthly buckets to bound response size. Queries select aggregates only, constrain authorized classroom and student scope, apply `occurredAt` for date filters, apply curriculum lesson filters, and use per-student enabled-level predicates so disabled levels remain excluded. Event rows are never sent to React.

`trackingSince` is the earliest authorized event available before the selected date window. It is null when no event exists, in which case the UI says no historical activity has been recorded. Nothing is backfilled from `UserProgress`, and current-state metrics retain their documented cumulative date limitations.

## UI

Add one `Learning Trends` card after the Learning Funnel. A compact accessible metric selector switches a single CSS bar timeline among Attempts, Completions, Failures, Active Time, and Hint Usage. Each bar carries a textual value and accessible label, so color is not the sole representation. The card shows the tracking-start notice, distinguishes historical events from current-state metrics, and has explicit loading-compatible, empty, and no-pre-deployment-history states. No chart dependency is added.

Current Failure Patterns remains unchanged and continues to describe latest unresolved/retained state, while Learning Trends failures count actual post-deployment failure events.

## Error Handling and Privacy

Event validation rejects unsupported types, levels, out-of-range scores, non-positive active deltas, and malformed identifiers. Recording failures inside a transaction fail the associated academic mutation rather than silently losing history. API responses do not expose dedupe keys or raw event rows. Logs must not print submitted source or compiler dumps as part of event handling.

## Migration and Deployment

Add a forward SQL migration to the existing `SharpRunnerMigrations` runner and register it after `20260918000000_teacher_analytics_scope`. The project has no automated down-migration interface, so no unsupported rollback mechanism will be invented. Before production writes, rollback is a manual table/index drop; after writes, dropping the table is destructive and requires an explicit retention/export decision.

Deployment order is migration first, then backend/frontend. Old progress is untouched and no event backfill runs.

## Retention

Retention is initially unlimited because no product requirement authorizes deletion. Rows are narrow and omit large payloads, but volume grows with attempts and timer synchronizations. Monitor row count and index size. A later phase should define an institutional retention period and archive/delete policy before any automatic deletion is introduced.

## Testing

Tests cover typed/sanitized event construction, trusted recording points, retry deduplication, first-attempt and failed-then-success sequences, hint tiers, timer deltas and invalid values, replay exclusion, migration/model agreement, no backfill, authorization, event-time and lesson/classroom filters, disabled-level and union semantics, bounded aggregate queries, empty/tracking-start payloads, UI data handling through lint/build/configured tests, and the unchanged Phase 1/2 suites.

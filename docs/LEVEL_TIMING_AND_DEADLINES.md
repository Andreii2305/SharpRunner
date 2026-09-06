# Level Timing and Deadlines

## Active timer

`UserProgress.timeSpentSeconds` is the cumulative active time before the first completion. It is no longer derived from `startedAt`. Opening a valid unfinished level starts a server-owned segment; a heartbeat confirms activity every 30 seconds. The browser pauses the segment when the document becomes hidden or the route closes and resumes it when visible again. GAME, CODE, and LESSON are panels inside one route, so moving between them does not pause timing.

The backend accepts at most 45 seconds between confirmations. Longer gaps are stale and add no time, preventing a closed browser or lost network from accumulating hours. One session token is active per user and level, and starting another level pauses the previous one. A newer tab replaces an older tab's token, preventing double counting. Completed-level replay does not alter first-completion timing analytics.

## Deadlines

Classroom level `dueAt` is optional and defaults to `NULL` (No Due Date). The migration copies any legacy `LevelDeadlines.deadlineAt` value into this single active classroom setting when `dueAt` is still empty. Dates are sent as ISO timestamps, stored as PostgreSQL `TIMESTAMPTZ`, and shown in `Asia/Manila`. Server time decides whether a deadline has passed.

An unfinished level with a passed effective deadline has the `DEADLINE_PASSED` access reason. Its start, heartbeat, attempt, progress/completion, content, and hint APIs are rejected server-side. Completed levels remain completed and replayable under the existing replay policy even if a teacher later moves the deadline backward.

## Student extensions

Teachers and admins can grant, edit, or remove one extension per classroom, student, and level. An extension requires a class deadline and must be later than it. The effective deadline is the later of the class deadline and the extension. This means moving a class date beyond an older extension cannot shorten access. Removing an extension restores the class deadline; removing the class deadline clears now-irrelevant extensions.

Changing or removing a deadline, or granting/editing/removing an extension, takes effect immediately without resetting attempts, code drafts, progress, scores, hints, XP, or active time.

## Hard-deadline policy

Game levels use hard deadlines: unfinished students cannot submit late without an extension. The legacy late-day score deduction remains stored for compatibility with historical settings but is not reachable for a new late completion. No due date means there is no late state. The existing par-time/overtime calculation uses active `timeSpentSeconds`, so time away from the level does not consume it.

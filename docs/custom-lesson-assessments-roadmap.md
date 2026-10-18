# Custom lesson assessments: guarded rollout

Phase 1 adds dormant typed targets and revision-specific reading-completion
storage only. Custom assessment publication must remain disabled until the
following behavior works end to end:

- teacher authoring and publication authorization for the exact placement;
- student discovery, explicit Start, resume, submission, and results;
- direct reader and file gates, not only navigation-level gates;
- placement archive/delete and shared-content revision protections; and
- teacher score, history, and export access for the exact placement.

Later phases must preserve these decisions:

1. Recognized prior content access cannot be revoked by rescheduling or
   republishing. A mutable effective timestamp is not sufficient evidence.
2. If durable evidence cannot establish prior access, attaching a new required
   PRE to an existing placement must be rejected. The supported alternatives
   are an optional PRE or an independent lesson copy; Phase 1 adds no exemption
   subsystem.
3. Legacy unversioned completion is not assigned an invented version or time.
   The student must record a new, explicit acknowledgement for the applicable
   lesson revision.
4. Content changes after assessment attempts exist require an independent
   lesson copy. Shared library content must be checked across every placement.
5. Archiving blocks new starts while preserving authorized active-attempt
   resume and submitted-result access.
6. Custom-lesson grants never open built-in game remediation replay.

## Phase 2 lifecycle and reading foundations

Lesson editing now keeps two revisions with different purposes. `version`
remains the optimistic editor revision and changes for every builder save.
`contentVersion` changes only when student-facing instructional content
changes. New lessons begin at content revision 1. Migration of an existing
lesson retains its current editor version as the current content revision so
a dormant custom target is not silently rebound to another number. No prior
revision, access time, or reading completion is inferred.

Content-changing fields are the lesson description, external resource URL,
topic titles/order/body/code/practice blocks, topic images and their reading
metadata/order, and downloadable lesson resources and their metadata/order.
Safe metadata-only changes are the lesson title/number, draft/published/
scheduled state, classroom placement module/order, audience, due date, and
assignment/grading policy fields. These still advance the editor revision but
do not invalidate revision-specific content access or reading acknowledgement.

The server records immutable access evidence for the exact placement, student,
and content revision only when it returns authorized reader content. A separate
explicit acknowledgement may then record that same current revision. Legacy
`ClassroomLessonProgress.completedAt` remains unchanged and is not treated as
versioned reading evidence.

Rollout order is the dormant custom-target foundation migration, this lifecycle
migration, and then the backend/frontend release. Application rollback may use
the earlier code only while the additive columns, restrictive placement foreign
key, and immutable access table remain in place. Do not roll the database back
by dropping revision columns, deleting access/acknowledgement rows, or restoring
cascading placement deletion; once evidence exists, any schema rollback needs a
new forward, data-preserving migration.

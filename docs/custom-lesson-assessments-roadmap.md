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
migration, the PRE access-policy migration, and then the backend/frontend
release. Application rollback may use
the earlier code only while the additive columns, restrictive placement foreign
key, and immutable access table remain in place. Do not roll the database back
by dropping revision columns, deleting access/acknowledgement rows, or restoring
cascading placement deletion; once evidence exists, any schema rollback needs a
new forward, data-preserving migration.

## Phase 3 dormant PRE access policy and baseline foundation

`ClassroomLessonPlacements.accessPolicyEstablishedAt` is the server time from
which the application can prove that all successful instructional-content
delivery for that placement is represented by immutable access evidence. New
placements set it in the placement-creation transaction. Placements that
predate this policy intentionally retain `NULL`; migration, ordinary updates,
archive, restore, and reuse must never convert uncertain historical coverage
into confirmed coverage.

`LessonAssessments.accessGateEstablishedAt` is the first time a particular
required custom PRE and its bound lesson revision becomes enforceable. It is
set once by the future publication workflow and retained across unpublish and
republish. Prior-access protection is requirement-specific: only immutable
access for the same placement, student, and target content revision at or
before this first-enforcement timestamp satisfies that gate. Access recorded
after one requirement does not become an unrestricted exemption for another
revision or assessment.

Student placement listings are identity/status-only and do not create content
access evidence. Descriptions, external URLs, attachments, topics, images, and
other instructional content are disclosed only after the central placement
access evaluator allows the request; successful disclosure then records exact
placement/revision access. The application can protect its own reader, file,
image, preview, and external-link disclosure paths, but cannot revoke files
already downloaded or control a public external resource after its URL was
previously disclosed.

For custom PRE baselines, immutable content access at or before the locked
attempt `startedAt` is `RETROACTIVE`. No access under complete placement
coverage is `VALID`; no access under uncertain historical coverage is
`UNKNOWN`. Supplemental PRE attempts remain `SUPPLEMENTAL`. Built-in baseline
classification is unchanged.

Custom publication remains disabled. Before enabling it, the publication
transaction must resolve and lock the exact placement, reject required PRE for
`NULL` coverage, set the assessment's first-enforcement timestamp once, and
complete teacher authoring, student Start/resume/submission/results, all reader
and file gates, lifecycle protections, and teacher history/export access end to
end.

## Phase 4 bounded teacher draft authoring

Teachers and administrators may author one unpublished PRE draft and one
unpublished POST draft for an exact classroom lesson placement. These routes
use the typed `CLASSROOM_LESSON_PLACEMENT` target directly; they do not invent a
game lesson key and do not enable built-in templates or cross-target copying.
Normal graph validation, optimistic versions, fresh question/choice IDs,
transactional replacement, and immutable-after-attempt checks still apply.

A new draft binds to the lesson's authoritative `contentVersion`. If that
instructional revision later changes, ordinary saves remain blocked until the
teacher explicitly reviews and acknowledges the current revision. That action
is server-validated, is unavailable after attempt history exists, and does not
publish the assessment or establish `accessGateEstablishedAt`.

Through Phase 6, publication remained unavailable in both the custom builder
and server routes. Phase 7 below adds the guarded publication transaction after
the exact-placement student flow and teacher reporting prerequisites became
operational; its server switch remains off by default. On 2026-10-20, the
ordered custom-assessment migration chain was executed successfully against
fresh and representative predecessor fixtures in isolated, local-only
disposable PostgreSQL 18 databases. This is not a production-schema clone:
target-environment backup, migration, constraint, and smoke verification remain
mandatory before activation. Mocked HTTP fixtures and source assertions do not
replace those deployment checks.

## Phase 7 guarded publication and rollout

Custom publication is controlled by
`CUSTOM_LESSON_ASSESSMENT_PUBLICATION_ENABLED`. Missing values and every value
other than `true` keep new custom publication disabled. The switch gates only
the publication transaction: turning it off does not hide an already-published
assessment, revoke a required-PRE gate, or prevent authorized active-attempt,
grading, result, reporting, and unpublish paths.

The publication transaction locks the lesson, exact classroom placement, and
assessment in that order. It rechecks classroom ownership, active placement,
lesson publication/schedule validity, current reviewed `contentVersion`, no
attempt history, and the persisted assessment graph. Publishing a required PRE
also establishes its immutable, requirement-specific
`accessGateEstablishedAt` in the same transaction. Optional PRE and POST
publication do not establish that boundary. Future-scheduled lessons may have
assessments prepared and published, but student discovery remains unavailable
until the existing authoritative lesson schedule permits access.

Rollout order is strictly:

1. Apply `20261017000000_custom_lesson_assessment_foundation.sql`,
   `20261018000000_custom_lesson_lifecycle.sql`,
   `20261019000000_custom_lesson_pre_access_policy.sql`, then
   `20261020000000_enable_guarded_custom_assessment_publication.sql`.
2. Deploy the backend with the switch absent/off and smoke-check built-in
   authoring plus custom draft, reporting, reader, and historical attempt paths.
3. Deploy the frontend and verify that it reports publication as disabled.
4. In a controlled environment only, enable the backend switch and smoke-check
   exact-placement draft review/publication, required PRE, reader acknowledgement,
   POST, results, reporting/export, and retake grants before any wider activation.

The PostgreSQL rehearsal test is opt-in through
`CUSTOM_ASSESSMENT_REHEARSAL_DATABASE_URL`. It accepts only a local PostgreSQL
URL with the dedicated rehearsal database name and aborts unless that database
has an empty `public` schema. It never falls back to the application's ordinary
configured database URL.

Rollback is forward and data-preserving: turn the switch off first and retain
all custom assessments, activation boundaries, attempts, reading evidence, and
grant history. Do not restore the old dormant constraint after any custom row
has been published; attempted published rows cannot be safely made compatible
with it. A database rollback therefore requires a new forward migration and
cannot delete or rewrite historical records.

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

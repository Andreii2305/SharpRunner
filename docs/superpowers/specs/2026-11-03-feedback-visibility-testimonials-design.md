# Feedback Visibility and Public Testimonials Design

**Date:** 2026-11-03
**Status:** Storage architecture and first-release retention behavior approved; consent wording/version and minor participation remain public-launch decisions
**Scope:** Private platform feedback, moderated public testimonials, author history, administrator moderation, and an accessible landing-page testimonial section

## Intent

SharpRunner needs three feedback destinations whose audiences must never be confused:

1. Existing teacher-only classroom feedback remains identified classroom history visible only to its author and the classroom's current owning teacher.
2. Private platform feedback is visible to its author and administrators only.
3. A public testimonial is a separate, expressly consented submission that becomes public only after an administrator approves the exact current revision.

The design succeeds when no private record can enter a public query merely because a filter, default, or migration was omitted. Existing `StudentClassroomFeedback` records are not migrated, backfilled, reclassified, or made visible to administrators or the public. The first release adds no ratings, replies, attachments, classroom notifications, automatic publication, age-verification system, or claim of legal compliance.

## Existing Boundary That Must Remain Unchanged

`StudentClassroomFeedback` remains the complete storage and authorization path for teacher-only feedback. New teacher-only submissions continue to require an active student, active classroom, and exact active membership. Student-owned history survives membership removal and classroom archival. The current owning teacher can read retained classroom history; a former owner and administrators cannot. No new model has a foreign key or conversion action that can turn a `StudentClassroomFeedback` row into a testimonial.

The student interface may eventually present the three choices together, but it must dispatch teacher-only feedback to the existing classroom endpoint and the other choices to their separate endpoints. A shared visual form is not a shared authorization or persistence path.

## Storage Design

Three new tables are the smallest design that preserves the required trust boundaries and exact-revision moderation.

Message and moderation-explanation normalization uses the ECMAScript
`String.prototype.trim` boundary set explicitly: U+0009 through U+000D,
U+0020, U+00A0, U+1680, U+2000 through U+200A, U+2028, U+2029, U+202F,
U+205F, U+3000, and U+FEFF. Models remove only those characters from the
start and end before validation. Internal whitespace and line breaks are
preserved. Database checks reject a stored value unless applying that same
boundary operation leaves it unchanged, and they apply Unicode-character
length limits to the normalized stored value. A nullable moderation
explanation remains null in states where no explanation is allowed.

### `PlatformFeedbackSubmissions`

This table stores only private feedback intended for administrators.

| Field | Contract |
| --- | --- |
| `id` | Integer primary key using the repository's normal generated-ID convention. |
| `authorUserId` | Required `Users.id` foreign key with `ON DELETE RESTRICT`. |
| `message` | Required trimmed plain text, 1–1,000 Unicode characters. |
| `idempotencyKey` | Required opaque key matching the existing 8–96 character feedback/check-in convention. |
| `createdAt`, `updatedAt` | Managed timestamps. No first-slice edit operation changes the message. |

Constraints and indexes:

- unique `(authorUserId, idempotencyKey)`;
- index `(authorUserId, createdAt DESC, id DESC)` for author history;
- index `(createdAt DESC, id DESC)` for the administrator inbox;
- message and idempotency-key database checks matching model/service validation;
- RLS enabled with no direct client policy, and all table/sequence privileges revoked from `PUBLIC` and existing direct client roles.

This table is necessary because administrator-private feedback has no classroom recipient, public consent, attribution mode, or moderation lifecycle. Keeping it separate prevents a private record from becoming public through a moderation-state update.

For the first release, submitted rows remain available to their author and administrators. There is no edit, withdrawal, deletion, or automatic-purge operation. This is the bounded first-release behavior, not a permanent prohibition on a future approved retention, de-identification, or deletion process.

### `PublicTestimonialSubmissions`

This table is the stable author-owned identity and lifecycle for one testimonial. It does not contain publishable text.

| Field | Contract |
| --- | --- |
| `id` | Integer primary key. |
| `authorUserId` | Required `Users.id` foreign key with `ON DELETE RESTRICT`. |
| `idempotencyKey` | Required creation key, unique per author. |
| `withdrawnAt` | Nullable author-withdrawal timestamp. Once set, the submission is terminal. |
| `publicationSuspendedAt` | Nullable timestamp. Account deactivation or archival sets it durably for every non-withdrawn testimonial owned by that account. |
| `publicationSuspensionReason` | Nullable controlled value; initially only `account_deactivated`. It is cleared only with a newly consented revision after account reactivation. |
| `createdAt`, `updatedAt` | Managed timestamps. |

Constraints and indexes:

- unique `(authorUserId, idempotencyKey)`;
- unique `(id, authorUserId)` to support ownership-consistent composite revision foreign keys;
- index `(authorUserId, createdAt DESC, id DESC)` for author history;
- indexes on `withdrawnAt` and `publicationSuspendedAt` only if query plans show they are useful; the public query is primarily driven from approved current revisions;
- withdrawal and suspension reason/timestamp consistency checks;
- the same RLS and privilege revocation posture as other backend-owned private tables.

This table is necessary because withdrawal and account suppression apply to the testimonial as a whole, while messages, consent, attribution snapshots, and moderation apply to individual revisions.

Withdrawal changes visibility and lifecycle only. It does not delete the submission, any revision, consent evidence, attribution snapshot, or moderation explanation. Administrators retain withdrawn history, and the author retains their own history while authorized. The submission-to-author relationship uses `ON DELETE RESTRICT`; withdrawal never attempts author deletion.

### `PublicTestimonialRevisions`

Each edit creates a new row. Message, consent, attribution choice, and public-name snapshot never move between revisions.

| Field | Contract |
| --- | --- |
| `id` | Integer primary key. |
| `submissionId`, `authorUserId` | Required composite foreign key to the owning submission, enforcing exact author ownership. |
| `revisionNumber` | Required positive integer, increasing by one within a submission. |
| `isCurrent` | Required boolean. Exactly one current revision is maintained transactionally. |
| `message` | Required trimmed plain text, 1–1,000 Unicode characters. |
| `attributionMode` | Required controlled value: `named` or `anonymous`. |
| `publicDisplayNameSnapshot` | Required for `named`, null for `anonymous`; derived by the server at revision creation. |
| `publicNamePreviewVersion` | Required for `named`, null for `anonymous`; the server-generated version that bound consent to the displayed name preview. |
| `consentVersion` | Required bounded server-controlled testimonial-consent version. |
| `consentedAt` | Required server timestamp proving explicit consent to this exact revision and attribution. |
| `idempotencyKey` | Required edit/create-revision operation key. |
| `moderationStatus` | Required controlled value: `pending`, `approved`, `rejected`, or `revoked`. Defaults to `pending`. |
| `moderationExplanation` | Null while pending/approved; required trimmed short explanation for rejected or revoked revisions, maximum 500 Unicode characters. |
| `approvedByUserId`, `approvedAt` | Required together only for an approved or subsequently revoked revision. Moderator FK uses `ON DELETE RESTRICT`. |
| `rejectedByUserId`, `rejectedAt` | Required together only for a rejected revision. |
| `revokedByUserId`, `revokedAt` | Required together only when a formerly approved revision is revoked. |
| `createdAt`, `updatedAt` | Managed timestamps. Content, consent, attribution, revision number, and ownership are immutable after insertion. |

Constraints and indexes:

- unique `(submissionId, revisionNumber)`;
- unique `(authorUserId, idempotencyKey)`;
- partial unique index on `submissionId WHERE isCurrent = TRUE`, allowing at most one current revision;
- index `(submissionId, revisionNumber DESC, id DESC)` for detail/history;
- index `(moderationStatus, createdAt DESC, id DESC)` for the administrator queue;
- partial public index `(approvedAt DESC, id DESC) WHERE isCurrent = TRUE AND moderationStatus = 'approved'`;
- composite ownership foreign key `(submissionId, authorUserId)` to `PublicTestimonialSubmissions(id, authorUserId)`;
- attribution/name/preview-version, consent, and moderation-field consistency checks;
- RLS and privilege revocation matching the other two tables.

A database constraint can enforce at most one current revision. The transaction service enforces that every committed submission has one current revision. A failed new-revision insert rolls back the preceding `isCurrent = FALSE` update, so it cannot strand the submission without a current revision.

The migration also installs a revision-update trigger. It rejects changes to `submissionId`, `authorUserId`, `message`, `attributionMode`, `publicDisplayNameSnapshot`, `publicNamePreviewVersion`, `consentVersion`, `consentedAt`, `revisionNumber`, `idempotencyKey`, `createdAt`, and the primary-key operation identity. These are immutable evidence fields. It does **not** describe the entire row as immutable: `isCurrent`, `moderationStatus`, moderation explanation/actor/timestamps, and managed `updatedAt` are mutable only under the legal transitions below.

The same trigger permits `isCurrent` only to move from true to false and never false to true. It permits moderation only from pending to approved or rejected, and from approved to revoked. Rejected and revoked are terminal. Approval identity/time, rejection identity/time, revocation identity/time, and rejection/revocation explanations are write-once: once populated they cannot be changed or cleared. Revocation retains the original approval identity/time and adds its own identity/time and explanation. Pending rows have no decision metadata; approved rows have only approval metadata; rejected rows have only rejection metadata and their explanation; revoked rows retain approval metadata and add revocation metadata and their explanation. Model validation mirrors these checks, but the database trigger remains authoritative against direct or buggy ORM updates.

This table is necessary because approving mutable testimonial text would permit an edit to inherit an earlier approval. Revision rows make the exact approved text, consent, attribution snapshot, and operation identity explicit and auditable without copying full revision history into logs.

All author, submission, and moderator relationships use retained-history `ON DELETE RESTRICT` foreign keys. Revisions also reference submissions with `RESTRICT`, so deleting a parent cannot accidentally cascade away consent or moderation history. These retention relationships do not make whole rows immutable: the narrowly scoped transition triggers still permit the approved `isCurrent`, moderation, suspension, and withdrawal changes while protecting immutable revision evidence and terminal decisions.

## Public Name and Consent

For named attribution, the server derives a preview and snapshot from current account fields:

- trim the account first and last names;
- use the first name plus the uppercase first Unicode character of the last name and a period, for example `Ada L.`;
- if no usable last name exists, use the first name alone;
- reject named testimonial creation if no safe non-empty preview can be derived rather than accepting a client-supplied fallback.

`GET /api/feedback/testimonials/options` returns the server-owned `consentText`, current `consentVersion`, a bounded opaque `consentBinding`, the server-derived `namedDisplayPreview`, and a bounded opaque `publicNamePreviewVersion`. Each consent version identifies exactly one disclosure; changing the disclosure text requires a new version. The consent binding is an HMAC over a derivation-version tag, the version, and the exact disclosure text. Both named and anonymous create/edit requests echo it, so stale options cannot authorize a new operation even if an operator accidentally reuses a version for changed text. The binding is a validation token rather than persisted evidence; `consentVersion` remains the durable revision evidence and matching committed retries remain independent of current configuration.

The preview version is an HMAC produced with the same server-only key over a derivation-version tag, the authenticated user ID, the normalized first/last name components, the derived display string, the consent version, and the consent binding. It contains no reversible name or disclosure data and needs no database row. The client displays the returned name preview and consent text verbatim before consent.

The HMAC key is a required server secret, never returned or logged. The derivation-version tag permits a future algorithm change without treating an old token as current. Key or algorithm rotation makes an uncommitted preview stale and requires a new options fetch; it does not invalidate persisted revision evidence or matching committed retries.

A named create/edit body echoes `consentBinding`, `publicNamePreviewVersion`, and `consentVersion`, sets `consent: true`, and selects `named`; it never sends consent text or a display name. Inside the write transaction, the service locks the author, verifies the consent binding, re-derives the preview and HMAC from the locked account row, and compares the supplied tokens in constant time. A consent-binding or version mismatch returns `409 CONSENT_VERSION_STALE`; a name-preview mismatch returns `409 PUBLIC_NAME_PREVIEW_STALE`. The client must reload the options and obtain fresh consent; the service never silently substitutes changed disclosure text or a changed name. The stored named revision contains the freshly derived display snapshot and matching preview version. An account-name change after publication does not rewrite the approved snapshot, but the next edit requires a new preview and consent.

An anonymous create/edit requires `consent: true`, the current `consentVersion`, and its `consentBinding`, but does not accept `publicNamePreviewVersion`; its display snapshot and preview version are null. The server still exposes the notice that administrators can identify the author.

For anonymous attribution, `publicDisplayNameSnapshot` is null internally. The public serializer emits the literal display label `Anonymous user`. Administrator and author responses retain the controlled attribution mode, while the public response contains no author identity or classroom context.

Consent is revision-specific. Editing any testimonial requires a fresh affirmative consent action and a new `consentedAt`. General Privacy Policy acknowledgement and optional research consent are not testimonial-publication consent and cannot substitute for it.

The exact consent copy, consent-version identifier, treatment of minors, and any guardian or institutional requirements remain launch decisions. This design stores evidence for the chosen policy but does not invent age verification or claim that consent alone satisfies applicable law.

## State Machines

### Private platform feedback

The first slice is append-only:

```text
new intentional submission -> saved private record
matching retry            -> original record, changed:false
conflicting key reuse      -> generic conflict
```

There is no conversion to testimonial, publication state, edit, or delete transition.

### Testimonial submission

```text
create + explicit consent -> ACTIVE submission + revision 1 PENDING/current
ACTIVE + author edit      -> old revision non-current + new PENDING/current revision
ACTIVE + author withdraw  -> WITHDRAWN (terminal)
account deactivation      -> excluded from public results and durably suspended
account reactivation      -> remains suspended until a newly consented revision is created
```

### Testimonial revision

```text
PENDING -> APPROVED
PENDING -> REJECTED
APPROVED -> REVOKED
PENDING/REJECTED/APPROVED -> remains historical when an author creates a new current PENDING revision
```

Only the exact current `PENDING` revision can be approved or rejected. An approved revision stops being public immediately when an edit makes a new pending revision current. A rejected revision can be replaced by an edited pending revision. An active author may also replace the current revision of an account-suspended submission after reactivation; the transaction creates a freshly consented pending revision and clears the suspension together. Revocation is an administrator safety action for already approved content; it is not an author edit.

Withdrawal is different from suspension. Once `withdrawnAt` is set, that submission is terminal: it cannot be edited, unsuspended, moderated back into publication, or reused. The author must create a distinct submission with a new creation key, fresh consent, and later administrator approval.

A revision is publicly eligible only when all of the following are true in the same query:

- it is the submission's current revision;
- its status is `approved`;
- its consent version and consent timestamp are present;
- the parent submission is not withdrawn or publication-suspended;
- the author account currently has `status = active`.

No service offers a transition from `PlatformFeedbackSubmissions` or `StudentClassroomFeedback` to either testimonial table.

## Authorization Matrix

| Operation | Student | Teacher | Administrator | Anonymous public |
| --- | --- | --- | --- | --- |
| Existing teacher-only submission | Active exact classroom membership only | No | No | No |
| Existing teacher-only author history | Own records | No | No | No |
| Existing teacher-only classroom history | No | Current classroom owner only | No | No |
| Create private platform feedback | Active account | Active account | No | No |
| Read private platform feedback | Own records | Own records | All records | No |
| Create/edit/withdraw testimonial | Own active account | Own active account | No | No |
| Read testimonial author history | Own records | Own records | All records for moderation | No |
| Approve/reject/revoke testimonial | No | No | Active administrator | No |
| Read public testimonials | Yes | Yes | Yes | Yes |

Every authenticated mutation derives the actor ID and role from authentication. Caller-supplied author/moderator IDs are unknown fields and cause rejection. Administrators can identify authors of anonymous testimonials through administrator-only serializers, but public responses never include that identity.

## Transactions, Lock Order, and Races

All writes use one Sequelize transaction. When multiple users must be locked, lock relevant `Users` rows in ascending numeric ID order, then the testimonial submission, then revisions in ascending ID order. This keeps moderation, editing, withdrawal, and future account-status integration compatible.

### Create private feedback

1. Validate the complete request before mutation.
2. Lock and revalidate the authenticated active student/teacher account.
3. Check the author/key retry record.
4. Insert through the established savepoint pattern so only the intended unique violation is recovered.
5. Return an allowlisted record; never log message text or the key.

### Create testimonial

1. Validate the exact body shape, key syntax, attribution mode, consent boolean, and normalized message before mutation.
2. Lock and revalidate the author.
3. Look up and resolve a matching/conflicting actor-key operation.
4. Only for a new operation, validate the current consent version and, when named, the current preview version; derive the name snapshot from the locked account.
5. Insert the submission, then revision 1 as current and pending.
6. Commit both or neither.

### Edit testimonial

1. Lock the author and the referenced owned submission.
2. Look up and resolve a matching/conflicting actor-key operation before current-revision or lifecycle checks.
3. Only for a new operation, lock the current revision and require `baseRevisionId` to equal it.
4. Reject a withdrawn submission. For an account-suspended submission, require that the author is active again and the suspension reason is `account_deactivated`.
5. Validate fresh consent and the current preview version where named, then derive a fresh name snapshot.
6. Set the old revision non-current, insert the next pending/current revision, and, when applicable, clear `publicationSuspendedAt` and its reason in the same transaction.
7. Commit all changes or none.

If approval commits first, the subsequent edit still removes that approval from public display by creating a new pending current revision. If edit commits first, moderation of the old revision fails with `REVISION_CHANGED` and cannot approve it.

### Moderate testimonial

1. Revalidate and lock the administrator and author user rows in the common order.
2. Lock the submission and requested revision.
3. Recognize a matching already-persisted moderation decision before applying new-decision lifecycle checks.
4. For a new decision, require a non-withdrawn, non-suspended submission and the exact current revision.
5. Apply only a valid pending-to-approved, pending-to-rejected, or approved-to-revoked transition.
6. Store safe audit metadata containing IDs and action only, never message or consent text.

### Withdraw testimonial

Lock the author, submission, and current revision; set `withdrawnAt` once. A matching retry is `changed:false`. Withdrawal racing with approval serializes on the submission. Whichever commits first is observed by the other, and no committed state can remain publicly eligible after withdrawal.

### Change account status

Account deactivation and archival lock the user first, then that author's non-withdrawn testimonial submissions in ascending ID order. In the same transaction that changes the user status, set `publicationSuspendedAt` and `publicationSuspensionReason = account_deactivated` on every such submission that is not already suspended. Account reactivation or restoration changes the user status but deliberately leaves those suspension fields intact. Each testimonial therefore requires its own later freshly consented revision and approval.

Because account-status changes and author edits both lock the user before testimonial submissions, a concurrent edit/deactivation race is serialized. If the edit commits first, later deactivation suspends it. If deactivation commits first, the now-inactive author cannot start the edit. A retry of the earlier edit can acknowledge its committed revision but cannot clear the later suspension.

The current code writes account status directly in every path below; the eventual implementation must route each through one transaction-aware account-status transition service rather than adding testimonial updates beside only one route:

- `POST /api/admin/users/:id/archive` in `backend/src/routes/admin.js` (any permitted non-archived status to `archived`);
- `POST /api/admin/users/:id/restore` in `backend/src/routes/admin.js` (`archived` to `active`);
- `PATCH /api/admin/users/:id/status` in `backend/src/routes/admin.js` (`active` and `inactive` transitions);
- `completeEmailVerification` in `backend/src/routes/auth.js`, used by both verification-token and verification-code routes (`pending` to `active`);
- the Google OAuth callback in `backend/src/routes/auth.js` when it upgrades an existing `pending` account to `active`.

Initial account inserts, including Google-created active students, pending student/teacher/admin registration, and first-admin bootstrap, have no pre-existing testimonial history and do not need suspension writes. Hard deletion is not a status transition; the new `RESTRICT` author foreign keys make its retained-history consequence explicit. Future status-changing paths must call the same service.

### Public reads

The public query applies every eligibility predicate in SQL and selects its allowlist directly. It must not fetch private rows and filter them in JavaScript. Transactional edits, approvals, withdrawals, and account suppression therefore become visible atomically after commit.

## Idempotency and Stale Requests

- Creation and revision keys use the existing 8–96 character pattern.
- After strict request-shape/key parsing, authenticate the actor and authorize ownership of any referenced submission before disclosing whether an operation key exists.
- Inside the transaction, look up the actor/key operation and compare its normalized original payload before applying checks that exist only for a new operation: current consent version, current public-name preview version, current base revision, current moderation state, withdrawal state, or suspension state.
- Same actor/key and identical normalized payload returns the original operation evidence with `changed:false` without changing timestamps, `isCurrent`, moderation, withdrawal, or suspension state.
- Same actor/key with different content, attribution, consent version, public-name preview version, submission, or base revision returns generic `409 IDEMPOTENCY_KEY_CONFLICT` without stored content.
- A committed create/edit retry returns the immutable fields of the revision that operation originally created and the submission's current lifecycle state. If a later edit made that revision non-current, moderation approved/rejected/revoked it, the author withdrew the submission, account deactivation suspended it, or the account name changed, the retry still acknowledges the original operation but never reverses or clears the later state. It never reactivates an older revision, republishes content, clears withdrawal/suspension, or re-derives a different display name.
- A matching moderation retry acknowledges the exact decision already stored. Later author editing, withdrawal, or account suspension remains authoritative and is not undone. A matching withdrawal retry remains an acknowledgement even after account changes and cannot clear or replace the terminal withdrawal.
- Only when no matching committed operation exists do create/edit services enforce the current consent version, named-preview version, base revision, and lifecycle rules for a new write.
- `baseRevisionId` fences edits; moderation includes the exact `revisionId`. Stale targets return `409 REVISION_CHANGED`.
- Moderation transitions are naturally idempotent: retrying the exact persisted decision returns `changed:false`; a different decision or explanation for the same terminal revision is a conflict.
- Withdrawal is idempotent and never clears or rewrites prior consent/moderation history.
- Network errors and HTTP 500–599 remain uncertain to clients. Clients retain the same key and exact normalized payload. Definitive 4xx responses may unlock a corrected new operation as appropriate.
- Account, role, submission, page, and unmount changes synchronously invalidate frontend state and fence late success, error, and finally handlers. Aborting a request does not prove that the server rolled it back.

## Response Allowlists

All timestamps serialize as ISO strings. All message rendering is plain text with preserved line breaks; no HTML, Markdown, or automatic links.

### Private feedback author item

```json
{
  "id": 101,
  "message": "Plain-text feedback",
  "createdAt": "..."
}
```

### Private feedback administrator item

```json
{
  "id": 101,
  "message": "Plain-text feedback",
  "createdAt": "...",
  "author": {
    "id": 7,
    "firstName": "Ada",
    "lastName": "Lovelace",
    "username": "ada",
    "role": "student",
    "status": "active"
  }
}
```

Email, idempotency keys, authentication fields, other associations, and model internals are excluded.

### Testimonial author item

```json
{
  "id": 55,
  "withdrawnAt": null,
  "publicationSuspendedAt": null,
  "createdAt": "...",
  "currentRevision": {
    "id": 89,
    "revisionNumber": 2,
    "message": "Plain-text testimonial",
    "attributionMode": "named",
    "publicDisplayName": "Ada L.",
    "consentVersion": "testimonial-publication-v1",
    "consentedAt": "...",
    "moderationStatus": "rejected",
    "moderationExplanation": "Please remove the classroom name.",
    "approvedAt": null,
    "revokedAt": null,
    "createdAt": "..."
  }
}
```

Authors never receive moderator identity or internal keys.

### Testimonial administrator item

Administrator list items use this exact shape:

```json
{
  "id": 55,
  "withdrawnAt": null,
  "publicationSuspendedAt": null,
  "publicationSuspensionReason": null,
  "createdAt": "...",
  "author": {
    "id": 7,
    "firstName": "Ada",
    "lastName": "Lovelace",
    "username": "ada",
    "role": "student",
    "status": "active"
  },
  "currentRevision": {
    "id": 89,
    "revisionNumber": 2,
    "message": "Plain-text testimonial",
    "attributionMode": "anonymous",
    "publicDisplayName": null,
    "consentVersion": "testimonial-publication-v1",
    "consentedAt": "...",
    "moderationStatus": "pending",
    "moderationExplanation": null,
    "approvedByUserId": null,
    "approvedAt": null,
    "rejectedByUserId": null,
    "rejectedAt": null,
    "revokedByUserId": null,
    "revokedAt": null,
    "createdAt": "..."
  }
}
```

Administrator detail returns the same submission and author fields plus a separately paginated `revisions` array whose items use exactly the revision fields shown above. Author detail uses the author testimonial shape and the same revision fields but omits all moderator user IDs. No administrator or author response includes idempotency keys, email, password/session fields, authentication metadata, or unrelated user/classroom records.

### Public testimonial item

```json
{
  "id": 89,
  "message": "Plain-text testimonial",
  "displayName": "Ada L.",
  "approvedAt": "..."
}
```

For anonymous attribution, `displayName` is exactly `Anonymous user`. The public response does not expose submission ID, author ID, username, role, classroom, attribution mode, revision number, consent data, moderation explanation, moderator, or withdrawal/suspension state.

## Account Deactivation and Reactivation

An inactive, archived, or otherwise non-active author is excluded from subsequent public responses. Private and testimonial history remains retained under the approved first-release behavior; inactive users cannot authenticate to create, edit, or withdraw.

Account deactivation and archival durably suspend every non-withdrawn testimonial in the same transaction as the account-status change. Reactivation and restoration never clear suspension or republish content automatically. After reactivation, the active author must edit each desired testimonial into a freshly consented pending revision. That edit atomically clears only that submission's account-deactivation suspension. Public eligibility still requires administrator approval of the exact new current revision.

An approved revision that existed before deactivation remains historical evidence but cannot become public again. The old consent is never treated as renewed. A withdrawn submission remains terminal even if it is also suspended or the account is later reactivated.

## Private Feedback Retention, Editing, and Deletion

The approved first-release behavior retains submitted private platform feedback for author and administrator history. It provides no edit, withdrawal, deletion, or automatic-purge endpoint. Authors may submit a new corrective message, but that does not alter the earlier record. Administrators may read records but cannot rewrite author content.

`PlatformFeedbackSubmissions.authorUserId` uses `ON DELETE RESTRICT`, preventing account deletion from accidentally cascading away retained feedback. The API and service slices add no hard-delete path. This deliberately safe first-release behavior does not establish or claim a legally required retention period, and it does not permanently prohibit a later approved retention, de-identification, or deletion process. Such a process would require a separate policy decision, migration, authorization design, audit behavior, and tests.

Public testimonial withdrawal is separate: it immediately ends public eligibility but retains the submission, all revisions, consent/name snapshots, and moderation explanations internally. Administrators can inspect withdrawn history; authorized authors can inspect their own. A withdrawn submission remains terminal, so later publication requires a new submission with fresh consent and approval.

Administrator reviewed/resolved workflow is outside the first release. It can be added later without weakening the private/public separation.

## API Contracts

All authenticated routes use existing authentication. Student/teacher submission routes explicitly reject administrators. Administrator routes use the existing admin-only router. Bodies are exact JSON objects: unknown fields, supplied identities, repeated/unknown query parameters, malformed scalar values, and duplicate/missing/invalid idempotency headers are rejected.

Common safe errors use `{ "code": "...", "message": "..." }`. Expected codes include `INVALID_REQUEST`, `FORBIDDEN`, `NOT_FOUND`, `IDEMPOTENCY_KEY_CONFLICT`, `CONSENT_VERSION_STALE`, `PUBLIC_NAME_PREVIEW_STALE`, `REVISION_CHANGED`, `TESTIMONIAL_WITHDRAWN`, `TESTIMONIAL_NOT_MODERATABLE`, a route-specific rate-limit code, and neutral `SERVER_ERROR`. Errors and logs never include messages, consent text, keys, preview HMACs, or stored conflicting content.

### Authenticated author routes

- `GET /api/feedback/testimonials/options`
  - active student/teacher only;
  - returns `{ consentVersion, consentText, consentBinding, namedDisplayPreview, publicNamePreviewVersion }`.
- `POST /api/feedback/platform`
  - header: `Idempotency-Key`;
  - body: `{ "message": "..." }`;
  - returns 201 new or 200 matching retry with `{ changed, feedback }`.
- `GET /api/feedback/platform/me?page=1&limit=20`
  - own records only.
- `POST /api/feedback/testimonials`
  - header: `Idempotency-Key`;
  - named body: `{ message, attributionMode: "named", consent: true, consentVersion, consentBinding, publicNamePreviewVersion }`;
  - anonymous body includes `consentBinding` and omits `publicNamePreviewVersion`;
  - returns 201 new or 200 matching retry.
- `POST /api/feedback/testimonials/:submissionId/revisions`
  - header: `Idempotency-Key`;
  - named body: `{ baseRevisionId, message, attributionMode: "named", consent: true, consentVersion, consentBinding, publicNamePreviewVersion }`;
  - anonymous body includes `consentBinding` and omits `publicNamePreviewVersion`;
  - returns 201 new revision or 200 matching retry.
- `POST /api/feedback/testimonials/:submissionId/withdraw`
  - exact empty body;
  - returns `{ changed, testimonial }`.
- `GET /api/feedback/testimonials/me?page=1&limit=20`
  - own submissions and current revision only in list responses.
- `GET /api/feedback/testimonials/:submissionId?revisionPage=1&revisionLimit=20`
  - own submission only;
  - independently paginated revision history, maximum revision limit 100.

### Administrator routes

- `GET /api/admin/feedback/platform?page=1&limit=20`
- `GET /api/admin/feedback/testimonials?status=pending&page=1&limit=20`
- `GET /api/admin/feedback/testimonials/:submissionId?revisionPage=1&revisionLimit=20`
- `POST /api/admin/feedback/testimonials/:submissionId/revisions/:revisionId/approve` with exact empty body
- `POST /api/admin/feedback/testimonials/:submissionId/revisions/:revisionId/reject` with `{ explanation }`
- `POST /api/admin/feedback/testimonials/:submissionId/revisions/:revisionId/revoke` with `{ explanation }`

Moderation requests identify the exact revision. The service verifies that it is still current where required; routes do not perform weaker prechecks that could race the transaction.

### Public route

- `GET /api/public/testimonials?page=1&limit=20`
- default page 1, default limit 20, maximum limit 50;
- strict scalar positive safe integers and safe offset;
- deterministic `approvedAt DESC, id DESC` ordering;
- database count before pagination;
- response `{ testimonials, page, limit, total, totalPages }`;
- `Cache-Control: no-store` and no authenticated/private response fields.

Author and administrator lists default to 20 and permit a maximum limit of 100, following existing feedback conventions. Empty and out-of-range pages retain authoritative totals. Queries use explicit attributes, joins, and stable ordering without per-row lookups.

## Landing-Page Testimonials

The landing page loads only the public endpoint. It fetches on mount and revalidates on `pageshow` and on a real hidden-to-visible return. It does not poll and does not use local storage, session storage, IndexedDB, service-worker persistence, or fabricated fallback testimonials. Requests are aborted and generation-fenced across unmount/replacement. A failed request omits the testimonial content or shows a neutral retryable state; it never presents a failure as zero approved testimonials.

Presentation rules:

- zero approved items: **proposed default** is to omit the testimonial section entirely; do not show placeholder quotes or fabricate an empty testimonial card;
- one to three items: render a static responsive row/grid with no animation and no unnecessary pause control;
- four or more items: render a continuously moving horizontal track with two visual groups of identical width;
- the first group is the single semantic list; the duplicate group is `aria-hidden="true"`, contains no focusable descendants, and is not announced;
- testimonial cards preserve line breaks, wrap long text, and interpret no HTML, Markdown, or links;
- one Pause/Resume button sits outside the track and exposes `aria-pressed` plus an unambiguous accessible label;
- user-paused state persists while the component remains mounted;
- animation pauses on pointer hover and whenever keyboard focus is within the testimonial section; leaving hover/focus resumes only if the user did not explicitly pause;
- focusable cards exist only in the semantic group, so keyboard users can inspect each unique testimonial without encountering clones;
- no moving content is placed in an `aria-live` region;
- `prefers-reduced-motion: reduce` renders the unique semantic group as a static responsive grid/list, hides the duplicate group, and performs no automatic translation;
- narrow layouts keep readable card widths and permit static horizontal scrolling only in the reduced-motion/small-item presentation where needed.

Seamlessness is a visual enhancement, not a reason to duplicate accessible content. A `ResizeObserver` may measure the semantic group when required to calculate an exact loop distance; measurements and animation restart must not refetch data or reset keyboard focus.

Because the endpoint is `no-store`, withdrawal is absent from subsequent fetches. An already-open visible page can retain an item until the next mount, `pageshow`, or visibility return. Realtime removal is explicitly outside the first release.

## Implementation Phases and Verification

### Phase 8B.2 — storage foundation

Add only the three models, associations, validation constants, one forward-only migration, and focused model/migration tests. Use retained-history `ON DELETE RESTRICT` relationships for authors, submissions, and moderators. Verify constraints, indexes, current-revision uniqueness, immutable revision evidence fields, legal current/moderation and terminal-withdrawal transitions, ownership consistency, consent/name/preview-version consistency, suspension fields, RLS, direct-client table/sequence privilege revocation, registration/rerun behavior, and absence of any backfill or relation to existing classroom feedback. Do not add services, routes, account-status integration, production consent text, or UI in this phase.

### Phase 8B.3 — private platform feedback service and endpoint

Implement active student/teacher submission, idempotency, author history, administrator listing, strict serialization, and rate limiting. No testimonial behavior or UI.

### Phase 8C.1 — testimonial author services and endpoints

Implement options/preview, create, history, edit-as-new-revision, withdrawal, transaction locking, uncertain retries, and account/scope fencing. Test named and anonymous snapshots, preview-HMAC and consent versioning, stale names/bases, matching retries before fresh-operation checks, suspension recovery, terminal withdrawal, edit/withdraw races, and no private-feedback conversion.

### Phase 8C.2 — administrator moderation backend

Implement queues, detail, approve, reject, and revoke. Test exact-current approval, explanations, idempotent retries, edit/approval and withdrawal/approval races, safe audit metadata, administrator-only authorization, bounded pagination, and query counts.

### Phase 8C.3 — account-status transaction integration

Extract the current account-status writes into one transaction-aware service and route all five existing mutation paths through it: administrator archive, restore, and active/inactive status changes; email-verification pending-to-active; and Google OAuth pending-to-active. Add durable suspension for deactivation/archive, deliberate preservation of suspension on activation/restore, common lock ordering, rollback tests, multi-submission tests, and regressions for current authentication/admin behavior. Verify that future account-status paths cannot bypass the integration.

### Phase 8C.4 — public testimonial read endpoint

Implement the SQL eligibility predicate, public allowlist, no-store response, stable pagination, and constant query count. Build adversarial fixtures containing existing classroom feedback, private platform feedback, pending/rejected/revoked/non-current/withdrawn/suspended testimonials, inactive authors, and approved named/anonymous testimonials; assert that only the last category is returned.

### Phase 8D.1 — authenticated author UI

Add explicit destination choices, keeping teacher-only dispatch on the existing service. Add private/testimonial history, server-derived name preview, anonymity notice, exact consent, moderation explanation, edit/resubmit, and withdrawal. Reuse production controllers for uncertain outcomes, stable keys, rate limits, auth changes, aborts, and stale-response fencing.

### Phase 8D.2 — administrator moderation UI

Add private feedback and testimonial moderation to the existing admin dashboard with independent loading/error/pagination state, identified anonymous authors, exact revision review, accessible confirmation, and account-change/unmount fencing.

### Phase 8D.3 — landing-page public section

Add the public API service/controller and accessible scrolling component. Use the proposed default of omitting the section when no approved items exist. Test zero/small/animated lists, named/anonymous labels, plain-text escaping, one semantic copy, hidden clones, pause button, hover/focus pause, user-pause persistence, reduced motion, mount/pageshow/visibility refresh, stale requests, and narrow layout. SSR/render tests are not browser motion proof.

### Phase 8E — release verification

Before deployment: review and version the testimonial consent copy and privacy disclosures; decide minor/guardian treatment; apply migrations before dependent backend code; run live PostgreSQL constraint/RLS/race tests; verify anonymous public responses and withdrawal with authenticated browser sessions; and exercise desktop, keyboard, screen-reader, reduced-motion, and narrow layouts. Verify cache headers at the deployed edge. Do not describe automated rendering as browser accessibility proof.

## Remaining Decisions

### Do not block the Phase 8B.2 storage foundation

The first-release retention behavior, retained-history foreign keys, durable suspension, terminal withdrawal, preview-version evidence, and revision transition constraints are now specified. Phase 8B.2 can proceed without guessing a storage policy. It must not add a purge/delete mechanism or describe first-release retention as a legally required duration.

### Block public testimonial launch, but not the generic storage shape

1. **Consent text and version:** approve the exact named and anonymous publication notices, including the notice that administrators can identify anonymous authors, and choose the initial production version identifier. Phase 8B.2 stores a bounded version field but does not define or activate its production value.
2. **Minors:** determine any guardian, school, or institutional requirements. No age inference or age-verification system is assumed, and the design does not claim legal compliance.

### Proposed product default, not a storage blocker

3. **Public empty state:** omit the landing-page testimonial section when there are no approved items. This is the recommended default and can be changed later without altering private/public storage boundaries.

These remaining decisions do not alter the approved separation of teacher-only feedback, administrator-private feedback, and moderated public testimonials.

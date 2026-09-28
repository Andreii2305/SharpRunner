# Phase E Protected Built-In Module Delivery — Design Specification

**Status:** Proposed for independent review
**Date:** 2026-09-28
**Baseline:** `f3dd8e4fccf536f096c78f799369068409477617` on synchronized `main`
**Scope:** Authenticated, progression-authorized delivery of SharpRunner's built-in instructional modules
**Out of scope:** Phase F assessment player UI, Phase G map/assessment transitions, Phase H teacher assessment builder, Phase I assessment analytics, game progression redesign, grading, XP, hints, or Lesson Builder redesign

## 1. Executive summary

SharpRunner currently ships every built-in instructional module as JavaScript imported by the frontend. The route `/lesson/built-in/:moduleId` is not wrapped in `ProtectedRoute`, and `BuiltInModulePage` resolves the requested module entirely from the browser bundle. A student who has not satisfied a required PRE or canonical prerequisite can therefore obtain the module by navigating directly to the route or inspecting/downloading the lazy JavaScript chunk. Local module progress is also client-controlled. Hiding a card or route does not protect this content.

Phase E will make the backend authoritative for delivery of the five built-in modules. Rich module content will move to one version-controlled, schema-validated backend JSON package. A new classroom-scoped endpoint will authenticate the student, validate active membership in the exact classroom, ask the Phase D progression service for the canonical lesson state, require `moduleUnlocked`, and only then return an allowlisted module DTO. The frontend will retain the generic renderer and local, non-authoritative reading progress but delete the rich static module files and fetch content after authorization.

The existing `lessonContent.seed.json` is not suitable as the new source. It is a partial game-curriculum catalogue, not instructional module content. Teacher-created `ClassroomLesson` records remain a separate database-backed system.

Recommended route:

```http
GET /api/classrooms/:classroomId/built-in-lessons/:lessonKey/content
```

Recommended storage: a backend-owned static JSON content package plus the existing public generic/game asset system. No migration or new database content-management system is needed for V1.

## 2. Current architecture

### 2.1 Built-in module content and registry

The rich instructional content is defined in five frontend files:

- `frontend/src/builtInModules/tutorial.js`
- `frontend/src/builtInModules/arrays.js`
- `frontend/src/builtInModules/functions.js`
- `frontend/src/builtInModules/functionsWithArrays.js`
- `frontend/src/builtInModules/finalReview.js`

`frontend/src/builtInModules/index.js` statically imports all five and constructs `builtInModules` and `builtInModuleById`. Canonical IDs are:

1. `tutorial`
2. `arrays`
3. `functions`
4. `functions-with-arrays`
5. `final`

`moduleHelpers.js` constructs nine block types: paragraph, list, heading, code, note, diagram, practice, check, and connection.

The content is substantial:

| Module | Sections | Code blocks | Practice blocks | Quick checks |
| --- | ---: | ---: | ---: | ---: |
| Tutorial | 9 | 12 | 2 | 2 |
| Arrays | 11 | 18 | 3 | 4 |
| Functions | 11 | 15 | 3 | 3 |
| Functions with Arrays | 10 | 12 | 2 | 3 |
| Final Review | 10 | 9 | 1 | 8 |

The module objects contain titles, descriptions, objectives, prose, code examples, expected output, non-graded practice starter code and revealable solutions, quick-check options/answers/feedback, references, and game navigation metadata.

### 2.2 Rendering

`frontend/src/pages/student/BuiltInModulePage.jsx` imports the registry and resolves content synchronously with `getBuiltInModule(moduleId)`. It provides a specialized renderer for the nine block types. It does not render raw HTML or Markdown; prose is inserted through React text nodes and code is displayed as text.

`PracticeCompiler` sends only student-entered source to `POST /api/practice/run`. It compares returned stdout with the content-provided expected output in the browser. Built-in practice is explicitly private, non-graded, and unrelated to score, XP, attempts, hints, or level progress. Its current “Show solution” behavior means practice solutions are intentionally student-visible after the module is authorized; there are no hidden practice tests today.

Quick checks are also non-graded. Their answer indexes currently execute entirely in the browser and affect only local reading progress.

### 2.3 Routing and navigation

`frontend/src/App.jsx` lazily imports `BuiltInModulePage`, but both of these routes are public:

```text
/lesson
/lesson/built-in/:moduleId
```

Neither route uses `ProtectedRoute`. By contrast, `/Map` and gameplay routes require authentication and an active class membership.

`LessonSection` builds module cards from backend seed metadata plus hard-coded fallback metadata and navigates to `/lesson/built-in/:lessonKey`. `BuiltInModulePage` finishes with a CTA to the module's game route. Game routes subsequently consult backend progress, but the module content has already been delivered by the browser bundle.

### 2.4 Local state

`frontend/src/builtInModules/progress.js` stores reading state under:

```text
sharprunner:built-in-module-progress:v1:<user-scope>:<moduleId>
```

The stored object contains completed section IDs, completed check IDs, the last section, and a completion timestamp. This is user-controlled convenience state. Phase D does not use it for PRE, game, POST, lesson completion, XP, or access decisions.

Practice drafts are stored in `sessionStorage` under user- and block-scoped keys. No service worker, IndexedDB, Workbox, or Cache Storage usage exists.

### 2.5 Game implementation boundary

Game configuration, scene code, validators, hints, dialogue, and public map assets are also shipped to the browser. Phase D already protects server mutations and canonical game access, but it cannot prevent inspection of shipped implementation details. Phase E will not redesign the game runtime or move Phaser scenes and validator configuration to the server. That is a separate hardening concern and must not expand this phase.

Phase E's protected scope is the five instructional module bodies listed above. Generic game art, Phaser scene code, and map assets remain unchanged unless a later security phase explicitly changes them.

## 3. Verified content leakage and gating gap

The gap is confirmed by repository evidence:

1. `BuiltInModulePage.jsx` imports `getBuiltInModule` from the static registry.
2. The registry imports all five rich module files.
3. Vite code splitting only places those imports in a downloadable lazy chunk; it does not authorize the chunk.
4. `/lesson/built-in/:moduleId` is not protected by authentication or classroom membership.
5. The page never calls Phase D before rendering content.
6. Local storage controls only UI progress and can be edited freely.

Current bypasses:

| Attack | Current result |
| --- | --- |
| Direct module URL | Content renders without PRE/prerequisite authorization and currently without authentication. |
| Download lazy JS chunk | All five module bodies, checks, and practice material are recoverable. |
| Inspect frontend source/build | Rich module literals are visible. |
| Existing API | `/api/lesson-content` returns seed/game metadata after authentication but does not serve or gate the rich modules. |
| Modify localStorage | Can forge reading completion, though Phase D correctly ignores it. |
| Bypass LessonMap navigation | Direct module route succeeds because navigation locks are not an authorization boundary. |

Code splitting is not a security mechanism. Any browser-downloadable chunk must be treated as disclosed.

## 4. Built-in versus teacher-created lesson boundary

SharpRunner has two intentionally different systems.

### 4.1 Built-in curriculum modules

- Product-authored and version-controlled.
- Identified by canonical string lesson keys.
- Same content for every classroom.
- Access varies by exact classroom progression state.
- Rendered by `BuiltInModulePage` with its nine-block schema.
- Reading progress is currently local and non-authoritative.
- No uploaded attachments or teacher editing.

### 4.2 Teacher-created lessons

- Stored in `ClassroomLesson`, `LessonTopic`, `ClassroomLessonAttachment`, placements, versions, progress, and submission tables.
- Identified by numeric database IDs.
- Authored, published, assigned, versioned, and scoped by teachers/classrooms.
- Rendered by `ClassroomLessonPage` and `LessonRenderer`.
- Supports secure uploaded assets, assignments, submissions, and server-side completion.
- Uses a different, narrower content block schema.

### 4.3 Shared concepts

Both have titles, descriptions, ordered topics/sections, code/practice content, and authenticated presentation. Shared React primitives may be extracted later only where schemas genuinely align.

### 4.4 Naming collisions

- “Lesson” can mean a canonical built-in module, a game level grouping, or a teacher `ClassroomLesson`.
- `ClassroomLesson.contentType = "module"` means a teacher grouping container, not a built-in module.
- `moduleId` is a string lesson key in the built-in route but a numeric teacher grouping ID in `ClassroomLesson`.
- Seed `expectedOutput` is a narrative game success outcome; practice `expectedOutput` is literal stdout.

Phase E must use names such as `builtInLesson`, `lessonKey`, and `contentRevision`. It must not persist built-ins as `ClassroomLesson` records or reuse the teacher attachment/versioning model.

## 5. Phase D integration

The canonical decision is:

```text
lessonProgressionService.getLessonProgressionState({
  classroomId,
  studentId,
  lessonKey,
  authorizedMembership
}) -> state.moduleUnlocked
```

`moduleUnlocked` is derived as:

```text
curriculumPrerequisiteSatisfied && preSatisfied
```

The service already:

- validates exact active membership when given the exact classroom;
- loads only published PRE/POST assessments;
- scopes attempts to the exact classroom, student, and assessment IDs;
- uses account-global game progress consistently with Phase D;
- honors classroom level settings;
- computes canonical prerequisite completion;
- treats optional PRE and absent/draft/unpublished PRE as satisfied.

Phase E must not recalculate any of these rules.

### 5.1 Proposed helper boundary

Extend `lessonProgressionService` with `assertModuleAccessAllowed(...)`. It will call `getLessonProgressionState`, return the state when `moduleUnlocked` is true, and otherwise raise the existing `LessonProgressionError` semantics:

- `LESSON_PREREQUISITE_REQUIRED`
- `PRE_ASSESSMENT_REQUIRED`

This helper centralizes the mapping from canonical state to denial and prevents the content route from embedding progression policy.

### 5.2 Exact classroom membership

The endpoint carries `classroomId` explicitly. Before progression evaluation, a student-class helper must query a fresh membership matching:

```text
studentId = authenticated student
classroomId = route classroomId
membership.status = active
classroom.isActive = true
```

The resulting membership is passed to the progression service as `authorizedMembership`, avoiding a duplicate membership query. A membership from another classroom, an inactive membership, or a formerly valid membership is never accepted.

The frontend may obtain its default canonical classroom ID from `/api/progress/me` or `/api/classrooms/me`, but the backend never trusts that client selection without the exact membership query.

## 6. Protected-content scope by lesson

| Lesson | Classification | Authorization |
| --- | --- | --- |
| `tutorial` | **AUTHENTICATED** | Student authentication and exact active classroom membership. Phase D makes `moduleUnlocked` true because there is no prior lesson or PRE gate. |
| `arrays` | **PROGRESSION-GATED** | Tutorial canonical completion plus any published required Arrays PRE submission. |
| `functions` | **PROGRESSION-GATED** | Arrays canonical lesson completion plus any published required Functions PRE submission. |
| `functions-with-arrays` | **PROGRESSION-GATED** | Functions canonical lesson completion plus any published required Functions with Arrays PRE submission. |
| `final` | **PROGRESSION-GATED** | Functions with Arrays canonical lesson completion. Final is assessment-exempt but is a real ten-section review module before the final game. |

No module is public in V1. Tutorial is assessment-exempt, not anonymous.

## 7. Backend route and API contract

### 7.1 Route

```http
GET /api/classrooms/:classroomId/built-in-lessons/:lessonKey/content
Authorization: Bearer <student JWT>
```

Mount a thin dedicated router at `/api/classrooms`. Do not add this content logic to the teacher Lesson Builder router.

### 7.2 Request validation and authorization order

1. Authenticate the JWT.
2. Require role `student`.
3. Parse `classroomId` as a positive safe integer.
4. Validate `lessonKey` syntax as exact lowercase kebab-case.
5. Load a fresh active membership for the exact student/classroom and require the classroom itself to be active.
6. Validate the key against the five canonical built-in lesson keys.
7. Call `assertModuleAccessAllowed` with that exact membership.
8. Look up and serialize the static content by exact key.
9. Set protected-content cache headers and return the DTO.

Membership precedes content lookup so a caller outside the classroom cannot use error differences to inspect content availability.

### 7.3 Success response

```json
{
  "schemaVersion": 1,
  "contentRevision": "2026-09-28.1",
  "lesson": {
    "lessonKey": "arrays",
    "eyebrow": "Built-in module",
    "title": "Arrays",
    "description": "...",
    "objectives": ["..."],
    "sections": [
      {
        "id": "array-foundations",
        "title": "Array foundations",
        "blocks": [
          { "type": "paragraph", "text": "..." }
        ]
      }
    ],
    "game": {
      "title": "Arrays Adventure",
      "route": "/array/level/1"
    },
    "references": [
      { "title": "Microsoft Learn. Arrays", "url": "https://..." }
    ]
  }
}
```

The response contains no attempts, scores, assessment settings, membership data, progress rows, or internal database IDs.

### 7.4 Errors

| Status | Code | Meaning |
| ---: | --- | --- |
| 400 | `INVALID_CLASSROOM_ID` | Classroom path value is malformed. |
| 400 | `INVALID_LESSON_KEY` | Lesson key syntax is malformed. |
| 401 | existing authentication error | Missing, invalid, or expired token. |
| 403 | `FORBIDDEN` | Wrong role, no exact active membership, inactive classroom, or former member. |
| 403 | `LESSON_PREREQUISITE_REQUIRED` | Canonical prior lesson is incomplete. |
| 403 | `PRE_ASSESSMENT_REQUIRED` | Published required PRE has no submitted attempt. |
| 404 | `BUILT_IN_LESSON_NOT_FOUND` | Authorized caller supplied a syntactically valid unsupported key or content is absent. |
| 500 | `SERVER_ERROR` | Unexpected failure without internal details. |

Progression denials reuse Phase D messages and safe fields (`lessonKey`, `prerequisiteLessonKey`, `assessmentId`, `nextAction`). They never include assessment questions, attempt counts, grades, or content.

`MODULE_LOCKED` is not introduced because the two existing Phase D denial reasons fully explain every current `moduleUnlocked === false` state.

### 7.5 Existing lesson-content endpoints

`GET /api/lesson-content` currently returns the full seed, including game level objectives and narrative outcomes, to every authenticated caller. Phase E should reduce its `lessons` projection to navigation metadata required by `LessonSection`: lesson key, title, theme, description, and ordering only.

The unused `GET /api/lesson-content/:lessonKey` route exposes a whole seed lesson without progression authorization. Remove it rather than maintain a second built-in content endpoint. Teacher-created routes under `/api/lesson-content/classroom-*` remain unchanged.

## 8. Content schema

The canonical JSON package contains:

### 8.1 Package

| Field | Required | Rules |
| --- | --- | --- |
| `schemaVersion` | Yes | Integer `1`. |
| `contentRevision` | Yes | Immutable deployment revision string. |
| `lessons` | Yes | Exactly one unique entry per canonical lesson key. |

### 8.2 Lesson

| Field | Required | Student safe | Semantics |
| --- | --- | --- | --- |
| `lessonKey` | Yes | Yes | Exact canonical string key. |
| `eyebrow` | Yes | Yes | Short presentation label. |
| `title` | Yes | Yes | Module title. |
| `description` | Yes | Yes | Plain text introduction. |
| `objectives` | Yes | Yes | Ordered non-empty plain-text list. |
| `sections` | Yes | Yes after authorization | Ordered section list; array order is canonical. |
| `game` | Yes | Yes | `{title, route}` presentation link; route must be an allowlisted internal route. |
| `references` | Yes | Yes | Ordered `{title, url?}` entries; URL limited to `https:`. |

### 8.3 Section

`id` and `title` are required non-empty strings. `id` is stable and unique within the lesson because local reading progress refers to it. `blocks` is an ordered non-empty array. No client-supplied display order is accepted.

### 8.4 Block union

| Type | Fields | Notes |
| --- | --- | --- |
| `heading` | `text` | Plain text. |
| `paragraph` | `text` | Plain text. |
| `list` | `items[]` | Ordered plain-text items. |
| `code` | `title`, `value`, optional `output` | Rendered as text, never HTML. Current unused `runnable` may be omitted. |
| `note` | `label`, `text`, `tone` | `tone` allowlist: `note`, `warning`. |
| `diagram` | `headers[]`, `rows[][]`, `caption` | Rectangular bounded table of plain strings. |
| `practice` | `id`, `prompt`, `starterCode`, `solution`, `expectedOutput` | Non-graded; solution is intentionally revealable only after module authorization. |
| `check` | `id`, `prompt`, `options[]`, `answer`, `feedback` | Non-graded local formative check. Answer is authorized lesson content, not an assessment grading key. |
| `connection` | `text` | Plain text curriculum/game connection. |

V1 introduces no `html`, `markdown`, arbitrary style, script, or general-purpose URL block. All strings and collection sizes are bounded during backend startup validation. Duplicate lesson, section, practice, or check IDs fail startup/tests.

### 8.5 Answer-material decision

- Graded assessment questions, correct-choice IDs, hidden explanations, grading keys, and game validator configuration remain outside this package.
- Built-in practice solutions are already explicitly revealable through “Show solution”; they may be returned after authorization.
- Expected stdout is visibly displayed by the current practice UI and may be returned after authorization.
- Quick-check answers are non-graded and affect only client-local reading progress. They may remain client evaluated in V1.
- If any practice/check later affects grades, progression, XP, or certification, its answer/evaluation must move to a separate server evaluator before that behavior ships.

## 9. Storage decision

### Option A — backend static JSON only

Strong fit for immutable product-authored content: version controlled, deployable, testable, no migration, and unavailable from browser bundles until the API authorizes it. It does not support teacher editing, which Phase E does not require.

### Option B — database-backed built-in CMS

Would support live editing and revisions but creates migrations, administration, tenant/content versioning, deployment seeding, and accidental coupling with Lesson Builder. It is unnecessary for V1.

### Option C — reuse `lessonContent.seed.json`

Rejected. The seed contains game-level catalogue data only. It lacks instructional sections, objectives, block bodies, code examples, quick checks, practice starter code/solutions, references, and content schema validation. It also contains the legacy `functions-level-12`, which Phase D intentionally excludes from playable requirements.

### Option D — hybrid

**Recommended.** Use one backend-owned static JSON package for rich built-in module content; retain database storage for teacher-created lessons, assessments, progress, and classroom policy; retain public static delivery for generic decorative/game assets. This is Option A for content plus existing systems at their established boundaries.

The package is the sole canonical rich module source. Do not copy the rich bodies into the seed or database.

## 10. Frontend migration

### 10.1 New flow

```text
Protected module route
  -> resolve explicit classroom ID from current progress/classroom context
  -> GET classroom-scoped built-in content
  -> backend authenticates and evaluates Phase D moduleUnlocked
  -> success DTO stored only in component memory
  -> existing safe block renderer renders content
```

### 10.2 Page states

- **Loading:** skeleton/status while classroom context and content are fetched.
- **Success:** render the returned DTO; initialize local reading progress only after the lesson key matches.
- **Locked:** clear any prior lesson object, show the safe Phase D message and next-action navigation. Do not render section titles or cached content.
- **Authentication failure:** clear content and route to login/session-expired behavior.
- **Forbidden membership:** show generic unavailable/forbidden state without confirming another classroom's content.
- **Not found:** show “Built-in lesson not found” and return-to-lessons action.
- **API/network failure:** show retry; retry repeats membership and progression authorization.

Abort stale requests on parameter changes and unmount. Never retain the previous module while a new module request is loading or denied.

### 10.3 Route defense in depth

Wrap both `/lesson` and `/lesson/built-in/:moduleId` in `ProtectedRoute requireClassMembership`. This improves UX and prevents anonymous shell access, but the backend content endpoint remains the security boundary.

### 10.4 Local progress

Preserve `builtInModules/progress.js` for reading-position convenience. Its data remains non-authoritative and must never unlock content, games, assessments, rewards, or canonical lesson completion. Preserve stable module/section/check IDs during data migration.

Do not persist the returned module payload to localStorage or sessionStorage. Practice drafts may continue to store only student-authored code in user-scoped session storage.

## 11. Direct URL behavior

| Scenario | Required behavior |
| --- | --- |
| Unauthenticated direct URL | Redirect to login; no module content request/response. |
| Authenticated student without active class | Membership-required UI; no content. |
| Wrong classroom ID | `403 FORBIDDEN`; no content fields. |
| Former member | `403 FORBIDDEN` from a fresh membership query. |
| Required PRE incomplete | `403 PRE_ASSESSMENT_REQUIRED`; no lesson DTO. |
| Canonical prerequisite incomplete | `403 LESSON_PREREQUISITE_REQUIRED`; no lesson DTO. |
| Optional/draft/unpublished PRE | Does not gate, matching Phase D. |
| PRE and prerequisite satisfied | Content loads. |
| Manipulated localStorage | No effect on backend authorization. |
| Manipulated frontend route | Endpoint independently denies access. |

## 12. Bundle-security strategy

Phase E is incomplete until the rich content files are absent from production output.

Add a build audit that:

1. Builds the frontend production bundle.
2. Recursively scans all generated JavaScript, CSS, HTML, JSON, and source maps.
3. Fails if distinctive sentinel phrases, practice IDs, solution strings, or quick-check IDs from any of the five modules appear.
4. Fails if production source still imports the five content modules or their registry.
5. Verifies the content request occurs only through the authenticated API flow.

Sentinels must cover all five modules and include values unlikely to occur in UI labels. The audit must scan lazy chunks and source maps, not only the entry bundle.

Backend denial tests must recursively assert that locked response bodies contain none of: `lesson`, `sections`, `blocks`, `objectives`, `solution`, `answer`, or `expectedOutput`.

Old hashed assets may remain in a CDN after deployment. The rollout must remove obsolete assets and invalidate/purge hosting caches. Previously downloaded content cannot be retroactively revoked; Phase E protects future delivery.

## 13. Cache and browser-storage policy

Every content response and every content denial should set:

```http
Cache-Control: private, no-store, max-age=0
Pragma: no-cache
Vary: Authorization
```

`no-store` is chosen over ordinary private caching because membership, PRE publication/required state, submitted attempts, and prerequisite completion can change, and shared browsers must not expose a prior student's module payload.

The frontend holds the payload only in React component memory. It clears content on logout, route/classroom change, authorization failure, and unmount. No query-cache persistence, localStorage payload cache, service worker, Cache Storage, or IndexedDB layer is introduced.

Local reading progress and student-authored practice drafts are not copies of the module body and may remain under their existing user-scoped keys.

## 14. Asset policy

The five current instructional module files do not use image blocks or import lesson-specific images. Their `diagram` blocks are HTML tables. Therefore Phase E does not need authenticated asset delivery in V1.

Generic game art, audio, sprites, tiles, and maps under `frontend/public/game/assets` remain public. They do not contain the instructional module prose being protected, and moving the Phaser asset graph is outside scope.

If a future built-in module adds an educational image whose content itself must be gated, the JSON must reference a stable `assetId`, and a classroom-scoped authenticated asset route must apply the same module authorization. V1 must not accept arbitrary file paths or build filesystem paths from `lessonKey` or `assetId`.

## 15. Security model

| Threat | Control |
| --- | --- |
| Authentication bypass | JWT middleware and student-role middleware on the API; `ProtectedRoute` only improves UX. |
| Classroom IDOR | Fresh exact `(studentId, classroomId, active)` membership joined to active classroom. |
| Wrong-class assessment state | Pass the exact authorized membership/classroom to Phase D; every assessment/attempt query remains classroom-scoped. |
| Former membership | No authorization caching; fresh membership query on every content request. |
| Client gate/localStorage bypass | Backend `moduleUnlocked` is the only content authorization decision. |
| Lesson-key enumeration | Strict syntax/canonical allowlist; known keys are not secrets; unsupported authorized request gets 404. |
| Content in denial errors | Allowlisted error serializer with no content object. |
| Hidden grading-key leakage | Assessment and game validation data are not part of the module package. Non-graded revealable practice/check material is explicitly classified. |
| Browser/proxy cache leakage | `private, no-store`, `Vary: Authorization`, memory-only payload. |
| Frontend bundle leakage | Delete rich imports/files and enforce sentinel production-build audit. |
| Path traversal | Static in-memory map lookup only; no request-derived filesystem path. |
| Malformed keys | Positive integer classroom parsing; exact lowercase kebab-case lesson key; canonical set validation. |
| Oversized payload | Startup schema limits for string lengths, section/block counts, code sizes, and total serialized lesson size. |
| XSS | No raw HTML/Markdown; render strings as React text; validate `https:` reference URLs and internal game routes. |
| Code rendering | `<pre><code>` text only; never evaluate content code in the page. Practice runner retains its existing server sandbox. |

The endpoint is read-only, so no row lock or transaction is required. Authorization is reevaluated on every request.

## 16. Query and performance expectations

Static content lookup is O(1) and makes no database query.

For one lesson request, authorization performs a constant bounded set:

1. one exact active membership/classroom query;
2. one published assessment query restricted to the canonical prefix;
3. one account progress query restricted to playable keys in that prefix;
4. one classroom level-settings load;
5. at most one attempt query for the exact loaded assessment IDs.

The number of queries does not grow with sections, blocks, class size, attempt history outside the relevant assessments, or total curriculum content. Pass the already loaded membership to Phase D to avoid a duplicate membership query. Do not call `/api/progress/me` internally or load all module bodies.

Content may be parsed/validated once at process startup and held in an immutable map. Authorization decisions and HTTP responses are not cached.

## 17. Compatibility constraints

Phase E must preserve:

- Phase D's canonical lesson order, `moduleUnlocked`, game/POST gates, replay behavior, and account-global game progress.
- Phase B/C assessment grading, attempts, locking, idempotency, authorization, and serializers.
- Existing game routes, Phaser scenes, validator behavior, maps, XP, hints, deadlines, and rewards.
- Practice compiler request/response and sandbox behavior.
- Teacher-created Lesson Builder schemas, routes, versions, assets, assignments, submissions, and renderer.
- Teacher analytics and learning-event behavior.
- Responsive/module styling and accessibility semantics.

Local module reading completion remains a convenience signal only. Phase E does not make reading sections a new canonical progression gate.

## 18. Test matrix

### 18.1 Backend content-service tests

- Package schema accepts the converted five-module fixture.
- Exactly five canonical unique lesson keys exist.
- Section, block, practice, and check IDs are unique and stable.
- All block discriminators and required fields serialize faithfully.
- Unknown fields, raw HTML, unsafe reference protocols, unsafe game routes, oversized strings/collections, malformed diagrams, and duplicate IDs fail validation.
- O(1) exact content lookup returns a defensive/immutable projection.
- Seed content is not used as the rich module body.

### 18.2 Backend route/integration tests

- Missing/invalid authentication returns 401 and no content.
- Non-student role is forbidden unless teacher preview is explicitly approved later.
- Malformed classroom ID returns 400.
- Malformed/unsupported lesson key returns the defined 400/404 contract.
- Exact active membership is required.
- Membership in classroom A cannot authorize classroom B.
- A former member cannot retrieve content previously accessed.
- An inactive classroom cannot authorize content.
- Tutorial succeeds for an active student without assessment gates.
- Arrays/Functions/Functions with Arrays deny incomplete canonical prerequisites.
- Published required PRE without submitted attempt denies with `PRE_ASSESSMENT_REQUIRED`.
- Submitted required PRE allows when prerequisite is satisfied.
- Optional PRE does not gate.
- Draft/unpublished PRE does not gate.
- Final denies until Functions with Arrays canonical completion, then succeeds without PRE.
- Locked errors contain no content fields or distinctive lesson strings.
- Success payload contains only the DTO allowlist and no progression/assessment internals.
- Cache headers are present on success and denial.
- Content lookup adds no DB query; route query count remains constant as content, students, and unrelated attempts grow.
- Concurrent membership removal followed by a new request is denied because membership is reread.

### 18.3 Phase D regression tests

- `assertModuleAccessAllowed` follows existing `moduleUnlocked` for tutorial, prerequisites, required/optional PRE, draft/unpublished PRE, and final.
- Existing assessment interaction and level access semantics remain unchanged.
- Exact authorized membership still rejects wrong classroom/student/status.

### 18.4 Frontend tests

- Loading state renders no stale content.
- Successful DTO renders parity for every block type.
- Locked response renders correct next action and no lesson sections.
- 401 routes to session handling/login.
- 403 membership failure is generic.
- 404 renders not-found state.
- Network/5xx state offers retry; retry repeats authorization.
- Direct URL performs backend fetch before content render.
- Forged module-progress localStorage cannot bypass a denial.
- Route/lesson/classroom change aborts stale fetch and clears prior content.
- Practice blocks receive starter code, visible expected output, revealable solution, and stable storage ID.
- Section/check local progress remains compatible with preserved IDs.
- Responsive/mobile contents navigation remains functional.
- `/lesson` and built-in module routes are wrapped by protected membership routing.

### 18.5 Build/security tests

- Production bundle contains none of the five module bodies or sentinel strings.
- No source import remains for deleted rich module files/registry.
- Locked API responses contain no content.
- No graded assessment answer or game validator configuration is present in the built-in content DTO.
- No module payload is written to browser persistent storage.
- Content responses are not served from browser cache after logout/account change.

### 18.6 Whole-system regression

- Full backend suite, including Phase B-D assessment/progression tests.
- Full frontend test suite, lint, and production build.
- Practice compiler and compiler-host integration.
- Lesson Builder and teacher-created lesson tests.
- Game route/validator/map tests.
- `git diff --check` and a scope audit excluding models, migrations, grading, XP, hints, analytics, and later-phase UI.

## 19. Migration and rollout strategy

1. Create the backend package schema/validator and mechanically convert all five frontend module objects while preserving IDs, order, text, code, expected output, checks, references, and game links.
2. Add parity tests comparing a checked-in conversion fixture or normalized snapshots before deleting frontend sources.
3. Add the exact classroom membership helper and Phase D `assertModuleAccessAllowed` extension.
4. Add the classroom-scoped content route, safe error mapping, no-store headers, and integration/security tests.
5. Sanitize the legacy lesson catalogue response and remove the unused per-key seed endpoint.
6. Add the frontend fetch/state adapter and change `BuiltInModulePage` to render the DTO.
7. Protect `/lesson` and `/lesson/built-in/:moduleId` routes.
8. Delete the five rich frontend module files, registry, and constructor helpers only after renderer parity is green. Keep local reading-progress helpers.
9. Add and run the production-bundle sentinel audit.
10. Deploy backend before frontend if services deploy separately. The feature is not security-complete until the frontend deployment deletes old chunks and the CDN/static host is purged.
11. Run full regression, direct-URL, wrong-classroom, former-member, cache, and production-bundle verification.

No database migration or data backfill is required.

## 20. Risks and deferred work

### Risks

- Mechanical conversion can omit or reorder content; parity snapshots and stable-ID tests are mandatory.
- Old CDN/browser chunks may retain previously public content; deployment must remove/purge old assets, though already downloaded copies cannot be revoked.
- Multiple active classrooms require an explicit classroom choice. The default UI may use Phase D's primary classroom, but the API remains exact-classroom scoped.
- The existing content files include answer indexes and solutions. V1 treats these as authorized, non-graded lesson material; changing that classification later requires an evaluator API.
- Seed and catalogue metadata can drift from the canonical content package unless catalogue projections are tested.

### Deferred

- Assessment player UI, map assessment cards, and POST transition UI.
- Teacher assessment builder and assessment analytics.
- Database editing/versioning of product-authored built-in content.
- Server-authoritative built-in reading completion.
- Protection/refactoring of Phaser scene source, game validator configuration, maps, and generic game assets.
- Authenticated built-in educational-image delivery, because current modules have no images.
- Teacher/admin preview of gated built-in content.
- Graded or hidden-test practice exercises.

## 21. Exact proposed files

### Add

- `backend/src/data/builtInLessonContent.v1.json` — canonical five-module package.
- `backend/src/services/builtInLessonContentService.js` — startup validation, immutable lookup, and student DTO serialization.
- `backend/src/routes/builtInLessonContent.js` — thin authenticated classroom-scoped GET route.
- `backend/test/builtInLessonContentService.test.js` — schema, parity, lookup, and serialization tests.
- `backend/test/builtInLessonContentRoutes.integration.test.js` — auth, exact membership, Phase D gates, leakage, headers, and query-bound tests.
- `frontend/src/services/builtInLessonContentService.js` — request and safe error normalization.
- `frontend/src/pages/student/builtInModuleContentState.js` — pure loading/success/locked/error state transitions.
- `frontend/src/pages/student/builtInModuleContentState.test.js` — page-state and stale-response tests.
- `frontend/scripts/audit-protected-built-in-content.mjs` — source/import and production-bundle sentinel audit.

### Modify

- `backend/src/app.js` — mount the new router under `/api/classrooms`.
- `backend/src/services/studentClassService.js` — add fresh exact active membership plus active-class lookup.
- `backend/src/services/lessonProgressionService.js` — add `assertModuleAccessAllowed` without changing progression rules.
- `backend/src/routes/lessonContent.js` — return catalogue-only built-in metadata and remove the unused ungated per-key seed endpoint.
- `backend/test/lessonProgressionService.test.js` — pin the module-access helper to existing state semantics.
- `backend/test/apiRoutes.integration.test.js` — route registration and malformed-input coverage.
- `backend/test/runTests.js` — register new backend test files.
- `frontend/src/App.jsx` — protect lesson and built-in module routes.
- `frontend/src/Components/LessonSection/LessonSection.jsx` — use catalogue-only metadata and propagate/default the canonical classroom context.
- `frontend/src/pages/student/BuiltInModulePage.jsx` — fetch authorized content and render explicit request states.
- `frontend/src/builtInModules/progress.js` — only if needed to rename `moduleId` to `lessonKey` while preserving V1 storage compatibility; no authorization behavior.
- `frontend/package.json` — register protected-content audit in test/build verification.

### Delete after parity verification

- `frontend/src/builtInModules/tutorial.js`
- `frontend/src/builtInModules/arrays.js`
- `frontend/src/builtInModules/functions.js`
- `frontend/src/builtInModules/functionsWithArrays.js`
- `frontend/src/builtInModules/finalReview.js`
- `frontend/src/builtInModules/index.js`
- `frontend/src/builtInModules/moduleHelpers.js`

### Explicitly unchanged

- Database models and migrations.
- `ClassroomLesson`, Lesson Builder, teacher lesson routes, topics, versions, and attachments.
- Assessment grading/persistence/services except reuse of Phase D state.
- Game scenes, level configs, validators, public maps/assets, XP, hints, analytics, and later-phase UI.

## 22. Open questions requiring approval

1. **Non-graded answer material:** Approve the recommended V1 classification that revealable practice solutions, visible expected stdout, and local quick-check answer indexes may be sent only after module authorization. If they must be confidential even from an authorized student, Phase E needs additional check/practice evaluator endpoints and a larger scope.
2. **Multiple classrooms:** Approve explicit `classroomId` in the API and the current Phase D primary classroom as the frontend default. A later classroom selector can deliberately choose another active membership.
3. **Legacy seed routes:** Approve reducing `/api/lesson-content` to catalogue metadata and removing the unused `/api/lesson-content/:lessonKey` seed-detail route so it cannot remain a parallel ungated content path.
4. **Tutorial policy:** Approve tutorial as authenticated plus exact-active-membership content, but assessment-exempt.
5. **Teacher preview:** V1 recommends student-only delivery. Teacher/admin preview of built-in content is deferred unless explicitly required.
6. **Deployment purge:** Confirm the production host can delete old hashed assets and invalidate caches when the frontend bundle is deployed.
7. **Local reading progress:** Approve retaining section/check completion in localStorage strictly as a convenience signal, with no effect on Phase D or rewards.

No implementation or implementation plan should begin until these decisions and this specification are approved.

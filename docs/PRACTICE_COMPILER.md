# Built-in Module Practice Compiler

SharpRunner's built-in modules use this learning sequence:

`Explain -> Example -> Run -> Try -> Check -> Apply in Game`

Worked examples remain read-only. Try It Yourself blocks use Monaco, restore
their starter with Reset Code, optionally reveal one solution, and retain a draft
only in browser session storage. A run can show output, compiler diagnostics,
runtime errors, timeout/output-limit guidance, or a temporary-unavailable state.
Students can always continue the module.

## Academic separation

Practice is a transient, non-graded sandbox. `/api/practice/run` is separate from
all game and progress routes. It neither reads nor writes score, XP, attempts,
hints, grade, deadlines, timers, completion, unlocks, or leaderboard state. A
matching expected output is only a local formative check.

## Execution architecture

The authenticated SharpRunner API validates source and dispatches it to one of
two interchangeable execution backends:

- **Production:** `render.yaml` creates a dedicated Docker service containing
  Node 22 and the .NET 8 SDK. Render injects its address and a generated shared
  token into the API service; no manual compiler host is required.
- **Local/self-hosted:** when the URL is absent, the API invokes a local Docker
  daemon and starts one disposable container per run.

The remote service contract is intentionally small:

- `GET /health` returns `{ "available": true }` only when its C# SDK and sandbox
  are ready.
- `POST /run` accepts `{ "code", "timeoutMs", "outputLimit" }` and returns
  `{ "success", "stdout", "stderr" }`, with optional `timedOut`,
  `outputLimited`, and `errorType` fields.

The service authenticates `PRACTICE_RUNNER_TOKEN` and is isolated from the API,
database, and user data at the service-container boundary. It compiles a unique
temporary top-level-statement project, then executes the resulting assembly in
a separate unprivileged process with a scrubbed environment. Source is never
placed in a shell command and expected output is never used as actual output.

The receiver is `backend/src/practiceRunnerServer.js`; its reproducible image is
`backend/Dockerfile.practice-runner`. The receiver ignores client-supplied
resource limits and uses its own timeout, output-limit, and concurrency values.

## Deployment and safety

The prior blueprint deployed only the native Node API, which has neither Docker
nor a .NET SDK. It declared `PRACTICE_RUNNER_URL` and token as manual settings
without deploying the required service, so `/api/practice/run` could only return
503. The blueprint now deploys and wires the runner alongside the API. Syncing
the Blueprint builds the SDK into the runner image before it starts.

Each request requires an active student account and is rate-limited per user.
Source is capped at 16 KB. The production service permits one execution at a
time, runs student assemblies as Linux `nobody`, exposes only an allowlisted
non-secret process environment, caps output at 32 KB, and kills execution after
five seconds. A preflight policy blocks file, network, process, environment,
reflection, native interop, unsafe, and dynamic APIs. Every request uses a
random temporary directory that is removed after success, failure, or timeout.
Local Docker mode additionally uses no networking, a read-only root filesystem,
dropped capabilities, `no-new-privileges`, and CPU/memory/PID limits.

Compilation requires the **.NET 8 SDK**, not only the runtime. The production
Dockerfile derives from `mcr.microsoft.com/dotnet/sdk:8.0-bookworm-slim` and the
local Docker adapter uses `mcr.microsoft.com/dotnet/sdk:8.0`.

`GET /api/practice/health` is authenticated for students and exposes only
`{ "available": boolean }`. It never returns image names, paths, credentials, or
host details. `POST /api/practice/run` uses 400 for source-policy/input rejection,
408 for a sandbox timeout, 429 for rate limiting, 500 for an unexpected API
error, and 503 when the execution capability cannot be reached.

## Verification

- `npm --prefix backend test` performs real compilation/execution tests for
  output, edited output, compile/runtime errors, timeout, and empty output.
- `npm --prefix frontend run test:practice-content` audits all five modules and
  compiles every runnable worked example and Try It Yourself solution.
- Manually verify `GET /api/practice/health`, authenticated valid output, compiler error,
  `IndexOutOfRangeException`, infinite-loop termination, large-output termination,
  and blocked file/network/process attempts on a Docker-enabled host.

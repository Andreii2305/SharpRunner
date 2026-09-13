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
  Node 22 and the .NET 8 SDK. Render injects its public HTTPS URL and a generated
  shared token into the API service; no manual compiler host is required.
- **Local/self-hosted:** when the URL is absent, the API invokes a local Docker
  daemon and starts one disposable container per run.

The remote service contract is intentionally small:

- Public `GET /health` returns readiness, `compilerAvailable`, and the detected
  SDK version only when its C# SDK and runtime are ready. It is public because
  Render health checks cannot send a bearer token and it exposes no host, path,
  or secret. The legacy `dotnet` boolean remains during rolling deployments.
- `GET /health/auth` performs the same check behind runner authentication. The
  main API uses it to detect a mismatched shared token.
- `POST /run` accepts `{ "code", "timeoutMs", "outputLimit" }` and returns
  `{ "success", "stdout", "stderr" }`, with optional `timedOut`,
  `outputLimited`, and `errorType` fields.

The service authenticates `PRACTICE_RUNNER_TOKEN` and is isolated from the API,
database, and user data at the service-container boundary. The image restores a
stable top-level-statement project once during its build. Each request copies
that project's immutable metadata and restore assets into a unique job directory,
writes only that student's source, and builds with `--no-restore`. The shared
NuGet cache is prepared in the image and is only read by jobs. The resulting
assembly still executes in a separate unprivileged process with a scrubbed
environment. Source is never
placed in a shell command and expected output is never used as actual output.

The receiver is `backend/src/practiceRunnerServer.js`; its reproducible image is
`backend/Dockerfile.practice-runner`. The receiver ignores client-supplied
resource limits and uses its own timeout, output-limit, and concurrency values.

## Deployment and safety

Two deployment mistakes can produce the generic unavailable message:

1. A manually created API service does not create services later added to
   `render.yaml`. In that case the runner does not exist at all.
2. Render's `fromService.property: hostport` value is an internal address such
   as `service:10000`, with no URL scheme. Although the API normalizes that form
   to `http://`, a **free** Render web service cannot receive private-network
   traffic. The old free-plan wiring was therefore unreachable. The Blueprint
   now copies the runner's Render-provided `RENDER_EXTERNAL_URL` instead. This is
   an HTTPS public route, but `/run` and `/health/auth` remain bearer-protected.

The current Blueprint deploys and wires the runner alongside the API and sets
the runner's Render health check to `/health`. Syncing it builds the SDK into
the runner image before startup.

### Existing manual Render deployment migration

Preferred migration (reproducible):

1. Push the commit containing the corrected `render.yaml`.
2. If the repository already has a Render Blueprint, open it and click
   **Sync Blueprint**. This step is mandatory: a normal Git auto-deploy updates
   application code, but it does not refresh `fromService` environment-variable
   references. Confirm the sync changes `PRACTICE_RUNNER_URL` from the old
   private `hostport` reference to the runner's `RENDER_EXTERNAL_URL` reference.
3. If no Blueprint exists, in Render Dashboard select **New + > Blueprint**.
4. Connect GitHub if needed, select the `Andreii2305/SharpRunner` repository,
   select the production branch, and confirm the root Blueprint path is
   `render.yaml`.
5. Enter the prompted `DATABASE_URL`, `FRONTEND_URL`, SMTP values, and any other
   existing `sync: false` values. Do not manually invent either practice runner
   variable.
6. Click **Apply** (new Blueprint) or complete the sync (existing Blueprint),
   and confirm that both `sharprunner-api-andreii2305` and
   `sharprunner-practice-runner` appear in the Blueprint deployment.
7. In the runner's **Deploys** page, confirm the Docker build succeeds and its
   `/health` check passes. In its logs, confirm `Practice runner ready`, an
   available SDK, target `net8.0`, and the bound port.
8. In the API's **Environment** page, confirm `PRACTICE_RUNNER_URL` is sourced
   from the runner's `RENDER_EXTERNAL_URL` and `PRACTICE_RUNNER_TOKEN` is sourced
   from the runner variable. Values should remain hidden.
9. Redeploy the API after the sync if Render does not start a deployment
   automatically. Redeploy the frontend only if the API hostname changed.

If the existing API must remain manually managed, create a second **Web Service**
from the same repository using Docker, `backend/Dockerfile.practice-runner`, and
repository-root Docker context. Set a single 32+ character token on the runner,
set the API's `PRACTICE_RUNNER_URL` to the runner's full `https://...onrender.com`
URL, and set the API's token to the exact same value. Set runner health check
path `/health`, save and deploy both services. Blueprint deployment is preferred.

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
`{ "available": true }` or `{ "available": false, "reason": "..." }`. Sanitized
reasons include `runner_url_missing`, `runner_url_invalid`, `runner_token_missing`,
`runner_auth_failed`, `runner_unreachable`, `runner_timeout`, and
`runtime_unavailable`. It never returns image names, paths, credentials, or host
details. It makes one readiness probe with the short
`PRACTICE_RUNNER_READY_TIMEOUT_MS` budget; it never compiles or polls for minutes.
The runner's public `/health` is a constant-time liveness check, while authenticated
`/ready` and legacy `/health/auth` report cached SDK readiness. `POST /api/practice/run` uses 400 for source-policy/input rejection,
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

Free services spin down after inactivity. Mounting the shared practice component
starts one authenticated readiness request in the background, throttled to once
per five-minute browser session interval, so the runner can wake while the
student reads. A run performs only one readiness probe (three seconds by default).
If Render is still waking, the API returns HTTP 503 with
`PRACTICE_RUNNER_STARTING`, `retryAfterMs`, and `Retry-After`; it does not hold the
student request open. **Try again** becomes available after that short interval.

## Timing and benchmarking

Runner logs include readiness, compilation, execution, cleanup, and total-run
durations without logging source or credentials. For an awake-service benchmark,
open Chrome DevTools **Network**, run `Console.WriteLine("Hello");` three times,
and record each `/api/practice/run` duration. Compare those totals with the
`Practice compile finished`, `Practice execution finished`, and `Practice run
finished` log fields in Render. The first request after a new image may initialize
process-local SDK state; later requests should reuse the image's restore assets.

`UseSharedCompilation=false` and `MSBUILDDISABLENODEREUSE=1` remain intentional:
compiler/server reuse would retain more state across mutually untrusted jobs.
The optimized path instead reuses immutable restore inputs while preserving
process and directory isolation.

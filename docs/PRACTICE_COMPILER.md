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

- **Production:** `PRACTICE_RUNNER_URL` points to a dedicated sandbox service.
  `PRACTICE_RUNNER_TOKEN` is sent only server-to-server as a bearer token.
- **Local/self-hosted:** when the URL is absent, the API invokes a local Docker
  daemon and starts one disposable container per run.

The remote service contract is intentionally small:

- `GET /health` returns `{ "available": true }` only when its C# SDK and sandbox
  are ready.
- `POST /run` accepts `{ "code", "timeoutMs", "outputLimit" }` and returns
  `{ "success", "stdout", "stderr" }`, with optional `timedOut`,
  `outputLimited`, and `errorType` fields.

The service must authenticate `PRACTICE_RUNNER_TOKEN` and enforce isolation at
the container or microVM boundary. Do not deploy it as an ordinary process on
the API host. Do not substitute a general host `dotnet`, shell, or expected
output fallback.

This repository includes the receiver as `backend/src/practiceRunnerServer.js`.
On a dedicated Docker-capable Linux VM, install the backend dependencies, pull
the configured SDK image, set a 32+ character `PRACTICE_RUNNER_TOKEN`, and start
it with `npm --prefix backend run start:practice-runner`. Put it behind HTTPS
and firewall it to the API service where possible. The receiver ignores client-
supplied resource limits and uses its own `PRACTICE_RUNNER_TIMEOUT_MS` and
`PRACTICE_RUNNER_OUTPUT_LIMIT` values.

## Deployment and safety

The committed Render blueprint is a native Node service. Render's native runtime
does not provide Docker or the .NET toolchain, so production **must** set
`PRACTICE_RUNNER_URL` and `PRACTICE_RUNNER_TOKEN` to a separately deployed,
purpose-built sandbox. This is the production fix for the former unconditional
local `docker` spawn. A Docker-capable VM may instead host the API without the
remote adapter.

Each request requires an active student account and is rate-limited per user.
Source is capped at 16 KB. The runner starts an ephemeral container with no
network, read-only root filesystem, a small temporary filesystem, dropped Linux
capabilities, `no-new-privileges`, and limits for memory, CPU, PIDs, output, and
wall-clock time. Only the request's source directory is mounted read-only. A
preflight policy blocks APIs for files, networking, processes, environment
variables, reflection, native interop, unsafe code, and dynamic dispatch. The
container is forcibly removed and its temporary source directory cleaned after
every result.

Compilation requires the **.NET SDK**, not only the .NET runtime. The local
default is `mcr.microsoft.com/dotnet/sdk:8.0`; pre-pull and pin an image digest
on a Docker-capable host. If the selected sandbox, SDK image, or remote service
is absent, the endpoint returns 503 and the module displays a compact,
non-blocking retry card.

`GET /api/practice/health` is authenticated for students and exposes only
`{ "available": boolean }`. It never returns image names, paths, credentials, or
host details. `POST /api/practice/run` uses 400 for source-policy/input rejection,
408 for a sandbox timeout, 429 for rate limiting, 500 for an unexpected API
error, and 503 when the execution capability cannot be reached.

## Verification

- `npm --prefix backend test` includes practice source-policy tests.
- `npm --prefix frontend run test:practice-content` audits all five modules and
  compiles every runnable worked example and Try It Yourself solution.
- Manually verify `GET /api/practice/health`, authenticated valid output, compiler error,
  `IndexOutOfRangeException`, infinite-loop termination, large-output termination,
  and blocked file/network/process attempts on a Docker-enabled host.

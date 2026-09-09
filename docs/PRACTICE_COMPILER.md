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

## Deployment and safety

The API host needs Docker and a locally available .NET SDK image. Configure the
`PRACTICE_*` values in `backend/.env.example`. Never replace the container with a
host `dotnet`, shell, or arbitrary command fallback.

Each request requires an active student account and is rate-limited per user.
Source is capped at 16 KB. The runner starts an ephemeral container with no
network, read-only root filesystem, a small temporary filesystem, dropped Linux
capabilities, `no-new-privileges`, and limits for memory, CPU, PIDs, output, and
wall-clock time. Only the request's source directory is mounted read-only. A
preflight policy blocks APIs for files, networking, processes, environment
variables, reflection, native interop, unsafe code, and dynamic dispatch. The
container is forcibly removed and its temporary source directory cleaned after
every result.

The default image is `mcr.microsoft.com/dotnet/sdk:8.0`. Pre-pull and pin an image
digest in production. If the container runtime or image is absent, the endpoint
returns 503 and the module displays a non-blocking message.

## Verification

- `npm --prefix backend test` includes practice source-policy tests.
- `npm --prefix frontend run test:practice-content` audits all five modules and
  compiles every runnable worked example and Try It Yourself solution.
- Manually verify authenticated valid output, compiler error,
  `IndexOutOfRangeException`, infinite-loop termination, large-output termination,
  and blocked file/network/process attempts on a Docker-enabled host.

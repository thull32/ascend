# 0005. Grade submissions on the server, in a WebAssembly sandbox

- Status: accepted
- Date: 2026-09-28
- Amends: [0003](0003-client-side-code-execution.md)

## Context

ADR 0003 ran learner code only in the browser and recorded whatever result the browser reported. That kept
runs free and instant, but every "solved" problem, the XP built on it and the progress the coach and roadmap
read were self-reported: one `POST /api/submissions` with `passed_count` equal to `total_count` marked any
problem solved. As progress feeds more of the product (roadmap, coach context, the dashboard), a number the
server cannot vouch for is a liability, and the fix only gets harder as the numbers are used more widely.

Running untrusted code on the server is the risk 0003 avoided. The question was how to contain it cheaply.

## Decision

The browser still runs the code for instant feedback. When a signed-in learner runs tests, the browser also
sends the code (and, for TypeScript, its type-stripped JavaScript) to the server, which runs it and records
**its own** verdict. Nothing the browser computed is stored.

The server runs code in WebAssembly (crate `ascend-grader`):

- **Runtimes.** CPython 3.14 for WASI (matching the browser's Pyodide) and QuickJS-ng for WASI, executed
  by Wasmtime with Cranelift. `scripts/grader-runtimes.sh` pins both by SHA-256; the image precompiles the
  Python standard library to bytecode at build time.
- **Isolation.** A WASI guest can only reach what the host grants. It gets stdin (the job), stdout and
  stderr (memory pipes with caps), a clock and random bytes, and for Python a read-only standard library.
  No network, environment variables, other files or processes. A fresh instance per run means nothing
  carries over between learners.
- **Limits.** CPU time by epoch interruption (the same budget the browser uses: the per-test limit times
  the number of tests, plus interpreter start-up), memory by a 256 MiB store limit, stack by an 8 MiB wasm
  stack on a dedicated thread, concurrency by a semaphore (half the cores, 1 to 4), and volume by a shared
  rate limit of 20 submissions a minute per session. A full queue answers 503 with `Retry-After`.
- **Comparison on the host.** The harness in the sandbox reports what the learner's function returned;
  the host compares with the expected values, using a Rust port of the browser's comparison rules. The
  expected values never enter the sandbox. Code that tampers with the harness from inside can only report
  return values of its choosing, which it could do anyway by returning them.

## Alternatives considered

- **Containers or microVMs per run (gVisor, Firecracker, Judge0).** Stronger isolation for arbitrary
  binaries and any language, but they need privileges or nested virtualisation the platform does not
  offer, plus images per language and seconds of start-up. Wasm needs none of that and starts in about
  0.1 s (Python) or 0.02 s (JavaScript).
- **Interpreters embedded natively (RustPython, rquickjs, Boa).** No separate runtime files, but a memory
  safety bug in a C interpreter would then be a bug in the server process. In Wasm it is contained by the
  sandbox.
- **Subprocesses of native Python and Node with rlimits.** Would inherit the server's environment (the
  database URL, the API key) and network unless carefully stripped, and namespaces are not available.
- **Signing browser results.** Anything the browser can sign, a learner can sign.

## Consequences

- Every recorded result is one the server computed. The browser's verdict is shown first; the server's
  replaces it, and the UI says so when they disagree (a time limit hit only on the server, say).
- Each graded run costs server CPU: about 0.1 s of start-up plus the learner's code. QuickJS is an
  interpreter, so tight JavaScript loops run several times slower than in the browser's V8; tests use
  small inputs, and every problem's reference solution is graded in CI (`grading_parity`).
- The image grows by about 55 MB (the runtimes and the precompiled standard library), and boot compiles
  the runtimes (about half a second on a many-core machine).
- Python on the server has the standard library only. Exercises that need NumPy or other packages cannot
  be graded; none exist, and adding one would need its package built for WASI.
- Hidden tests are graded like the others. They are in the page and the public repository, so they are
  not secret; they are "hidden" to encourage thinking about edge cases, not for security.

## Revisit when

- An exercise needs a package without a WASI build.
- Grading load outgrows a few cores: move grading to its own service behind the same `Grader` interface.

# 0003. Run learner code in the browser, not on the server

- Status: accepted
- Date: 2026-09-26

## Context

Every lesson and problem lets the learner run code against tests. Server-side execution means sandboxing
arbitrary code (containers, gVisor or Firecracker), queueing, per-language images, and real money per run,
on a free product.

## Decision

Run JavaScript/TypeScript and Python (Pyodide, CPython compiled to WebAssembly) in dedicated Web Workers.
Network APIs are removed inside the JS worker, execution has a wall-clock budget enforced by terminating the
worker, and results are posted to the API, which validates test counts against the target.

## Alternatives considered

- **Server-side sandbox (Judge0-style).** Authoritative results and more languages, at a large operational
  and security cost. Not needed: this is practice, not a contest, so a learner who fakes a result only
  cheats themselves.
- **Only JavaScript.** Python is the most common interview language; excluding it would hurt the core user.

## Consequences

- Zero marginal cost per run; works offline after first load; instant feedback.
- Python's first run downloads the runtime (~10 MB, then cached).
- Submissions are self-reported. Leaderboards or competitive features would need server-side verification.

## Revisit when

- Competitive or credentialing features appear (leaderboards, certificates):
  results must then be verified server-side in a sandbox.
- Learners need languages without a mature WebAssembly runtime.

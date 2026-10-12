---
lesson: testing-the-system
source: 5036d204c9b84432
---
## 1

Why do Ascend's API tests run against a real Postgres database, rather than a mocked repository layer?

A, SeaORM's entities cannot be mocked, so a real database is the only option available. B, the behaviours worth testing are database semantics, which a mock would only restate. C, mocked repositories are slower than a local Postgres once many tests run in parallel. D, GitHub Actions offers no way to run tests without a Postgres service container.

[think]

The answer is B: the behaviours worth testing are database semantics, which a mock would only restate.

Upserts with on-conflict clauses, partial unique indexes, cascades, and what actually lands in a column are all properties of Postgres. A mock encodes your belief about the database; a real one checks it. The session test that searches the sessions table for the raw token is a good example: no mock could prove that the raw token never reaches the table.

## 2

A reference solution's grow loop allocates a larger array on every pass, and never terminates. The old validator ran it on the host, with a 2 gibibyte address-space limit and a 10 second alarm. Which limit stopped it then, and what stops it now?

A, the kernel's out-of-memory killer then, and the grader's 20 second queue timeout now. B, the alarm then, and the grader's epoch deadline now. C, the recursion limit then, and the grader's 8 mebibyte WebAssembly stack now. D, the address-space limit then, as a memory error, and the grader's 256 mebibyte memory cap now.

[think]

The answer is D: the address-space limit then, as a memory error, and the grader's 256 mebibyte memory cap now.

A doubling allocation reaches gigabytes in milliseconds, so a ten-second alarm or an epoch deadline is far too late. The address-space limit turned the allocation into an exception in the offending process, instead of letting the out-of-memory killer pick a victim. Now the reference solutions run in the server's WebAssembly sandbox, where each run's memory is capped at 256 mebibytes, so the growth fails inside the guest. The deadline is for loops that spin without allocating, and this loop is not recursive.

## 3

Twenty validators run in parallel, each with a 2 gibibyte address-space limit, on a machine with 16 gibibytes of RAM. Is the machine safe?

A, yes: each process is individually limited, so the total is bounded too. B, no: limits do not compose, so bound the job with a cgroup or a queue. C, yes: the kernel shares memory pages between the Python processes anyway. D, no: the address-space limit has no effect on a process running Python code.

[think]

The answer is B: no, because limits do not compose, so bound the job with a cgroup or a queue.

The limit bounds one address space, so twenty of them may still demand 40 gibibytes together. The fix at the machine level is to bound the whole job, which is why the authoring rules say to run one validation process at a time, and to use the safe Python wrapper for anything ad hoc. The limit works fine under Python; that is how a memory error arises.

## 4

A problem file has the hint line "use a map, colon, value to index", without quotes. What does each loader do?

A, both loaders read it as a string, since plain YAML strings need no quotes at all. B, the Rust loader turns the mapping into a string, and carries on loading. C, Python's safe load gives a dictionary for that hint, and the typed Rust loader rejects it. D, both loaders reject the file, because the line is not valid YAML at all.

[think]

The answer is C: Python's safe load gives a dictionary for that hint, and the typed Rust loader rejects it.

An unquoted colon followed by a space makes a mapping. It is valid YAML, but not the shape you meant, so only a loader that knows the expected type can reject it: in Rust, hints are a list of strings. The problem validator also checks for it explicitly, and tells the author to quote the hint.

## 5

The live AI Playwright suite costs tokens, and is not run in CI. What is the best way to keep its value?

A, delete it, because a model's output is nondeterministic and cannot be tested. B, schedule it with a small budget, and put a stream test against a stub server in CI. C, make it assert the exact reply text, so that any regression is caught at once. D, run it on every push with retries enabled, so that flaky failures stay quiet.

[think]

The answer is B: schedule it with a small budget, and put a stream test against a stub server in CI.

It found a real remount bug, and the per-IP throttling of learners behind one NAT, so deleting it throws away proven value. Exact-text assertions would make it flaky, and retries would hide the flakiness. A stub server moves the deterministic part, persistence and settlement after a hang-up, into every CI run, which the API's AI tests now do.

## 6

A concurrency test fires 30 budget reservations at once, against a limit of 10. Which assertion makes it a good test?

A, exactly 10 succeed, and the stored count is 10, whichever ten they are. B, at least one reservation is refused, which shows the limit is enforced. C, the first 10 tasks spawned succeed, and the last 20 are all refused. D, all 30 finish within one second, which shows no request deadlocked.

[think]

The answer is A: exactly 10 succeed, and the stored count is 10, whichever ten they are.

Asserting the invariant, exactly ten and a stored count of ten, holds under any scheduling order, so the test is deterministic, and it fails against a check-then-act version that grants more than ten. Spawn order does not decide which tasks win the row lock, so naming the winners would be flaky, and one refusal or a time bound would pass against the broken code too.

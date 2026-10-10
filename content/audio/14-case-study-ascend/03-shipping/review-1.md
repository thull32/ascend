---
review: shipping
source: b8d0256aa95a5828
---
## Introduction

Twelve questions from the shipping module. Answer out loud before the answer comes.

They run in the order of the lessons: four on testing the system, four on build and deploy, and four on what would change at scale. Each has four options, A to D, then a few seconds for you to commit to one.

## Question 1

Why do Ascend's API tests run against a real PostgreSQL rather than a mocked repository layer?

A, the ORM's entities cannot be mocked, so a real database is the only option available. B, the behaviours worth testing are database semantics that a mock would only restate. C, mocked repositories are slower than a local Postgres once many tests run in parallel. D, GitHub Actions offers no way to run tests without a Postgres service container.

[think]

The answer is B: the behaviours worth testing are database semantics that a mock would only restate.

Conflict-handling upserts, partial unique indexes, cascades and what actually lands in a column are properties of Postgres. A mock encodes your belief about the database; a real one checks it. The session test is the example: it queries the sessions table for the raw token, and no mock could prove the raw token never reaches it.

## Question 2

A reference solution's grow loop allocates a larger array on every pass and never terminates. The old validator ran it on the host with a 2-gigabyte address-space limit and a 10-second alarm. Which limit stopped it then, and what stops it now?

A, the kernel's out-of-memory killer then, and the grader's 20-second queue timeout now. B, the alarm then, and the grader's epoch deadline now. C, the recursion limit then, and the grader's 8-megabyte stack now. D, the address-space limit then, as a memory error, and the grader's 256-megabyte memory cap now.

[think]

The answer is D: the address-space limit then, and the grader's 256-megabyte memory cap now.

A doubling allocation reaches gigabytes in milliseconds, so a ten-second alarm or a deadline is far too late. The address-space limit turned the allocation into an exception in the offending process, instead of letting the out-of-memory killer pick a victim. Now the reference solutions run in the server's WebAssembly sandbox, where each run is capped at 256 megabytes, so the growth fails inside the guest. The deadline is for loops that spin without allocating.

## Question 3

A problem file has a hint line, "Use a map, colon, value to index", without quotes. What does each loader do?

A, both loaders read it as a string, since plain YAML strings need no quotes at all. B, the Rust loader turns the mapping into a string and carries on loading. C, Python's safe load gives a dictionary for that hint, and the typed Rust loader rejects it. D, both loaders reject the file, because the line is not valid YAML at all.

[think]

The answer is C: Python's loader gives a dictionary, and the typed Rust loader rejects it.

An unquoted colon followed by a space makes a mapping. It is valid YAML, just not the shape you meant, so only a loader that knows the expected type can reject it: in Rust, hints are a list of strings. The problem validator also checks for it explicitly and tells the author to quote the hint.

## Question 4

A concurrency test fires 30 budget reservations at once against a limit of 10. Which assertion makes it a good test?

A, exactly 10 succeed and the stored count is 10, whichever ten they are. B, at least one reservation is refused, which shows the limit is enforced. C, the first 10 tasks spawned succeed and the last 20 are all refused. D, all 30 finish within one second, which shows no request deadlocked.

[think]

The answer is A: exactly 10 succeed and the stored count is 10, whichever ten they are.

Asserting the invariant holds under any scheduling order, so the test is deterministic, and it fails against a check-then-act version that grants more than ten. Spawn order does not decide which tasks win the row lock, so naming the winners would be flaky. One refusal, or a time bound, would pass against the broken code too.

## Question 5

Which change causes the cargo-chef cook layer, the one that compiles dependencies, to rebuild all of them?

A, adding a crate to the Cargo manifest, which changes the dependency recipe. B, changing a React component, which changes the frontend embedded in the binary. C, editing a lesson in the content folder, which the binary embeds when it compiles. D, editing a Rust source file in the API crate, such as a route handler.

[think]

The answer is A: adding a crate, which changes the dependency recipe.

The cook layer's only input is the recipe, derived from the manifests and the lockfile. Source, content and frontend changes invalidate only the later layers that compile the workspace crates, which is why a content-only deploy takes about a minute.

## Question 6

A release renames a column in its migration. The new version passes readiness, then starts returning errors, and you roll back to the previous deployment. What happens?

A, nothing, because the ORM maps the old and new column names to each other. B, Railway refuses to roll back any deployment whose migration succeeded. C, the old binary boots, skips migrating, then fails every query naming the old column. D, the rollback restores the old schema automatically before starting.

[think]

The answer is C: the old binary boots, skips migrating, then fails every query naming the old column.

Migrations ran forward on boot, and nothing runs them backward, so a rollback redeploys code, not schema. The old binary sees a schema ahead of it and starts without migrating, and its queries then name a column that no longer exists. Rollback safety needs expand and contract: add the new column, move reads and writes, and remove the old one in a later release.

## Question 7

The rate limiter originally used the first X-Forwarded-For entry as the client's address. What could an attacker do?

A, send a new fake address each time, and get a fresh bucket every time. B, only slow down their own requests, since the limiter keys on them. C, nothing, because Railway strips the header before the app sees it. D, bypass the CSRF check by claiming the site's own origin in that same header.

[think]

The answer is A: send a new fake address each time, and get a fresh bucket every time.

Proxies append to that header, so its first entry is whatever the client sent. Keying a limiter on it lets the client choose its own key, which made every address-keyed limit, login included, meaningless. Trusting only a header the edge overwrites, configured explicitly, fixes it.

## Question 8

Readiness returns 200 when a trivial database query succeeds. Which bad deploy does it let through?

A, a migration that fails part-way through and exits the process. B, a deploy whose Anthropic API key has been revoked. C, a container that cannot reach Postgres over the network. D, a binary that panics during boot, before it binds its port.

[think]

The answer is B: a deploy whose API key has been revoked.

A failing migration or a boot panic never binds the port, and an unreachable database makes readiness return 503. The AI field only says a key is configured, not that it works, so a revoked key goes live. A probe of the key at boot would catch it without calling a paid API on every health poll.

## Question 9

A learner has 1,500 output tokens left today and sends a coach turn whose maximum output is 4,000 tokens. What does the budget's reserve step do?

A, holds nothing now, and charges what the call used when it ends. B, holds 1,500 tokens and lowers the call's maximum output to 1,500. C, refuses, because the call's maximum output is larger than what is left. D, holds 4,000 tokens, letting the day end 2,500 over its limit.

[think]

The answer is B: it holds 1,500 tokens and lowers the call's maximum output to 1,500.

A call may start if at least a quarter of its maximum remains, here 1,000 tokens, and 1,500 do. So it holds the smaller of the maximum and what is left, and lowers the request to match: the reply cannot outspend the day. Holding the full 4,000 was the old overshoot, and charging only afterwards was the design holds replaced. With 900 left, it would refuse rather than start a reply it would have to cut off.

## Question 10

Ascend adds a second replica with no other change. What happens to rate limiting and to the AI budgets?

A, the budgets double, because each replica reads its own copy of the usage table. B, nothing changes at all, because every bucket already lives in Postgres. C, every limit doubles, because each replica keeps its own in-memory buckets. D, only the loose per-address general bucket doubles; the security limits and budgets hold.

[think]

The answer is D: only the loose general bucket doubles; the security limits and budgets hold.

The security-relevant buckets live in Postgres, checked by one conditional upsert, and a test proves two instances share them. The 1,200-a-minute general bucket stays in process memory on purpose, so it does multiply. Budgets live in the usage table and are held under its row lock, so they are shared too. Option C was true before the shared limiter.

## Question 11

Ascend's shared limiter keeps its state in Postgres and answers 503 when Postgres is unreachable. Why is failing closed acceptable here, when it would not be for a Redis-backed limiter?

A, the requests it guards need Postgres anyway, so refusing them costs no extra availability. B, Postgres never becomes unreachable, since the platform restarts it within seconds. C, failing open would leak the rate-limit table, because it is an unlogged table. D, a 503 tells browsers to retry at once, so learners never notice the refusal.

[think]

The answer is A: the requests it guards need Postgres anyway, so refusing them costs no extra availability.

Sign-up, login, model calls and grading all read or write the database, so when it is down they fail regardless, and refusing early adds no outage. A Redis limiter in front of requests that do not need Redis would turn a cache outage into a site outage, which is why the review had proposed falling back to local shares. Unlogged only means the table skips the write-ahead log.

## Question 12

The first review priced verifying every run at about 90 busy CPUs at peak, and recommended verifying only credited submissions. Why could the later decision grade every signed-in run instead?

A, Railway bills grading CPU separately, so it no longer counts toward capacity. B, the server skips the hidden tests, which were most of the grading work. C, a WebAssembly run costs about a tenth of the CPU-second the estimate assumed. D, browsers now send only failing runs, so the server grades far fewer of them.

[think]

The answer is C: a WebAssembly run costs about a tenth of the CPU-second the estimate assumed.

The estimate assumed about one CPU-second per run in a container sandbox. A WebAssembly Python starts in about a tenth of a second, JavaScript in about a fiftieth, so 87 runs a second at peak needs roughly 9 to 17 cores, a few replicas. The method, pricing both options, stayed the same; the unit price changed.

## Recap

Three ideas kept coming back. Test where the behaviour lives and assert invariants: database semantics against a real database, types at the loader's boundary, races as exactly-ten-of-thirty. Know what each gate actually proves: readiness proves the process can take traffic, not that the release is good, and rollback runs old code on a new schema. And decide limits and failure modes deliberately: a memory cap and a deadline catch different runaways, a limiter's store decides whether failing closed is free, and a per-user fuse is not a bill.

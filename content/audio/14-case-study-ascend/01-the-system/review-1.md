---
review: the-system
source: bac795136f632010
---
## Introduction

Twelve questions from the system module, the case study of Ascend itself. Answer out loud before the answer comes.

They run in the order of the lessons: reading the repository, the anatomy of a request, the content engine, authentication and security, and data and migrations. Each has four options, A to D, then a few seconds for you to commit to one.

## Question 1

Cargo shows that the core crate transitively depends on the http and hyper crates, through reqwest. What is the best assessment against the rule that core must not depend on HTTP types?

A, tolerable: the rule bans inbound HTTP types, and the outbound client can move behind a trait later. B, a violation that has to be fixed by removing reqwest from core before the next release. C, fine, because the rule was only ever meant to apply to the React front end. D, irrelevant, because transitive dependencies never affect how a crate is designed or built.

[think]

The answer is A: tolerable, because the rule bans inbound HTTP types, and the outbound client can move behind a trait.

The boundary exists so domain logic never sees requests, extractors or status codes. An outbound AI client is an adapter that happens to live in the domain crate, acceptable at this size and worth isolating later. Removing it now treats a shortcut as an emergency, and saying transitive dependencies never matter ignores compile time, supply chain, and the day someone imports HTTP types directly.

## Question 2

The entry point runs database migrations and then loads the curriculum. Why would a senior reviewer suggest swapping them?

A, migrations run noticeably faster once the curriculum is already in memory. B, loading content is pure and cheap, so it should fail before any schema change. C, Railway's readiness probe expects the content to be loaded before any migration runs. D, the curriculum loader needs the new schema before it can parse lessons.

[think]

The answer is B: loading content is pure and cheap, so it should fail before any schema change.

Order boot steps so that side-effect-free validation happens before irreversible work. Content never reads the database, so nothing depends on the current order. The swap only removes the failure where a process applies a migration and then crashes on a broken content directory.

## Question 3

Ascend scales out to three replicas. The password-attempt limit lives in Postgres, while the general bucket of 1,200 requests a minute stays in each process. What changes for a client whose requests are spread across all three?

A, password attempts triple, and the general allowance stays the same for every client. B, password attempts stay at ten a minute, and the general allowance roughly triples. C, both stay the same, since every replica reads its limits from the same database. D, both limits roughly triple, since each replica keeps its own copy of the state.

[think]

The answer is B: password attempts stay at ten a minute, and the general allowance roughly triples.

The password bucket is one row per account in a shared table, so every replica charges the same allowance, and a test pins it with two app instances over one database. The general bucket is state in each process, so three replicas give a client up to three times 1,200 a minute. That is accepted on purpose: it only stops floods of cheap reads, and a database write on every request would cost more than it protects.

## Question 4

The general rate limiter rejects a request with a 429. Which statement about that response is true in Ascend's stack?

A, it carries a request ID and security headers and is logged, because those layers are outside the limiter. B, it skips compression and the security headers, because a rejection bypasses the router. C, it is not logged, because the trace layer only records responses that succeeded. D, it has no request ID, because the handler that would have set one never ran.

[think]

The answer is A: it carries a request ID and security headers and is logged, because those layers are outside.

A rejection short-circuits only the layers inside the limiter: the CSRF check, the extractors and the handler. Everything outside it, including the request-ID layers, the tracer, compression and security headers, still processes the response on the way out. The request ID is set by middleware, not by handlers.

## Question 5

Why does the Anthropic client use a 180-second timeout when the global timeout layer is 240 seconds?

A, it is an accident, and the two numbers should be made to match. B, Railway requires every request to finish in under 200 seconds. C, the client timeout only applies to streaming responses anyway. D, the inner deadline fires first, so the specific AI error wins out.

[think]

The answer is D: the inner deadline fires first, so the specific AI error wins out.

When the inner deadline fires first, the domain can classify the failure and return an upstream AI error, a 502 with a clear code, instead of the generic 503 with an empty body. If the outer one fired first, the domain would never know. The global layer is a backstop. Inner deadlines shorter than outer ones is the general rule.

## Question 6

Before a fix, a deploy that added a field to the lesson JSON but changed no Markdown left returning browsers without the field. Why, and what closed the gap?

A, Railway kept serving the old container for an hour, and gating on the readiness probe fixed it. B, the ETag hashed content only, so revalidation returned 304, and adding the build ID fixed it. C, a lesson cache in Postgres went stale, and clearing that table on every boot fixed it. D, index.html was cached for a year, so the old app kept running, and serving it no-cache fixed it.

[think]

The answer is B: the ETag hashed content only, so revalidation returned 304, and adding the build ID fixed it.

The browser revalidated correctly, but the validator it compared against did not change, because it was derived from content alone. A cache key must include everything the response depends on. index.html was already served no-cache, and there is no lesson cache in Postgres.

## Question 7

A lesson exercise marks two of its tests as hidden. What does hidden mean in Ascend?

A, the tests only run in CI, against the reference solution stored in the lesson file. B, the tests never leave the server, which runs them after each submission. C, the browser receives and runs them, but they are not shown before you submit. D, the tests travel encrypted in the payload and are decrypted by the worker.

[think]

The answer is C: the browser receives and runs them, but they are not shown before you submit.

The browser runs every test for instant feedback, so it receives them all, expected values included. The server does grade the same tests again in its sandbox and records only its own verdict, but the tests still leave it, in the page and in the repository. Encryption would not help, because the worker must decrypt them to run them.

## Question 8

Ascend stores the SHA-256 of each session token without a salt, yet uses slow, salted Argon2id for passwords. Why is that consistent?

A, session tokens are less valuable to an attacker than passwords are. B, SHA-256 is slower than Argon2id once the token is 43 characters long. C, salts matter only for columns that serve as a table's primary key. D, tokens hold 256 random bits, so there is no dictionary to try.

[think]

The answer is D: tokens hold 256 random bits, so there is no dictionary to try.

Password hashing is slow and salted because attackers guess likely passwords from a dictionary. A random 256-bit token cannot be guessed, so the only goal of hashing it is that a leaked table cannot be replayed as a login, which any preimage-resistant hash achieves. SHA-256 is far faster than Argon2id, which is fine here.

## Question 9

A malicious page auto-submits an HTML form that posts to the logout endpoint, which takes no request body. Which defence does not help here?

A, the required X-Requested-With header, which a plain form cannot set. B, the Origin check, rejecting a request that claims to come from the evil site. C, SameSite Lax, withholding the session cookie on the cross-site POST. D, the JSON extractor's demand for a JSON content type.

[think]

The answer is D: the JSON extractor's demand for a JSON content type.

Logout has no JSON extractor, so the content-type requirement never applies to it. That is exactly why the middleware enforces an explicit rule for every mutating route instead of relying on body parsing. The other three are independent layers, and each one stops the forged request.

## Question 10

An early budget check read today's usage, compared it with the limit in Rust, then ran an atomic increment. Why could 30 concurrent requests exceed a limit of 10, and what fixed it?

A, Postgres drops some concurrent upserts, and a unique index on the user and day fixed it. B, the limit was cached in each process, and reading it from the environment fixed it. C, the increment was not atomic, and wrapping it in a transaction with a retry loop fixed it. D, all of them read the same under-limit count, and one conditional upsert that returns the row fixed it.

[think]

The answer is D: all of them read the same under-limit count, and one conditional upsert fixed it.

Each statement was atomic, but the check and the act were separate, so all 30 could pass the check before any increment landed. Folding the condition into the upsert's where clause made the database decide and increment in one step, and a concurrent test asserting exactly 10 successes proves it. Today's budget holds get the same guarantee from a select for update. A transaction alone, under read committed and without the lock, would not have helped.

## Question 11

Alice deletes her account. Bob had replied to one of Alice's comments. What happens to the two comments?

A, Alice's comment is deleted, and Bob's reply becomes a top-level comment on the lesson. B, the deletion fails with a foreign-key violation until Alice deletes her comments. C, both stay, and Alice's loses its author link and is shown as written by a deleted user. D, both are deleted, because Alice's comment cascades from users and Bob's from its parent.

[think]

The answer is C: both stay, and Alice's is shown as written by a deleted user.

The comment's author column is now set to null when the user is deleted, so Alice's comment survives without an author and Bob's reply keeps its parent. Before that migration both foreign keys cascaded, so an account deletion would have removed Bob's words too. The account-deletion endpoint and the set-null change shipped together for exactly that reason.

## Question 12

Release N plus 1 renames a column in its migration and updates the code to use the new name. Railway rolls it out with a health-gated deploy. What breaks?

A, only the down migration breaks, and production never runs down migrations. B, the old code, still serving during the switch, queries a column that is gone. C, nothing, because each migration runs inside its own transaction. D, the new deployment cannot start, because the old one still holds a table lock.

[think]

The answer is B: the old code, still serving during the switch, queries a column that is gone.

The migration commits before the new code takes traffic, while the old code is still serving with queries that name the old column, so they fail in that window. The transaction makes the migration atomic, not compatible. Expand and contract avoids it: add the new column and write both, switch reads in the next release, and drop the old column in the one after.

## Recap

Three ideas kept coming back. Order is design: boot steps, middleware layers, extractors and deadlines all protect something by where they sit, so cheap and pure checks go first and inner deadlines are shorter than outer ones. State shared across replicas must live in a shared store, and the check and the act must be one statement or run under a lock. And a guarantee is only as good as what derives it: an ETag must cover code as well as content, hidden tests are not secret, and a migration must be compatible with the release still serving.

---
lesson: tour-of-the-repository
source: 71c2b02751de40e1
---
## 1

You have one hour with an unfamiliar service before a design review. Which reading order produces the most reliable mental model?

A, open source files at random until the overall structure starts to emerge. B, tests and CI first, then the docs, then the entry point and the router. C, only the ADRs, since between them they record every decision the team made. D, docs and ADRs, then manifests, the entry point, the router, one slice, and the tests last.

[think]

The answer is D: docs and ADRs, then manifests, the entry point, the router, one slice, and the tests last.

Reading intent first turns every documented claim into a question, and reading the tests and CI last tells you which claims are actually enforced. Starting with tests is not wrong, but without the intent you cannot tell a deliberate behaviour from an accident. ADRs alone describe what someone decided, not what the code does today.

## 2

cargo tree shows that Ascend's core crate depends, through reqwest, on the http and hyper crates. What is the best assessment against the rule that core must not depend on HTTP types?

A, tolerable: the rule bans inbound HTTP types, and the outbound client can move behind a trait. B, a violation that must be fixed by removing reqwest from core before the next release. C, fine, because the rule was only ever meant to apply to the React frontend. D, irrelevant, because transitive dependencies never affect how a crate is designed or built.

[think]

The answer is A: tolerable, because the rule bans inbound HTTP types, and the outbound client can move behind a trait.

The boundary exists so that domain logic never sees requests, extractors or status codes. An outbound AI client is an adapter that happens to live in the domain crate: acceptable at this size, and worth isolating later. Removing it immediately treats a shortcut as an emergency, and claiming transitive dependencies never matter ignores compile time, the supply chain, and the day someone imports HTTP types directly.

## 3

Ascend's main function runs the database migrations, and then loads the curriculum. Why would a senior reviewer suggest swapping them?

A, migrations run noticeably faster once the curriculum is already in memory. B, loading content is pure and cheap, so it should fail before any schema change. C, Railway's readiness probe expects the content to be loaded before any migration runs. D, the curriculum loader needs the new schema before it can parse lessons.

[think]

The answer is B: loading content is pure and cheap, so it should fail before any schema change.

Order boot steps so that validation without side effects happens before irreversible work. Content never reads the database, so nothing depends on the current order. The swap only removes the failure where a process applies a migration, and then crashes on a broken content directory.

## 4

ADR 1 says shipping the single-page app inside the API binary avoids drift between front end and back end. In which situation does skew still occur?

A, only when the content version changes, and the ETag forces every page to reload. B, only while Postgres restarts, and the API serves a cached copy of the schema. C, a tab opened before a deploy keeps running the old JavaScript against the new API. D, never, because one artifact always ships the app and the API as one version.

[think]

The answer is C: a tab opened before a deploy keeps running the old JavaScript against the new API.

The artifact is atomic, but browsers are not. The index page is served with no caching, so a reload picks up the new bundle, but an open tab keeps the old code in memory. API changes must stay backward compatible for at least one release; a single artifact does not remove that duty.

## 5

Ascend scales out to three replicas. The password attempt limit lives in Postgres, while the general bucket of 1,200 requests a minute stays in each process. What changes for a client whose requests are spread across all three?

A, password attempts triple, and the general allowance stays the same. B, password attempts stay at ten a minute, and the general allowance roughly triples. C, both stay the same, since every replica reads its limits from the same database. D, both limits roughly triple, since each replica keeps its own copy of the state.

[think]

The answer is B: password attempts stay at ten a minute, and the general allowance roughly triples.

The password bucket is one GCRA row per account in a shared table, so every replica charges the same allowance, and a test with two app instances over one database pins that. The general bucket is state in each process, so three replicas give a client up to three times 1,200 a minute. That is accepted on purpose: it only stops floods of cheap reads, and a database write on every request would cost more than it protects.

## 6

The security headers module once said that the code runners' Web Workers get a separate, stricter Content Security Policy. Reading the code, you find that every response, worker scripts included, gets the same policy. What is the most useful response?

A, trust the code, fix the comment, and decide whether a stricter worker policy is worth building. B, assume browsers give workers a stricter default policy, so the comment is effectively right. C, leave it alone, since comments always go stale, and readers should only ever trust the code. D, delete every comment in the file, so that none of them can drift again.

[think]

The answer is A: trust the code, fix the comment, and decide whether a stricter worker policy is worth building.

Comments are claims, and the code is the evidence. Correcting the comment keeps the next reader from believing in a defence that does not exist, and asking whether the promised policy is worth building turns a wording problem into a design decision. Browsers give a worker the policy sent with its own script, which here is the same one every page gets.

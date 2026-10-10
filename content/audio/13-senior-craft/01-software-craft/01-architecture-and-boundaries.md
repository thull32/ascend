---
lesson: architecture-and-boundaries
source: 7e2b2eb1f39f7fae
fit: great
desk:
  - "The login service and handler code, port versus adapter"
  - "The CSRF refactor table and the before-and-after middleware code"
  - "The full middleware stack in app.rs, read outermost first"
  - "The cargo tree output and the compiler error that enforces the boundary"
  - "Exercise: write an architecture fitness check"
---
## Introduction

Open a three-year-old service and find the login handler. In 150 lines it parses JSON, runs a SQL query, verifies a password, picks an error message, mints a token, writes it to the database, formats a cookie and chooses a status code. It works. Then, in the same quarter, product wants a command-line tool that creates accounts in bulk, the security team wants the password hashing parameters changed, and the web framework ships a major version with a new request type.

Each change touches that same function. Each needs the whole HTTP stack and a database to test. And each reviewer has to understand everything to approve anything.

Architecture is the set of decisions that make those changes cheap, and its main tool is the boundary: a line in the code that says which concepts may cross, and in which direction. Four ideas, then. Where to draw a boundary and what it costs. Which way the dependencies must point. How this repository draws its lines, including where it deliberately does not. And why the order of your middleware is architecture too.

## Where change comes from

A boundary is a place where the vocabulary changes. On one side you talk about requests, headers, status codes and cookies. On the other you talk about users, sessions, lessons and progress. Code that speaks both vocabularies at once is where change hurts, because a change to either one lands there.

Every boundary has a price. You write mapping code, from an HTTP body to an input type, from a domain error to a status code. You add an indirection that a new reader has to follow. Sometimes you duplicate a type on each side. So "add more layers" is not the senior answer. The senior answer starts from a question: where does change come from, and which side of the line should absorb it?

Business rules, like who may delete a comment or when a session expires, change monthly, and should be isolated from frameworks, transport and storage. Transport, REST today and a queue consumer tomorrow, changes yearly. Framework versions change yearly, and painfully. Vendors, like an AI provider or a payment gateway, change unpredictably.

And storage? It changes rarely, and very expensively, and it is usually not worth isolating fully. Hiding the database behind an interface "in case we switch to Mongo" is the most common over-engineered boundary. The switch almost never happens, and the abstraction leaks transactions, locking and query shapes anyway.

## Dependency direction and the hexagon

Layers only help if the arrows point the right way. Whatever name you know it by, clean architecture, onion, hexagonal, the rule is the same: source-code dependencies point toward policy and away from mechanism. The domain may not import the web framework. The web framework's adapter imports the domain.

The trick that makes this possible is dependency inversion. When the domain needs something from the outside world, say to look up a user, it declares an interface in its own vocabulary, and the outer layer implements it. In the lesson's example, an auth service takes a user store, a session store and a password hasher. Its login method finds the user, verifies the password, and returns the user and a new session. No HTTP, no SQL. A thin handler parses the body, calls login, and turns the result into a cookie or a 422.

Now the unit test for "a wrong password is rejected" builds the service with an in-memory user store and never starts a server. The command-line tool calls login directly. And the framework upgrade touches the handler and nothing else.

Alistair Cockburn's hexagonal architecture names the pieces. The application core sits in the middle. It exposes driving ports, the use cases like login or mark lesson complete. It declares driven ports, the things it needs, like storage, a clock or an LLM. Adapters plug into ports. Driving adapters turn a transport into use-case calls: an HTTP router, a command-line tool, a test. Driven adapters implement the needs: a Postgres repository, an HTTP client for a vendor.

What it buys: fast tests with fakes, several entry points sharing one set of rules, and vendor swaps that stay local. What it costs: an interface per driven dependency, mapping code, and the discipline to keep framework types out of the core. It pays for itself when the domain is rich and long-lived. Over a thin layer of create, read, update and delete on one table, it is overhead, and a test against a real database is both simpler and more honest.

## A hard boundary and a soft one

Ascend's backend is two main Rust crates with one hard boundary between them: a core crate holding the domain, and an api crate that is a thin adapter mapping HTTP to the core's services and back. The rule is written down, but a document does not enforce it. The build graph does. The core crate's manifest does not list Axum, Tower or the http crate as dependencies, so a line in core that imports Axum fails to compile. That is the cheapest possible fitness function: the compiler runs it on every build.

Here is a subtle point the lesson checks. The http crate is actually in core's dependency graph, pulled in by the HTTP client library, reqwest. It is compiled into every build. Can core still import it?

[pause]

No. Cargo hands the compiler only the crates you declare as direct dependencies. Everything else is compiled and linked, but cannot be named. So the architectural change would be a one-line diff to core's manifest, which no reviewer misses. In other ecosystems you need a tool for the same guarantee: import-linter in Python, ArchUnit on the JVM, dependency-cruiser in JavaScript.

Follow a login through it. The handler is almost entirely translation. The one step that is not is a throttle, ten password attempts per minute, answered with a 429 before the service runs. The quotas are edge policy in the api crate; the counting lives in core, in Postgres, so every replica charges one allowance. The core login just checks credentials, and returns the user and a session token with an expiry. It does not know what a cookie is. The api crate decides the token travels in an HTTP-only cookie. If a mobile client wanted a bearer token instead, only the adapter would change.

Now read the core honestly. It is not a pure hexagon. The auth service holds a concrete database connection, the entities are ORM models, the error type wraps database errors, and the AI client calls the network directly. There are no repository traits. Count the files: of core's 47 Rust files, none mentions Axum, Tower or http, and 24 mention SeaORM.

That is a defensible trade-off. The boundary that changes often, transport, is hard. The one that almost never changes, Postgres, is soft. The price is that service tests need a real database, which is exactly how the repository tests them. The weak spot is the coach, which cannot be tested deterministically without the network or a fake server. So if you were reviewing this, the proportionate ask is not "abstract everything". It is: put a port in front of the LLM client, because that is the dependency that is slow, costly, non-deterministic and most likely to be swapped.

## Moving a decision out of the framework

The CSRF check began inside a middleware function that needed the whole application state, the request and the next handler. A review found a bug: the fallback compared the Referer header by prefix, so a look-alike domain that merely started with the real origin passed. The fix changed the code in an order that keeps each step safe.

First, move the logic, unchanged and bug included, into a pure function that takes only the headers and the expected origin. Second, pin today's behaviour with tests, then add the look-alike case, which fails. The bug is now a red test. Third, fix it inside the pure function, comparing origins for equality. Fourth, the middleware shrinks to an adapter, and the existing integration test still passes.

CI measures the difference. The unit tests for the new function finished in effectively zero seconds. The 22 integration tests took about a second and a half, after a Postgres container that took 12 seconds to start. Each new tricky input now costs one line and microseconds.

The discipline generalises: move without changing behaviour, pin the behaviour with tests at the new seam, then change it.

## Middleware order is architecture

Request IDs, logging, timeouts, compression, security headers, CSRF and rate limits form their own layers, and their order is a design decision. In Axum, each layer call wraps everything added before it, so the last one you add is the outermost, and sees the request first. Each position has a reason.

The request ID must be set before tracing, because the span reads it from the headers. Swap the two, and every span records a dash. The timeout sits inside tracing, so a timed-out request still gets a span and a logged status.

The timeout is 240 seconds, deliberately above the AI client's own 180. Nested timeouts should shrink as you go inward, so the innermost call fails first with a specific error, instead of the outer layer killing it with a generic one. And when it fires, it returns 503, not 408. The first version used 408, Request Timeout, which tells the client that it was too slow. Here the server failed, and 503 is what retry logic and dashboards read as a server-side failure.

Rate limiting runs before CSRF, so a flood of forged requests still spends the attacker's budget, and the cheap check runs first. And unknown paths under the API return a JSON 404, while everything else serves the single-page app. Without that split, a typo in a client's API URL returns a 200 with HTML, and the failure surfaces far away as a JSON parse error.

## Transactions, modules and services

A database transaction is a boundary with a hard edge. Inside it, work is atomic. Outside, it is not. Ascend's coach streams a reply to the browser and then persists it; if the write fails, it logs it, and the user saw an answer the database never recorded. For a chat transcript that is acceptable, and the code chooses it knowingly.

For a payment or an event another team consumes, it is not. Writing a row and then publishing a message is a dual write: either can fail after the other succeeded. The fix is to write the message into an outbox table in the same transaction, and let a relay publish it. The guarantee becomes "at least once, eventually", and the consumer's idempotency is part of the contract.

Ascend is a single binary whose boundaries are crates and modules: a modular monolith. A function call cannot time out, a refactor across a boundary is one commit, and there is one thing to deploy. Network boundaries buy independent deployment and scaling, and cost you partial failure, serialisation, versioned contracts and distributed tracing.

So extract a service when a team or a scaling profile genuinely needs to move independently, along a module boundary already proven stable. Ascend's first extraction was grading, for isolation, since the grading service holds no database URL or AI key, and for its different, CPU-bound, bursty scaling profile. Because it was the same binary started with a flag, production later put grading back in-process by flipping one setting. A boundary you can cross in either direction with configuration is worth more than one that takes a project to undo.

## In the interview

A follow-up the lesson expects: how would you enforce "the domain must not import the web framework" in a Python monolith?

[pause]

Put the domain and the adapters in separate packages, declare a layers contract in import-linter, and run it in CI, so a forbidden import fails the build. State the reason beside the rule. The wrong answer is "code review", which erodes one exception at a time.

And another: after a refactor, every log line says the request ID is a dash. What happened? The layer order changed, so the tracing span is created before the request-ID layer sets the header. In Axum the last layer call runs first. Restore the order and add a test that inspects an emitted log line. Not "the UUID generator is broken".

## Recap

Five things to remember. Justify each boundary by where change comes from, and be able to name one you deliberately did not draw, usually the database. Dependencies point inward, and the rule should be enforced by the build, not a diagram. Refactor by moving first, pinning with tests, then changing. Middleware order is a design decision, and nested timeouts shrink inward. And default to a modular monolith, extracting services only along boundaries that have already proven stable.

At your desk: the login service and handler code, the CSRF refactor and its before-and-after middleware, the full middleware stack, the cargo tree output, and the fitness-check exercise.

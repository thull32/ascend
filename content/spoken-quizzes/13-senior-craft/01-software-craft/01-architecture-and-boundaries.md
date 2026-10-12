---
lesson: architecture-and-boundaries
source: 2bb3035e8bf0aab8
---
## 1

An Axum router adds a route for slash x with handler h, then calls layer with A, then calls layer with B. A request for slash x arrives. In what order does it pass through the layers?

A, A and B at once, then h. B, A first, then B, then h. C, B only, which replaced A. D, B first, then A, then h.

[think]

The answer is D: B first, then A, then h.

Each call to layer wraps everything added before it, so B wraps A, which wraps the route. The request meets the outermost layer, B, first. Tower's service builder reads top to bottom in the opposite sense, which is a common source of confusion when you switch between the two styles.

## 2

Ascend's core crate has no dependency on Axum or on the http crate. What is the main thing that buys?

A, core types can be exported as an OpenAPI schema without any extra HTTP annotations. B, the compiler keeps HTTP types out of the domain, so a command-line tool or a test can reuse it. C, requests run faster, because the domain no longer parses HTTP types on the hot path. D, the release binary shrinks, because the core crate compiles without any web framework.

[think]

The answer is B: the compiler keeps HTTP types out of the domain, so a command-line tool or a test can reuse it.

The build graph enforces the dependency rule on every compile: importing Axum in core simply does not compile. The same services can then be driven by a command-line tool, a worker or a test, with no HTTP server. Speed and binary size are essentially unchanged, because the api crate still links Axum into the same binary, and API documentation has nothing to do with it. The benefit is changeability.

## 3

In hexagonal terms, which of these is a driven, or outbound, adapter?

A, the Axum route handler for the login endpoint. B, the login use case inside the core crate. C, the HTTP client that calls the AI provider. D, a Playwright test that clicks the login button.

[think]

The answer is C: the HTTP client that calls the AI provider.

Driven adapters implement what the core needs from the outside world: storage, clocks, vendors. Route handlers and tests are driving adapters, which call into the core. And the use case is the core itself.

## 4

A handler inserts an order row and then publishes an "order placed" message to a broker. Occasionally the publish fails after the database commit. Which change makes the two effects consistent?

A, publish the message first and insert the order row after. B, insert an outbox row in the same transaction, and have a relay deliver it. C, wrap both calls in a try and catch that logs any failure. D, retry the failed publish three times with exponential backoff.

[think]

The answer is B: insert an outbox row in the same transaction, and have a relay deliver it.

Reordering or retrying only moves the window where one effect happened without the other; a crash between the two steps still loses one of them. The outbox puts both writes inside one database transaction, and the relay delivers the message afterwards at least once, so consumers must deduplicate. Logging the failure is an explicit decision to accept the loss, which is fine for a chat transcript but not for an order.

## 5

A reviewer proposes putting a repository interface in front of every SeaORM query in Ascend's core. When is that the wrong call?

A, when the schema has grown past ten tables and a dozen migrations. B, when a move to a second database engine is already planned for next year. C, never, because hexagonal design puts every dependency behind a port. D, when storage is one Postgres database the team already tests against directly.

[think]

The answer is D: when storage is one Postgres database the team already tests against directly.

Boundaries cost indirection and mapping code. Storage is the dependency least likely to be swapped, and fakes of a relational database hide exactly the behaviour you most need to test, transactions and constraints, so testing against the real Postgres is simpler and more honest. A planned engine move is the one case where that port would earn its keep, and hexagonal design does not demand a port for everything: one pays off first for slow, costly, non-deterministic dependencies, such as an LLM client. Table count is not the deciding factor.

## 6

The http crate appears in Ascend core's dependency graph, pulled in by reqwest. Can code in core import the header map type from http?

A, no: Cargo drops transitive crates from the build before linking. B, yes: every crate compiled into the graph can be imported from core. C, no: the Rust compiler can name only the crates Cargo passes as direct dependencies. D, yes, but only in test modules, which see every crate in the build.

[think]

The answer is C: no, the Rust compiler can name only the crates Cargo passes as direct dependencies.

Cargo gives the compiler an extern flag only for each direct dependency, so a transitive crate is compiled and linked but cannot be named. That is why the boundary is enforced by core's own manifest rather than by the whole graph. Transitive crates are not dropped, since reqwest needs http at run time, and test modules follow the same rule, plus their dev dependencies.

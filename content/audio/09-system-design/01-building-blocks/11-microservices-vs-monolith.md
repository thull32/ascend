---
lesson: microservices-vs-monolith
source: 94bcfd1a838c8a32
fit: great
desk:
  - "The boundary-check script that fails the build on a forbidden import"
  - "The table of writers and readers for the e-commerce split"
  - "The measured cost of a network hop, row by row"
  - "Exercise: find ownership violations and lockstep groups from table access"
---
## Introduction

A team of eight engineers ships a monolith. It deploys twice a day, has one database, and handles 2 thousand requests a second on four machines. Someone proposes splitting it into services, for scale. Eighteen months later there are 23 services, deploys need a coordination spreadsheet, a checkout request touches nine of them in sequence, the 99th percentile latency has tripled, and the on-call rotation has burned out two people. The system still handles 2 thousand requests a second.

Nothing about that story is unusual. Microservices solve one specific problem: too many people changing one codebase and one database for it to be deployed safely and independently. They do not solve traffic. A stateless monolith scales by running more copies. And services add costs you pay on every request and every deploy.

Four ideas, then. What the split is actually for, and the default you should reach for instead. What a service boundary really is. What a network hop costs, and how those costs multiply down a chain. And the distributed monolith: how one slow dependency takes down an endpoint that never called it.

## What the split is for

Go through the reasons people give. We need to scale: rarely true. Run more copies of the monolith. Splitting helps only when one component's scaling profile, say CPU-heavy video encoding or memory-heavy search, is so different that sharing machines wastes hardware. Deploys are risky: a split helps if the risk is unrelated teams' changes shipping together, and does nothing if the risk is missing tests. Blast radius: yes, if a bug in recommendations must not take down checkout, but only if the isolation is real, with separate processes, pools and databases.

And teams block each other. That one is the real reason. Independent deployability for independent teams.

Two stories show both directions. Netflix's move to services began with an outage: in 2008 a database corruption stopped it shipping DVDs for three days, and it decided to leave behind single points of failure. By 2016 it described the result as hundreds of microservices. Running the other way, Amazon's Prime Video team wrote in 2023 about moving a stream-monitoring service, which had been a chain of separately orchestrated steps passing video frames through storage, into a single process. The orchestrator charged per state transition, and it made several per second for every stream. The move cut their infrastructure cost by over 90 percent. Distribution is a cost you pay for organisational independence.

So the default is a modular monolith. One deployable unit with enforced internal boundaries: modules with public interfaces, no module touching another's tables, and the direction of dependencies checked by the build. You get most of the design benefit of services, ownership and explicit contracts, with none of the runtime cost. Calls are function calls, one transaction can span modules, and there is one deploy, one on-call and one set of dashboards.

Enforced means a failing build, not a wiki page. Shopify open-sourced a tool called Packwerk for exactly this in its Rails monolith, and the lesson writes the same idea in a short script: the orders module may import the payments module's public interface, but not its models or its database code. Then there is a simple test of whether a module is ready. If it could move to its own process by changing only its call sites from in-process to remote, it is well bounded. If extracting it means untangling shared tables, it is not ready to be a service.

## Boundaries are data ownership

Here is the definition to keep. A service boundary is a data ownership boundary. A service owns its tables. Nobody else reads or writes them. Others get the data through its interface or its published events. That rule is what makes independent deployment possible: the service can change its schema because nobody depends on it. And you enforce it where it cannot be bypassed, in the database, with one role per service and no grants on anyone else's tables.

Good boundaries follow what domain-driven design calls bounded contexts: concepts that change together, owned by one team. An order in checkout, in fulfilment and in accounting is three models with three lifecycles. Bad boundaries are drawn around technical layers, like a validation service, or around nouns everyone needs synchronously. A user service called by 40 other services at 99.9 percent availability caps every one of them at 99.9 percent for every request that needs it.

How do you find the boundaries in a real system? Not from a list of nouns, but from a table of who writes and who reads each table. In the lesson's e-commerce example, the finding is that the inventory table has two writers, fulfilment and checkout. A table needs one owner, so checkout becomes a caller of the inventory service's reserve operation, because it needs the answer now. And every query that used to join across the new boundary gets its own decision: keep a replicated copy in the consumer, fed by events, or compose two calls. Writing those decisions down is most of the design work of a split.

## What a hop costs

Moving a call across a process boundary adds serialisation, system calls and a network round trip. The lesson measured it on one machine. An in-process function computing an order total: about 0.4 microseconds. The same work as an HTTP call with JSON both ways, over loopback on the same machine: about 370 microseconds. A thousand times slower, before the request ever touches a real wire.

On a real network it is worse. A round trip within one cloud zone is on the order of 100 to 500 microseconds, and across zones typically around a millisecond. Here is the rule of thumb: a microsecond becomes a millisecond. A request that made 50 calls into a module now makes 50 remote calls, which is 20 to 50 milliseconds of overhead before any work is done, unless the interface becomes a batch call.

One trap from the same measurements. With a particular TCP setting, Nagle's algorithm, left on at the server, that HTTP call took 44 milliseconds. The server writes headers and body in two small sends, the second waits for an acknowledgement of the first, and the client's kernel deliberately delays that acknowledgement, by at least 40 milliseconds on Linux. If every call to one service takes about 40 milliseconds whatever the payload, that is your suspect.

Now multiply. Five services, each 99.9 percent available, called in sequence: 99.5 percent. That is 3.6 hours of downtime a month instead of 43 minutes. Ten services: 99 percent.

Latency multiplies in a less obvious way. The lesson simulated 200 thousand requests where each call has a median of 5 milliseconds and a 99th percentile of 50. Five calls in sequence: what is the median of the chain?

[pause]

Not 25. It was 35 milliseconds. Latency is skewed, so each call's mean, about 8 milliseconds, is above its median, and the sum inherits the means. Worse, a quarter of five-hop requests took longer than any single service's 99th percentile. Fan out to 20 calls in parallel and wait for all of them, and 18 percent of requests pass 50 milliseconds. That is why search and feed systems use hedged requests, tight per-call timeouts and partial results.

## The distributed monolith

A distributed monolith has the runtime costs of microservices and none of the independence. Its most expensive symptom is the cascade, so follow one second by second.

A gateway has one shared pool of 300 threads. It serves browse, 800 requests a second at 25 milliseconds, which by Little's law keeps about 20 threads busy, and it serves checkout, 200 requests a second. Checkout has 100 threads of its own and calls a pricing service synchronously, with a 5-second timeout. Then pricing's database slows down, and pricing's latency goes from 20 milliseconds to 2 seconds.

Checkout would now need 200 a second times 2 seconds, 400 threads. It has 100, so its pool is full in half a second. Requests start piling up in the gateway, waiting on checkout, 200 more every second. At 1.9 seconds the gateway's 300 threads are all waiting on checkout, and browse requests find no thread at all. Browse is down. At 5 seconds the first timeouts fire, and callers retry three times, so checkout's load triples.

Browse never called pricing, and it went down less than two seconds after pricing slowed. Three decisions caused it. A timeout far above the dependency's 99th percentile: with a 100-millisecond timeout, checkout could never have more than 20 threads waiting on pricing. One shared gateway pool instead of a bulkhead per route. And retries at every layer.

The other symptoms each trace back to a boundary decision. A shared database, so a schema change needs every reader to deploy in step. Lockstep releases, where a feature needs four services to ship together with a four-way rollback plan. And chatty interfaces: fetch 100 orders, then call the customer service 100 times, 100 milliseconds of round trips for what one join did in 2. The tell in a design review is more than three synchronous hops on a user request, or one entity showing up in several services' schemas.

## Extracting a service

Big-bang rewrites fail often enough that the safe approach has a name: the strangler fig. Put a facade in front, move one capability at a time behind it, and retire the old path once the new one has all the traffic.

Take extracting notifications. First, define the one interface every caller in the monolith uses, and route all calls through it. That is the modular-monolith step, and it is often most of the effort. Second, stand up the service behind that interface, temporarily reading the monolith's tables, with a date by which that stops. Third, route traffic through the facade, 1 percent, then 10, then all of it, comparing results in shadow mode where you can. Fourth, move data ownership: create the service's own tables, replicate with change data capture or an outbox, never two application writes, backfill history, verify counts and checksums, then cut reads, then writes. Each step has a rollback. Fifth, retire the module. The fourth step carries the risk.

Then there is the platform you now need. Services must find each other, call each other with timeouts, retries and circuit breakers, authenticate each other, and be traced across hops. A service mesh puts a proxy beside every service to do all of that, at the cost of two extra proxy traversals per call, together around a millisecond or less, memory and CPU per sidecar, and a control plane that is itself a distributed system. It pays at dozens of services in several languages. At five services in one language, a shared client library does the same job.

## In the interview

The first question is often the simplest. Would you build this as microservices?

[pause]

Not at the start. One product team at a few thousand requests a second fits a modular monolith with enforced boundaries, each module owning its tables, so a later extraction is a routing change and a data migration, not a rewrite. You extract on a concrete trigger: a blocked team, a different scaling profile such as media processing, or a feature whose failures must be isolated. The common wrong answer is "yes, so each part can scale independently", when stateless copies of the monolith already scale.

A harder one. Checkout calls six services in sequence. What is its availability, and what do you do? About 99.4 percent, roughly 4.3 hours a month, and a quarter of requests slower than any one service's 99th percentile. Then ask which calls need an answer now. Inventory and payment do; receipts and analytics become events. The remaining calls get timeouts set from the 99th percentile, one layer of retries, and circuit breakers with a degraded path, like default shipping options when the rate service is down. The wrong answer is "make each service 99.99 percent", which is the most expensive way to fix a structural problem.

## Recap

Four things to remember. Microservices solve organisational scaling, not traffic, so default to a modular monolith whose boundaries are enforced by a failing build and by database grants. A service boundary is a data ownership boundary: one owner per table, drawn around bounded contexts, not layers or shared nouns. A microsecond becomes a millisecond, availabilities multiply, and five hops put a quarter of requests past each service's 99th percentile. And a distributed monolith fails by cascade, through long timeouts, shared pools and retries at every layer, so extract with the strangler fig and price the platform as part of the decision.

At your desk: the boundary-check script, the table of writers and readers, the measured hop costs, and the exercise on finding services that must deploy together.

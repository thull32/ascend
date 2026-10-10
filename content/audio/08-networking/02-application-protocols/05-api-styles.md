---
lesson: api-styles
source: ec4225fd654bc37d
fit: great
desk:
  - "The one-screen comparison table: requests, round trips and bytes per style, and the three requests on the wire"
  - "The DataLoader code and its tick-by-tick trace"
  - "The transactional idempotency-key store in SQLite"
  - "Exercises: an idempotency-key handler, and keyset pagination with an opaque cursor"
---
## Introduction

A phone's home screen needs the user's name and a "continue watching" row of 20 titles, each with its name, artwork and progress. Against a resource-oriented REST API, that is one request for the user, one for the row, and twenty for the titles. On a mobile network with a 150 millisecond round trip, even with everything in parallel, that is two dependent waves: 300 milliseconds before the row can render.

So the team adds a GraphQL endpoint, and the screen becomes one request. A week later, the title service is taking twenty queries per home screen instead of one, and the CDN's hit ratio for API traffic has dropped to zero.

Here is the idea that runs through everything that follows. Every API style decides where the cost of assembling data lives: on the network, in the server, or in a purpose-built endpoint. None of them removes it. First, what each style puts on the wire for the same screen. Then where GraphQL's cost goes and how to contain it. Then the three concerns every style shares: idempotency, pagination, and errors, plus how APIs evolve without breaking clients.

## One screen, three styles

Take a smaller screen: user 42's name and their last three orders, each with its status, total, and the product names of its items. The data is fixed. Only the style changes.

REST makes five requests: the user, the orders, then the items for each of the three orders. That is two dependent round trips, so at 150 milliseconds each, 300 milliseconds. GraphQL makes one request and takes 150 milliseconds. gRPC, with a method written for this use case, also makes one call and takes 150.

Now the bytes. The screen needs about 257 bytes worth of facts. REST returned 1,309 bytes, so about 80 percent was over-fetching: every order carried its shipping address, currency and timestamps, because the resource is designed for every client, not this screen. REST also under-fetched: the orders resource does not contain item names, which forced the second wave. That is the network version of the N plus one problem. GraphQL returned exactly the requested shape, 365 bytes. gRPC returned 82 bytes of binary protobuf.

But the gRPC win is not free. Somebody wrote a Get Order Summary method for this one screen. If the RPC API is resource-shaped, with Get User, List Orders and List Items, it makes the same five calls as REST.

REST's real strength is that every piece of infrastructure already speaks HTTP. A GET with a cache-control header is cached by browsers and CDNs with no code. A 304 revalidates in a few hundred bytes. Proxies retry GET, PUT and DELETE because those methods promise idempotency. And curl is the debugger.

Its weakness is the aggregated view: resources are normalised, screens are not. The main mitigation is a backend for frontend: an API layer owned by the client team that exposes screen-shaped endpoints and fans out over the data-centre network, where five calls cost a few milliseconds instead of two mobile round trips. Netflix has written about both ends of that journey: in 2012, each UI team writing server-side adapter code behind its own custom endpoints, and in 2020 a federated GraphQL gateway in which each domain team owns its own graph service. Federation keeps the one-request client model, and moves the N plus one problem into the gateway's query planner.

## GraphQL under the hood

A GraphQL server executes a query field by field. Each field has a resolver, and a field's resolver runs once per parent object. So over-fetching and under-fetching disappear from the network, and the N plus one moves into the server. For the orders query, naive resolvers make one user lookup, one orders lookup, three item lookups, one per order, and four product lookups, one per item. Nine backend calls. And the 20-title home screen makes 20 title calls.

The fix is a per-request DataLoader. Resolvers ask the loader for a key instead of calling the backend. The loader collects every key requested in the same tick of the event loop, and issues one batched call. It also deduplicates: two items pointing at the same product cost one fetch. Traced on the orders query, nine calls become four, one per level of the query rather than one per object.

Before I tell you why: should that loader's cache be shared across requests, to save even more calls?

[pause]

No. The cache is per request on purpose. A loader shared across users would serve one user's data to another, and it would never see invalidations.

The second problem is that clients choose the shape, so clients choose the cost. Page sizes multiply down each path. Ask for 50 users, 20 orders each, 10 items each, and each item's product, and the worst case is 50 users, a thousand orders, ten thousand items and ten thousand products: about 21 thousand nodes from one innocent-looking query. A server that computes this before execution can reject anything above a budget, say 5 thousand, along with queries deeper than a depth limit. GitHub's public GraphQL API rejects any call that could return more than 500 thousand nodes, and charges each query points against an hourly budget.

Persisted queries go further. The client sends only a hash of the query. The first time, the server answers that it does not know that hash, the client resends the full query once, and the server stores it. After that the hash alone is enough, and it can go as a GET, so the URL becomes a CDN cache key. For a small query the hash can be larger than the query itself, so the benefit is not bytes. It is cacheability and control. First-party apps often accept only hashes registered at build time, which turns the query language into an allowlist.

That cacheability matters. A REST catalogue GET with a 60-second shared-cache lifetime can be served 99 percent from a CDN. The same data through a GraphQL POST reaches your servers every time. gRPC gets no HTTP caching at all: it is always a POST, binary, with its status in trailers.

## Idempotency keys

A client sends "create order", and the connection times out. Maybe the request never arrived. Maybe it was processed and the response was lost. Maybe it is still running. The client cannot tell which, and a retry of a non-idempotent operation can charge a card twice.

The fix is the same in every style; only the key's location differs. An Idempotency-Key header on a REST POST, an argument on a GraphQL mutation, a request ID field in a gRPC message. Operations that set a value or delete one are naturally idempotent and need no key.

The server keeps, per key, a fingerprint of the request body, a state, and the stored response. Follow one key through five moments. The first request creates order 1, stores the response, and that response is lost to the timeout. A concurrent duplicate arrives while the first is still in progress: answer 409 Conflict, or make it wait, but never run it twice. The retry arrives two seconds later with the same body: replay the stored response, order 1 again. Then the same key arrives with a different body: that is a client bug, so reject it with a 422 and create nothing. And after the retention window, 24 hours in the lesson's example, the key is treated as new.

Here is the part people get wrong: the key and the order must be written in the same transaction. If the key is written after the order commits, and the process dies in between, the retry finds no key and creates a second order. If the key is written first and the order fails, decide deliberately: release the key so a retry runs again, or store the failure so retries replay it. Stripe stores and replays even a 500 once execution has begun. And a key left "in progress" after a crash blocks every retry. Retention must exceed the longest client retry window.

## Pagination

Offset pagination, skip 40 and take 20, has two defects. First, under writes it lies. In a feed sorted newest first, fetch items 1 to 20, let three new items arrive, then fetch from offset 20. Old items 18 to 20 have been pushed down three places, so they are served again at the top of page 2. Deletes do the opposite and skip items.

Second, it gets slower with depth, because the database must walk and discard every skipped row. Measured on a 300 thousand row feed in memory, with a covering index, pages of 20: page 1 took 3 thousandths of a millisecond. Page 10 thousand, which walks 200 thousand rows, took about 2 milliseconds. A keyset query for the same page took 4 thousandths of a millisecond. Offset cost grows linearly with depth, and on disk, with wider rows, the gap widens.

A keyset, or cursor, query asks for the rows after the last one returned, by sort key: created before this timestamp, with the ID as a tiebreaker. Inserts above the cursor no longer shift the page, and the tiebreaker makes the order total, so rows with equal timestamps are neither skipped nor repeated. Encode the cursor opaquely so clients cannot construct it and you can change its contents. The trade: no "jump to page 500".

Totals have the same problem as offsets. A total count means counting every matching row on every page request. Instead, fetch one row more than the limit and report whether there is a next page, or return an estimate, and say in the contract which one it is.

## Errors and versioning

A useful error answers three questions for the calling code: was it my fault, can a retry help, and when.

REST answers with the HTTP status, 400s for the caller and 500s for the server, plus a Problem Details body with a stable type for client logic, and a Retry-After header on 429 and 503. GraphQL usually answers with a 200 and lists the failure in an errors array. gRPC answers with a 200 and puts the real status in a grpc-status trailer. So a dashboard counting 500s at the load balancer sees nothing for either. Monitor the errors array and the grpc-status code.

Retry-After should be computed, not constant. A token bucket of 100 refilling at 100 per minute gains a token every 0.6 seconds, so an empty bucket should say "retry after one second". A hard-coded 30 either makes clients wait too long, or brings them all back in a synchronised wave at second 30.

And only errors that mean "nothing happened" are safe to retry blindly: a 429, or a 503 sent before processing. A timeout, a 500 after processing began, or gRPC's unavailable status on a write, needs an idempotency key first.

On versioning, the styles differ. REST puts a major version in the path and ships version 2 alongside version 1 before retiring it. GraphQL keeps one evolving schema: add the replacement, mark the old field deprecated, watch per-field usage by client until it reaches zero, then remove it. gRPC relies on protobuf's compatibility rules, reserving removed field numbers. In every style, adding an optional field is safe only if clients ignore unknown fields. Adding an enum value breaks a client with an exhaustive switch. Making an optional input required breaks every old caller. Mobile clients stay installed for years, so "remove" really means "measure usage, then remove".

## In the interview

Here is a follow-up the lesson expects. Your GraphQL 99th percentile doubled after a new field shipped. What do you look for?

[pause]

First, the new field's resolver making one call per parent object: an N plus one without a loader. Then the query cost of clients requesting that field inside large lists. Then a downstream service that has no batch endpoint to call. The wrong answer is "GraphQL is slow, add caching", when the fan-out is the problem.

And the design question: REST, GraphQL or gRPC for a new public API? REST, for universal clients, CDN caching and familiar semantics, possibly generated from the same contract that drives your internal gRPC. The wrong answer is "GraphQL, because clients can ask for anything", which hands third parties an unbounded cost surface. Mixing is normal: gRPC between services, GraphQL or a backend for frontend for your own apps, REST for third parties.

## Recap

Four things to remember. No style removes the cost of assembling data: REST pays on the network, GraphQL in the resolvers, RPC in the method someone wrote. GraphQL needs a per-request DataLoader and a cost limit before execution, and it gives up HTTP caching unless persisted queries win it back. Idempotency is a key, a body fingerprint, a state and a stored response, written in the same transaction as the side effect, with 409 for a concurrent duplicate and 422 for a different body. And use keyset cursors instead of deep offsets, and errors that say whether and when to retry.

At your desk: the one-screen comparison table, the DataLoader trace, the transactional key store, and the two exercises on idempotency keys and keyset pagination.

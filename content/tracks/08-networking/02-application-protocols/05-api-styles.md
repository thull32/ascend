---
slug: api-styles
title: "API styles: REST, GraphQL and RPC on the wire"
description: What REST, GraphQL and RPC actually send over the network, where each one puts the N+1 problem, what each does to HTTP caching and monitoring, and how idempotency, pagination and errors look in all three.
minutes: 34
difficulty: medium
tags: [api, rest, graphql, grpc, rpc, idempotency, pagination, errors]
problems: []
---
A phone's home screen needs the user's name, a "continue watching" row of 20 titles, and for each title its name, artwork and progress. Against a resource-oriented REST API that is one request for the user, one for the row, and twenty for the titles: 22 requests. On a mobile network with a 150 ms round trip, even perfectly parallel, that is three waves of requests and half a second before the row can render. So the team adds a GraphQL endpoint and the screen becomes one request, and a week later the title service's database is taking twenty queries per home screen instead of one, and the CDN's hit ratio for API traffic has dropped to zero.

Every API style is a decision about where the cost of assembling data lives: on the network, in the server, or in a purpose-built endpoint. None removes it. This lesson compares REST, GraphQL and RPC by what they put on the wire and what that does to round trips, caching, retries and monitoring, then shows the three cross-cutting concerns (idempotency, pagination, errors) in each style.

## The same screen in three styles

**REST** models resources and uses HTTP's own verbs, status codes and headers:

```text
GET /v1/users/42/continue-watching?limit=20 HTTP/1.1
Host: api.example.com
Accept: application/json
If-None-Match: "a1b2"

HTTP/1.1 200 OK
Content-Type: application/json
Cache-Control: private, max-age=30
ETag: "c3d4"
Link: </v1/users/42/continue-watching?limit=20&cursor=eyJ0IjoxNzk...>; rel="next"

{"items": [{"titleId": 81, "progress": 0.42, "href": "/v1/titles/81"}, ...]}
```

**GraphQL** exposes one endpoint and lets the client send a query describing exactly the shape it wants:

```text
POST /graphql HTTP/1.1
Content-Type: application/json

{"query": "<the query below, as one string>", "variables": {"id": "42"}}

query Home($id: ID!) {
  user(id: $id) {
    name
    continueWatching(first: 20) {
      edges { node { progress title { id name artwork(size: SMALL) } } }
      pageInfo { endCursor hasNextPage }
    }
  }
}

HTTP/1.1 200 OK
Content-Type: application/json

{"data": {"user": {"name": "Ana", "continueWatching": {"edges": [...], "pageInfo": {...}}}}}
```

**RPC** (gRPC here) exposes verbs designed around use cases, with a typed contract:

```text
rpc GetHomeScreen(GetHomeScreenRequest) returns (HomeScreen);
POST /home.v1.HomeService/GetHomeScreen   (protobuf body, status in trailers)
```

| | REST | GraphQL | RPC (gRPC) |
|---|---|---|---|
| Unit of design | Resource (noun) | Type graph | Procedure (verb) |
| Endpoints | Many URLs | One URL | One path per method |
| Who shapes the response | Server | Client, per query | Server, per method |
| HTTP caching and CDNs | Native for `GET` | Defeated by `POST`; needs persisted queries | None (always `POST`) |
| Round trips for aggregated views | Many, unless you add composite endpoints | One | One, if a method exists for it |
| Where N+1 lives | On the network | In the server's resolvers | In the method's implementation |
| Error signal | HTTP status | `errors` array, HTTP 200 | `grpc-status` trailer, HTTP 200 |
| Contract | OpenAPI, optional | Schema, mandatory | Protobuf, mandatory |
| Natural home | Public APIs, CDN-cacheable reads | First-party UIs with many screens | Service-to-service |

## REST: every intermediary understands it

REST's strength is not elegance; it is that every piece of infrastructure between client and server already speaks HTTP semantics. A `GET` with `Cache-Control` is cached by browsers and CDNs with no code. A `304 Not Modified` answers a revalidation in a few hundred bytes. Proxies and client libraries retry `GET`, `PUT` and `DELETE` safely because the methods promise idempotency. Rate limiters, WAFs and access logs key on method and path. `curl` is the debugger.

```viz
{"type": "network", "scenario": "http-request", "title": "REST reuses HTTP's caching machinery", "caption": "The first response carries an ETag; the revalidation sends If-None-Match and gets a body-less 304. GraphQL and gRPC calls are POSTs and get none of this for free."}
```

Its weakness is the aggregated view. Resources are normalised, screens are not, and a client assembling a screen from resources pays in round trips: the network N+1. The standard mitigations are compound responses (`?include=title`), sparse fieldsets (`?fields=id,name,artwork`), and a **backend for frontend** (BFF): an API layer owned by the client team that exposes screen-shaped endpoints and fans out to resources over the low-latency data-centre network, where 20 calls cost milliseconds rather than a mobile round trip each. Netflix's engineering blog describes a long version of this journey, from a single API with per-device adapter code written by UI teams to a federated GraphQL gateway.

## GraphQL: the client chooses the shape

GraphQL turns the BFF into a query language. The server publishes a schema; each field has a **resolver**; the client asks for any shape the schema allows, in one request. Over- and under-fetching disappear from the network. Three costs appear in their place.

**The N+1 moves into the server.** A naive resolver for `title` runs once per edge, so one query for 20 titles makes 20 calls to the title service. The standard fix is a per-request **DataLoader**: resolvers ask the loader for a key, the loader collects every key requested in the same tick of the event loop, and issues one batched call.

```python
import asyncio

class TitleLoader:
    def __init__(self, title_client):
        self.client, self.pending, self.cache = title_client, {}, {}

    async def load(self, title_id):
        if title_id in self.cache:
            return await self.cache[title_id]
        fut = asyncio.get_running_loop().create_future()
        self.cache[title_id] = fut
        if not self.pending:
            asyncio.get_running_loop().call_soon(self._dispatch)   # batch this tick's keys
        self.pending[title_id] = fut
        return await fut

    def _dispatch(self):
        batch, self.pending = self.pending, {}
        async def run():
            titles = await self.client.get_titles(list(batch))     # one call for 20 ids
            for tid, fut in batch.items():
                fut.set_result(titles.get(tid))
        asyncio.ensure_future(run())
```

Twenty resolver calls in one tick become one `get_titles` call with twenty IDs, and repeated IDs within the request hit the per-request cache.

**HTTP caching stops working.** Every query is a `POST` to `/graphql` with a different body, and no CDN caches that. The fix is **persisted queries**: the client registers each query at build time and sends a hash (`GET /graphql?id=9f1c...&variables={"id":"42"}`), which is cacheable and doubles as an allowlist. Clients like Apollo add a normalised in-memory cache keyed by type and ID.

**Arbitrary queries are a denial-of-service surface.** A client can nest `friends { friends { friends { ... } } }` and fan out exponentially. Public GraphQL APIs enforce depth limits, cost analysis (sum an estimated cost per field and reject over a budget), and timeouts; first-party APIs often accept only persisted queries.

Errors are different too. A GraphQL response is usually HTTP 200, and partial success is normal:

```json
{
  "data": {"user": {"name": "Ana", "continueWatching": null}},
  "errors": [{
    "message": "continue-watching service unavailable",
    "path": ["user", "continueWatching"],
    "extensions": {"code": "UNAVAILABLE", "retryable": true}
  }]
}
```

The name rendered; the row did not. That is a feature (one failing field does not blank the screen) and an operational trap: any dashboard that counts HTTP 5xx will report 100% success. Monitor the `errors` array.

## RPC: verbs and contracts

RPC styles (gRPC, Thrift, JSON-RPC) design the API around operations: `CancelSubscription`, `GetHomeScreen`, `ReserveSeats`. That is honest about what most internal APIs are, avoids forcing actions into resource shapes (`POST /subscriptions/9/cancellation`), and gets typed stubs, deadlines and streaming from the framework. The costs are the ones in [gRPC and protobuf](/learn/networking/application-protocols/grpc-and-protobuf): no HTTP caching, browser access through a proxy, and failure signalled in trailers. Most organisations therefore use RPC between services and REST or GraphQL at the edge.

## Idempotency: the same problem in every style

A client sends "create order" and the connection times out. Three truths are possible: the request never arrived, it was processed and the response was lost, or it is still running. The client cannot tell which, so it must either give up or retry, and a retry of a non-idempotent operation can charge a card twice. This is identical in all three styles; only the place you put the key differs.

- **Naturally idempotent operations** need no key: `PUT /users/42/email` (set a value) and `DELETE /orders/9` leave the same state when repeated. Prefer "set to X" over "add X" in API design where you can.
- **REST:** an `Idempotency-Key` header (being standardised by the IETF, popularised by payment APIs) on `POST`. The server stores the key with a fingerprint of the request body and the response it produced.
- **GraphQL:** an argument on the mutation (`createOrder(input: {..., idempotencyKey: "..."})`).
- **gRPC:** a `request_id` field in the request message.

The server-side rules are the same everywhere. Same key and same body: return the stored response without doing the work again. Same key and a *different* body: the client has a bug, so reject it (422 Unprocessable Content). Same key while the first request is still running: reject with 409 Conflict or wait, never run it twice. Keys expire after a retention window (24 hours is common), after which the key is treated as new. The key must be stored in the same transaction as the side effect it protects, or a crash between the two recreates the duplicate. [Idempotency and retries](/learn/system-design/building-blocks/idempotency-and-retries) covers storage and consumer-side deduplication in depth.

```exercise
id: idempotency-key-handler
title: Implement an idempotency-key handler
prompt: |
  Implement `IdempotentOrders` with one method, `handle(key, body, now)`,
  for a `POST /orders` endpoint. `key` is a string or `None`/`null`,
  `body` a string, `now` a time in seconds (non-decreasing across calls).

  - Creating an order returns `"201 order-<n>"`, where n counts orders
    created so far by this instance, starting at 1.
  - `key` is null: always create a new order.
  - `key` not seen, or seen more than 86400 seconds ago
    (`now - stored_at >= 86400`): create a new order and store the key
    with the body, the response and `now`.
  - `key` seen within the window with the same body: return the stored
    response exactly, without creating anything.
  - `key` seen within the window with a different body: return `"422"`
    and create nothing. The stored entry is unchanged.

  Replays do not extend a key's window. The tests replay a sequence of
  calls and compare the list of return values.
languages: [python, javascript]
entry: IdempotentOrders
starter:
  python: |
    class IdempotentOrders:
        TTL = 86400

        def __init__(self):
            self.next_id = 1
            self.keys = {}   # key -> (body, response, stored_at)

        def handle(self, key, body, now):
            return ""
  javascript: |
    class IdempotentOrders {
      constructor() {
        this.nextId = 1;
        this.keys = new Map(); // key -> { body, response, at }
      }
      handle(key, body, now) {
        return "";
      }
    }
tests:
  - args: [["handle", "k1", "amount=10", 0], ["handle", "k1", "amount=10", 5]]
    expected: ["201 order-1", "201 order-1"]
    label: a retry replays the stored response
  - args: [["handle", "k1", "amount=10", 0], ["handle", "k2", "amount=10", 1]]
    expected: ["201 order-1", "201 order-2"]
    label: different keys are different orders
  - args: [["handle", "k1", "amount=10", 0], ["handle", "k1", "amount=20", 1], ["handle", "k1", "amount=10", 2]]
    expected: ["201 order-1", "422", "201 order-1"]
    label: key reused with another body
  - args: [["handle", null, "amount=10", 0], ["handle", null, "amount=10", 1]]
    expected: ["201 order-1", "201 order-2"]
    label: no key, no protection
  - args: [["handle", "k1", "amount=10", 0], ["handle", "k1", "amount=10", 86399], ["handle", "k1", "amount=10", 86400], ["handle", "k1", "amount=10", 86401]]
    expected: ["201 order-1", "201 order-1", "201 order-2", "201 order-2"]
    label: expiry at exactly 24 hours
    hidden: true
  - args: [["handle", "k1", "amount=10", 0], ["handle", "k1", "amount=20", 90000]]
    expected: ["201 order-1", "201 order-2"]
    label: an expired key accepts a new body
    hidden: true
  - args: [["handle", "k1", "amount=10", 0], ["handle", "k1", "amount=20", 1], ["handle", "k2", "amount=20", 2]]
    expected: ["201 order-1", "422", "201 order-2"]
    label: a rejected call creates nothing
    hidden: true
hints:
  - "Check the stored entry's age before comparing bodies: an expired entry behaves as if the key were new."
  - "Only increment the order counter on the paths that create an order."
```

## Pagination: offsets lie, cursors do not

Offset pagination (`?offset=40&limit=20`) is simple and wrong under writes. Take a feed sorted newest first. You fetch items 1 to 20. A new item is inserted at the top. You fetch offset 20: every item has shifted down one position, so the first item of "page 2" is the item you already saw at position 20. Deletes do the opposite and skip items. And `OFFSET 100000` makes the database read and discard 100,000 rows.

A **cursor** encodes the position of the last item returned, in terms of the sort key, and the next page asks for items after it:

```sql
SELECT id, created_at, title_id, progress
FROM continue_watching
WHERE user_id = $1
  AND (created_at, id) < ($2, $3)      -- the cursor: last row's sort key
ORDER BY created_at DESC, id DESC
LIMIT 20;
```

Insertions above the cursor no longer shift the page, and the query uses an index on `(user_id, created_at, id)` whatever page you are on. The `id` tiebreaker makes the order total, so two rows with the same timestamp are neither skipped nor duplicated. Encode the cursor opaquely (base64 of a small JSON object) so clients cannot build it themselves and you can change its contents later.

On the wire, the three styles have converged on the same idea with different spellings: REST returns a `Link: <...>; rel="next"` header or a `next_cursor` field; GraphQL uses the connection pattern (`first`, `after`, `edges`, `pageInfo { endCursor hasNextPage }`); gRPC APIs commonly use `page_size`, `page_token` and `next_page_token`. An empty next token or `hasNextPage: false` ends the iteration. [API design and versioning](/learn/system-design/building-blocks/api-design-and-versioning) covers pagination and filtering as part of the contract.

## Errors: tell the caller what to do next

A useful error answers three questions for the calling code: whether it was the caller's fault, whether retrying could help, and when. Each style has a standard way to say it.

| | Status signal | Machine-readable detail | Retry hint |
|---|---|---|---|
| REST | HTTP status: 4xx caller, 5xx server | Problem Details body (RFC 9457), `application/problem+json` | `Retry-After` on 429 and 503 |
| GraphQL | HTTP 200; entry in `errors` | `extensions.code`, `path` of the failed field | Custom field in `extensions` |
| gRPC | `grpc-status` code | `google.rpc.Status` details, such as `ErrorInfo` and `BadRequest` | `RetryInfo` detail; `UNAVAILABLE` is retryable by convention |

A REST rate-limit error done properly:

```text
HTTP/1.1 429 Too Many Requests
Content-Type: application/problem+json
Retry-After: 30

{
  "type": "https://api.example.com/problems/rate-limited",
  "title": "Too many requests",
  "status": 429,
  "detail": "This API key is limited to 100 requests per minute.",
  "instance": "/v1/orders",
  "request_id": "7f3a9c02"
}
```

The status tells generic infrastructure what happened, `type` is a stable code that client logic can switch on, `Retry-After` tells a well-behaved client exactly when to come back, and `request_id` connects a support ticket to a trace. What it must not contain is a stack trace, an SQL fragment or an internal hostname. The limiter behind that response is usually a token bucket per API key:

```viz
{"type": "system", "scenario": "token-bucket", "requests": 10, "title": "A token bucket per API key decides when to answer 429", "caption": "Capacity sets the burst a client may send; the refill rate sets its sustained rate. A rejected request should carry Retry-After computed from when the next token arrives."}
```

The rule that ties errors back to idempotency: only errors that mean "nothing happened" (429, 503 before processing, gRPC `UNAVAILABLE`) are safe to retry blindly. A timeout or a 500 after processing began needs an idempotency key before it is safe to retry at all. [Rate limiting algorithms](/learn/networking/network-algorithms/rate-limiting-algorithms) covers the limiters themselves.

## Choosing

- **Public API for third parties:** REST. Every client can call it, CDNs can cache it, and the HTTP semantics are documentation that integrators already know.
- **First-party UIs across many devices and screens, many backend teams:** GraphQL, usually federated so each team owns a subgraph, with persisted queries to regain caching and control cost. Or a BFF per client if there are only one or two clients.
- **Service to service:** gRPC, for typed contracts, deadlines, streaming and efficiency.

Mixing is normal and healthy. The mistake is choosing a style by fashion and then rebuilding, badly, the parts of HTTP the style threw away.

## Senior signals

- You frame API style as "where does the cost of assembling data live" and can say where the N+1 went in each style (network, resolvers, method implementation).
- You know GraphQL and gRPC return HTTP 200 for failures and make sure monitoring parses `errors` or `grpc-status`.
- You regain caching for GraphQL with persisted queries, and cap query cost with depth and complexity limits.
- You treat idempotency as a key plus a stored response, with 422 for a reused key with a different body and 409 for a concurrent duplicate, stored atomically with the side effect.
- You use cursor pagination with a total order (sort key plus ID) and opaque cursors, and can show the duplicate that offset pagination produces under inserts.
- You design errors that tell the caller whether and when to retry (`Retry-After`, retryable codes), and never leak internals.

## Check yourself

```quiz
- q: >-
    A team replaces a REST API with GraphQL for its mobile app. Round trips per screen drop from 20 to 1, but the title service now receives 20 separate lookups per home screen. What is the standard fix?
  options: ["Go back to REST", "Batch resolver calls per request with a DataLoader, so all title IDs requested in the same tick become one batched lookup", "Cache every GraphQL response at the CDN by URL", "Increase the title service's thread pool"]
  answer: 1
  explanation: >-
    GraphQL moved the N+1 from the network to the resolvers. A per-request loader collects keys and issues one batched call, and also deduplicates repeated IDs. CDN caching by URL does not work because every query is a POST to the same URL; more threads just makes the N+1 faster.
- q: >-
    A client retries POST /orders with the same Idempotency-Key but a different amount in the body. What should the server do?
  options: ["Process it as a new order", "Return the original stored response", "Reject it (for example 422) because the key was reused with a different request, and create nothing", "Update the original order to the new amount"]
  answer: 2
  explanation: >-
    Reusing a key with a different body is a client bug; replaying the old response would hide it, and processing it would defeat the key. The IETF draft for the header specifies an error for this case. A concurrent retry with the same body, by contrast, gets 409 or waits, and a completed one gets the stored response.
- q: >-
    A feed API uses ?offset=20&limit=20, sorted newest first. Between fetching page 1 and page 2, three new items are posted. What does the client see?
  options: ["Page 2 is correct because offsets are stable", "The last three items of page 1 appear again at the top of page 2, because every item shifted down three positions", "Page 2 skips three items", "The request fails"]
  answer: 1
  explanation: >-
    Offsets are positions, and insertions at the top shift every position. Items 18 to 20 of the old ordering become 21 to 23, so they are served again. Deletions cause the opposite (skips). A cursor based on the last item's sort key is unaffected by inserts above it.
- q: >-
    An operations dashboard counts HTTP 5xx responses at the load balancer and shows zero errors, but users of the GraphQL and gRPC APIs report failures. Why?
  options: ["The load balancer is dropping error responses", "Both styles report most failures inside a successful HTTP 200 response (the GraphQL errors array, the gRPC grpc-status trailer), so HTTP-level metrics miss them", "The errors are all client-side JavaScript errors", "5xx responses are cached by the CDN"]
  answer: 1
  explanation: >-
    GraphQL allows partial success with errors listed alongside data, and gRPC puts the call status in trailers after an HTTP 200. Monitoring must be protocol-aware. That is one of the operational costs of leaving plain REST semantics.
- q: >-
    Which situation most favours REST over GraphQL or gRPC?
  options: ["Internal service calls with strict latency budgets", "A mobile app with many screens assembled from several teams' services", "A public catalogue API whose GET responses should be cached by a CDN and called by third parties in any language", "Bidirectional streaming between two services"]
  answer: 2
  explanation: >-
    REST GETs are cached by browsers and CDNs with no extra machinery, and any HTTP client can call them. The other options play to gRPC (internal calls, streaming) or GraphQL (many screens, many teams).
```

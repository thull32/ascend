---
slug: api-styles
title: "API styles: REST, GraphQL and RPC on the wire"
description: REST, GraphQL and RPC compared on one screen's data (requests, round trips and bytes counted), where each style puts the N+1 problem and how DataLoader batching removes it, query cost limits and persisted queries, HTTP caching per style, idempotency keys traced through a retried POST, offset versus keyset pagination measured at page 10,000, RFC 9457 errors, and versioning.
minutes: 45
difficulty: medium
tags: [api, rest, graphql, grpc, rpc, idempotency, pagination, keyset-pagination, errors, versioning, dataloader]
problems: []
---
A phone's home screen needs the user's name, a "continue watching" row of 20 titles, and for each title its name, artwork and progress. Against a resource-oriented REST API that is one request for the user, one for the row and twenty for the titles. On a mobile network with a 150 ms round trip, even with every request in parallel, that is two dependent waves and 300 ms before the row can render. So the team adds a GraphQL endpoint, the screen becomes one request, and a week later the title service is taking twenty queries per home screen instead of one and the CDN's hit ratio for API traffic has dropped to zero.

Every API style decides where the cost of assembling data lives: on the network, in the server, or in a purpose-built endpoint. None removes it. This lesson counts what REST, GraphQL and RPC put on the wire for the same screen, traces where each one's N+1 goes, and then works the three concerns every style shares: idempotency, pagination and errors, plus how each style evolves without breaking clients.

## One screen, three styles, counted

Take a smaller screen: user 42's name and last three orders, each with id, status, total and the product names of its items. The data is fixed; only the style changes. All bodies are compact JSON or protobuf, computed with a short script:

| | REST (resources) | GraphQL | gRPC (use-case method) |
|---|---|---|---|
| Requests | 5: user, orders, then items for each of 3 orders | 1 `POST /graphql` | 1 `GetOrderSummary` |
| Dependent round trips | 2: user and orders in parallel, then 3 item calls in parallel | 1 | 1 |
| Request bodies | none (5 GET heads, about 142 bytes each over HTTP/1.1) | 128 bytes (query and variables) | 2 bytes (`08 2a`: user id 42) |
| Response bodies | 1,309 bytes | 365 bytes | 82 bytes of protobuf |
| At 150 ms per round trip | 300 ms | 150 ms | 150 ms |

The screen needs about 257 bytes of JSON worth of facts. REST returned 1,309, so about 80% was **over-fetching**: every order carried its shipping address, currency and timestamps because the resource is designed for every client, not this screen. REST also **under-fetched**: the orders resource does not contain item names, so the client needed a second wave, the network N+1. GraphQL returned exactly the requested shape, and gRPC's purpose-built method returned it in binary. Header overhead adds to REST's count on HTTP/1.1; on HTTP/2 repeated heads compress to a few bytes each ([HTTP/2 and HTTP/3](/learn/networking/application-protocols/http-2-and-http-3)).

The three requests on the wire:

```text
REST     GET /v1/users/42/orders?limit=3            (plus /v1/users/42 and /v1/orders/{id}/items x3)
GraphQL  POST /graphql
         {"query":"query($id:ID!){user(id:$id){name orders(last:3){id status totalCents items{product{name}}}}}","variables":{"id":"42"}}
gRPC     POST /orders.v1.OrderService/GetOrderSummary   (protobuf body, status in trailers)
```

The gRPC win is not free: somebody wrote `GetOrderSummary` for this screen. If the RPC API is resource-shaped (`GetUser`, `ListOrders`, `ListItems`), it makes the same five calls as REST.

## REST: every intermediary understands it

REST's strength is that every piece of infrastructure already speaks HTTP semantics ([HTTP/1.1](/learn/networking/application-protocols/http-1-1)). A `GET` with `Cache-Control` is cached by browsers and CDNs with no code, a `304` revalidates in a few hundred bytes, proxies retry `GET`, `PUT` and `DELETE` because the methods promise idempotency, and rate limiters, WAFs and logs key on method and path. `curl` is the debugger.

```viz
{"type": "network", "scenario": "http-request", "title": "REST reuses HTTP's caching machinery", "caption": "The first response carries an ETag; the revalidation sends If-None-Match and gets a body-less 304. GraphQL and gRPC calls are POSTs and get none of this for free."}
```

Its weakness is the aggregated view: resources are normalised, screens are not. The mitigations are compound documents (`?include=items`), sparse fieldsets (`?fields=id,status,totalCents`), and a **backend for frontend** (BFF): an API layer owned by the client team that exposes screen-shaped endpoints and fans out over the data-centre network, where five calls cost a few milliseconds instead of two mobile round trips. Netflix's engineering blog describes both ends of this journey. In 2012 its device API let each UI team write server-side adapter code (in Groovy) behind its own custom endpoints, a BFF in all but name; in 2020 it described moving its studio API to a federated GraphQL gateway in which each domain team owns a Domain Graph Service, and [DGS](https://github.com/Netflix/dgs-framework), its Spring Boot framework for writing those services, is open source. Federation keeps GraphQL's one-request client model while splitting ownership, and moves the N+1 and cost problems into the gateway's query planner, which must batch calls to each subgraph.

## GraphQL under the hood: resolvers and DataLoader

A GraphQL server parses the query, validates it against the schema, and executes it field by field: each field has a **resolver**, and a field's resolver runs once per parent object. Over- and under-fetching disappear from the network; the N+1 moves into the server. For the orders query, naive resolvers make 1 user lookup, 1 orders lookup, 3 item lookups (one per order) and 4 product lookups (one per item): 9 backend calls, and the 20-title home screen makes 20 title calls.

A per-request **DataLoader** fixes it. Resolvers ask the loader for a key; the loader collects every key requested in the same tick of the event loop and issues one batched call:

```python
import asyncio

class TitleLoader:
    def __init__(self, title_client):
        self.client, self.pending, self.cache = title_client, {}, {}

    async def load(self, title_id):
        if title_id in self.cache:                  # same id twice in one request: one fetch
            return await self.cache[title_id]
        fut = asyncio.get_running_loop().create_future()
        self.cache[title_id] = fut
        if not self.pending:                        # first key this tick schedules the batch
            asyncio.get_running_loop().call_soon(self._dispatch)
        self.pending[title_id] = fut
        return await fut

    def _dispatch(self):
        batch, self.pending = self.pending, {}
        async def run():
            titles = await self.client.get_titles(list(batch))     # one call for the whole tick
            for tid, fut in batch.items():
                fut.set_result(titles.get(tid))
        asyncio.ensure_future(run())
```

Tested with a fake client, 20 `load` calls including one repeated id produced one `get_titles` call with 19 ids. Traced on the orders query with one loader per type:

| Tick | Resolvers running | Keys collected | Backend calls |
|---|---|---|---|
| 1 | `user` | user 42 | 1 |
| 2 | `orders` of user 42 | user 42's last 3 | 1 |
| 3 | `items` of orders 9003, 9002, 9001 | 3 order ids | 1: `WHERE order_id IN (...)` |
| 4 | `product` of 4 items | 501, 502, 503, 501, deduplicated to 3 | 1 |

Nine calls become four, one per level of the query rather than one per object. The cache is per request on purpose: a loader shared across users would serve one user's data to another and never see invalidations.

## Query cost limits and persisted queries

Clients choose the shape, so clients choose the cost. Estimate a query's worst case by multiplying page sizes down each path:

```text
users(first: 50) { orders(first: 20) { items(first: 10) { product { name } } } }
nodes = 50 + 50*20 + 50*20*10 + 50*20*10 = 50 + 1,000 + 10,000 + 10,000 = 21,050
```

The screen query above costs 1 + 3 + 30 + 30 = 64 with a 10-item cap. A server that computes this before execution can reject anything above a budget (say 5,000) along with queries deeper than a depth limit; GitHub's public GraphQL API, for example, requires `first` or `last` (between 1 and 100) on every connection, rejects any call that could return more than 500,000 nodes, and charges each query points against an hourly budget (5,000 for a user), estimated from the worst-case number of connection fetches divided by 100. Execution timeouts backstop the estimate.

**Persisted queries** go further. With Apollo's automatic persisted queries, the client first sends only a SHA-256 hash in `extensions.persistedQuery`; an unknown hash returns an error with code `PERSISTED_QUERY_NOT_FOUND`; the client resends the full query once and the server stores it; later calls send only the hash, and can do so as a `GET`, so the URL becomes a CDN cache key. For this small query the hash-only body (151 bytes) is larger than the query itself (128), so the benefit is cacheability and control, not bytes. First-party apps often go further still and accept only hashes registered at build time, which turns the query language into an allowlist.

## HTTP caching per style

| Style | Browser and CDN caching | What replaces it |
|---|---|---|
| REST `GET` | Native: `Cache-Control`, `ETag`, `Vary`, 304s | – |
| GraphQL over `POST` | None: every query is a `POST` to one URL | Persisted queries over `GET`; normalised client caches keyed by type and id (Apollo, Relay) |
| gRPC | None: always `POST`, binary, trailers | Application caches (Redis, in-process); client-side caching of responses by request |

The cost shows up at the edge: a REST catalogue endpoint with `s-maxage=60` can be served 99% from a CDN ([CDNs and the edge](/learn/networking/application-protocols/cdns-and-edge)); the same data through GraphQL `POST` reaches your servers every time.

## RPC: verbs and contracts

RPC styles (gRPC, Thrift, JSON-RPC) design around operations: `CancelSubscription`, `GetHomeScreen`, `ReserveSeats`. That is honest about what most internal APIs are, avoids forcing actions into resource shapes (`POST /subscriptions/9/cancellation`), and gets typed stubs, deadlines and streaming from the framework. The costs are those in [gRPC and protobuf](/learn/networking/application-protocols/grpc-and-protobuf): no HTTP caching, browsers need a proxy, and failures hide in trailers.

## Idempotency keys, traced

A client sends "create order" and the connection times out. The request never arrived, or it was processed and the response lost, or it is still running; the client cannot tell which, and a retry of a non-idempotent operation can charge a card twice. The fix is identical in every style; only the key's location differs: an `Idempotency-Key` header on a REST `POST` (an IETF working-group draft, still not an RFC in 2026, that lists Stripe's payment API as an implementation), an argument on a GraphQL mutation, a `request_id` field in a gRPC message. Operations that set a value (`PUT /users/42/email`) or delete one are naturally idempotent and need no key.

The server keeps, per key, a fingerprint of the request body, a state and the stored response. A retried POST with key `K`:

| Time | Request | Stored entry for K | Server action | Response |
|---|---|---|---|---|
| 0 s | POST, K, body B | none: insert (K, hash(B), in progress) | Create order 1; store the response and mark complete **in the same transaction** | 201 order-1, lost to a timeout |
| 0.4 s | Concurrent duplicate, K, B | in progress | Do not run it twice | 409 Conflict (or wait) |
| 2 s | Retry, K, B | complete, hash matches | Replay the stored response | 201 order-1 |
| 5 s | K with body B′ | complete, hash differs | Client bug: reject, create nothing | 422 Unprocessable Content |
| 24 h + 1 s | K, B | expired | Treated as a new key | 201 order-2 |

The transaction is the part people get wrong. If the key is written after the order commits and the process dies in between, the retry finds no key and creates a second order. If the key is written first and the order then fails, decide deliberately: release the key so that a retry runs again, or store the failure so that retries replay it (Stripe stores and replays even a 500 once execution has begun). A key left "in progress" after a crash blocks every retry. Retention must exceed the longest client retry window; Stripe lets keys be pruned once they are at least 24 hours old.

### A transactional key store

A complete, runnable version with SQLite shows the shape; the same structure works in Postgres with the key table's primary key doing the concurrency control:

```python
import hashlib, json, sqlite3

db = sqlite3.connect(":memory:", isolation_level=None)       # explicit BEGIN/COMMIT below
db.executescript("""
CREATE TABLE orders (id INTEGER PRIMARY KEY, amount INTEGER);
CREATE TABLE idempotency_keys (key TEXT PRIMARY KEY, body_hash TEXT, response TEXT, created_at REAL);
""")

def create_order(key, body, now):
    body_hash = hashlib.sha256(body.encode()).hexdigest()
    db.execute("BEGIN IMMEDIATE")                           # take the write lock before reading
    try:
        row = db.execute("SELECT body_hash, response, created_at FROM idempotency_keys WHERE key = ?",
                         (key,)).fetchone()
        if row and now - row[2] < 86400:
            db.execute("COMMIT")
            return row[1] if row[0] == body_hash else "422"
        if row:                                              # expired: forget it
            db.execute("DELETE FROM idempotency_keys WHERE key = ?", (key,))
        order_id = db.execute("INSERT INTO orders (amount) VALUES (?)",
                              (json.loads(body)["amount"],)).lastrowid
        response = f"201 order-{order_id}"
        db.execute("INSERT INTO idempotency_keys VALUES (?, ?, ?, ?)", (key, body_hash, response, now))
        db.execute("COMMIT")                                 # order and key become visible together
        return response
    except Exception:
        db.execute("ROLLBACK")                               # neither the order nor the key survives
        raise

print(create_order("k1", '{"amount": 10}', 0))     # 201 order-1
print(create_order("k1", '{"amount": 10}', 2))     # 201 order-1 (replayed)
print(create_order("k1", '{"amount": 20}', 5))     # 422
print(create_order("k1", '{"amount": 10}', 90000)) # 201 order-2 (key expired)
print(db.execute("SELECT COUNT(*) FROM orders").fetchone()[0], "orders")
```

`BEGIN IMMEDIATE` takes SQLite's write lock before the lookup, so two concurrent requests with one key cannot both see "absent"; in Postgres the equivalent is inserting the key first with `ON CONFLICT DO NOTHING` and checking whether a row was inserted, which serialises duplicates on the primary key. The rollback path releases the key when the order fails, so a retry runs the order again instead of replaying the failure. [Idempotency and retries](/learn/system-design/building-blocks/idempotency-and-retries) covers storage choices and consumer-side deduplication.

```viz
{"type": "system", "scenario": "idempotency-key", "service": "Orders API", "request": "POST /orders {amount 10}", "key": "K", "effect": "create order 1", "target": "", "record": "order 1", "response": "201 order-1", "effects": "orders", "changed": "amount 20",
 "title": "A retried request with an idempotency key",
 "caption": "The first request stores its result under the key; a retry with the same key and body is answered from the store instead of repeating the side effect."}
```

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

## Pagination: offsets, cursors and page 10,000

Offset pagination (`?offset=40&limit=20`) has two defects. Under writes it lies: in a feed sorted newest first, fetch items 1 to 20, let three new items arrive, fetch offset 20, and the old items 18 to 20 are served again at the top of page 2; deletes skip items instead. And it gets slower with depth, because the database must walk and discard every skipped row.

*Measured* with SQLite 3.53 in memory on this machine, a 300,000-row feed with a covering index on `(user_id, created_at DESC, id DESC)`, pages of 20:

| Query | Rows walked | Time (best of 20) |
|---|---|---|
| `OFFSET 0` (page 1) | 20 | 0.003 ms |
| `OFFSET 1980` (page 100) | 2,000 | 0.023 ms |
| `OFFSET 199980` (page 10,000) | 200,000 | 2.05 ms |
| Keyset after the last row of page 9,999 | 20 | 0.004 ms |

Offset cost grows linearly, 100 times the offset for about 100 times the time, while the keyset query costs the same on every page. On disk, with a non-covering index and wider rows, each skipped row can mean a page read, so the gap widens. A **keyset** (cursor) query asks for rows after the last one returned, by sort key:

```sql
SELECT id, created_at, title_id
FROM feed
WHERE user_id = $1
  AND (created_at, id) < ($2, $3)      -- the cursor: the last row's sort key
ORDER BY created_at DESC, id DESC
LIMIT 20;
```

Inserts above the cursor no longer shift the page, and the `id` tiebreaker makes the order total, so rows with equal timestamps are neither skipped nor repeated. Encode the cursor opaquely (base64 of the sort key) so clients cannot construct it and you can change its contents. The trade: no "jump to page 500", and a filter or sort change needs a new cursor. The styles spell it differently but agree: REST returns `Link: <...>; rel="next"` or `next_cursor`; GraphQL uses connections (`first`, `after`, `pageInfo { endCursor hasNextPage }`); gRPC uses `page_size`, `page_token`, `next_page_token`. [Indexes](/learn/databases/relational-fundamentals/indexes) explains why the composite index serves the keyset predicate.

Totals have the same problem as offsets. A `total_count` field means `SELECT COUNT(*)` over every matching row on every page request, which for a user with millions of events is a full index scan each time. Return `hasNextPage` (fetch `limit + 1` rows and check whether the extra one exists), an estimate from table statistics, or a count cached with a short TTL, and say in the contract which one it is.

```exercise
id: keyset-page
title: Keyset pagination with an opaque cursor
prompt: |
  Implement `keyset_page(rows, limit, cursor)`. `rows` is a list of
  `[created_at, id]` pairs in any order; the feed is sorted by
  `created_at` descending, then `id` descending. `cursor` is `None`/`null`
  for the first page, otherwise an opaque string.

  Return `{"ids": [...], "next": ...}`: the ids of the next `limit` rows
  that come strictly after the cursor position in that order, and a cursor
  for the following page. The cursor is the base64 encoding of the ASCII
  string `"<created_at>,<id>"` of the last row returned (for example
  `"MTAwLDE="` for `100,1`). `next` is null when no rows remain after this
  page. Use `base64` in Python and `btoa`/`atob` in JavaScript.
languages: [python, javascript]
entry: keyset_page
starter:
  python: |
    import base64

    def keyset_page(rows, limit, cursor):
        ordered = sorted(rows, key=lambda r: (r[0], r[1]), reverse=True)
        # TODO: skip rows at or before the cursor, take `limit`, build `next`
        return {"ids": [], "next": None}
  javascript: |
    function keyset_page(rows, limit, cursor) {
      const ordered = [...rows].sort((a, b) => (b[0] - a[0]) || (b[1] - a[1]));
      // TODO: skip rows at or before the cursor, take `limit`, build `next`
      return { ids: [], next: null };
    }
tests:
  - args: [[[100, 1], [100, 2], [90, 3], [80, 4], [80, 5], [70, 6]], 2, null]
    expected: {"ids": [2, 1], "next": "MTAwLDE="}
    label: first page; equal timestamps ordered by id
  - args: [[[100, 1], [100, 2], [90, 3], [80, 4], [80, 5], [70, 6]], 2, "MTAwLDE="]
    expected: {"ids": [3, 5], "next": "ODAsNQ=="}
  - args: [[[100, 1], [100, 2], [90, 3], [80, 4], [80, 5], [70, 6], [110, 7]], 2, "MTAwLDE="]
    expected: {"ids": [3, 5], "next": "ODAsNQ=="}
    label: a newer row does not shift page 2
  - args: [[[100, 1], [100, 2], [90, 3], [80, 4], [80, 5], [70, 6]], 2, "ODAsNQ=="]
    expected: {"ids": [4, 6], "next": null}
    label: last page has no next cursor
  - args: [[], 3, null]
    expected: {"ids": [], "next": null}
    label: empty feed
  - args: [[[100, 1], [100, 2], [90, 3], [80, 4], [80, 5], [70, 6]], 10, null]
    expected: {"ids": [2, 1, 3, 5, 4, 6], "next": null}
    hidden: true
  - args: [[[5, 1], [5, 2], [5, 3]], 1, "NSwz"]
    expected: {"ids": [2], "next": "NSwy"}
    label: all timestamps equal
    hidden: true
hints:
  - "Decode the cursor to (t, i) and keep rows whose (created_at, id) pair compares strictly less than (t, i)."
  - "There is a next page exactly when more than `limit` rows remain after the cursor."
```

## Errors: tell the caller what to do next

A useful error answers three questions for the calling code: was it the caller's fault, can a retry help, and when.

| Style | Status signal | Machine-readable detail | Retry hint |
|---|---|---|---|
| REST | HTTP status: 4xx caller, 5xx server | Problem Details (RFC 9457), `application/problem+json` | `Retry-After` on 429 and 503 |
| GraphQL | HTTP 200; entry in `errors` with a `path` | `extensions.code` | A custom `extensions` field |
| gRPC | `grpc-status` code | `google.rpc.Status` details (`ErrorInfo`, `BadRequest`) | `RetryInfo`; `UNAVAILABLE` means retry with backoff if the call is idempotent |

```text
HTTP/1.1 429 Too Many Requests
Content-Type: application/problem+json
Retry-After: 30

{"type": "https://api.example.com/problems/rate-limited", "title": "Too many requests",
 "status": 429, "detail": "This API key is limited to 100 requests per minute.",
 "instance": "/v1/orders", "request_id": "7f3a9c02"}
```

The status tells generic infrastructure what happened, `type` is a stable code for client logic, `Retry-After` says when to come back, and `request_id` joins a support ticket to a trace. It must not contain a stack trace, SQL or internal host names. Gateways that expose gRPC as REST map codes (`INVALID_ARGUMENT` to 400, `NOT_FOUND` to 404, `RESOURCE_EXHAUSTED` to 429, `UNAVAILABLE` to 503, `DEADLINE_EXCEEDED` to 504). GraphQL allows partial success, one failed field with `data` for the rest, and servers speaking plain `application/json` answer it with 200, so dashboards that count 5xx see nothing; monitor the `errors` array. The GraphQL-over-HTTP working draft moves towards status codes that intermediaries can count: with its `application/graphql-response+json` media type, a request that produced no data gets a 4xx or 5xx, and a partial success gets a custom `294`.

```viz
{"type": "system", "scenario": "token-bucket", "requests": 10, "title": "A token bucket per API key decides when to answer 429", "caption": "Capacity sets the burst a client may send; the refill rate sets its sustained rate. A rejected request should carry Retry-After computed from when the next token arrives."}
```

`Retry-After` should be computed, not constant. A bucket of capacity 100 refilling at 100 tokens per minute gains one token every 0.6 s, so an empty bucket answers `Retry-After: 1` (the header takes whole seconds); a client told to wait 30 s by a hard-coded value either waits too long or, if every client gets the same number, returns in a synchronised wave at second 30.

Only errors that mean "nothing happened" (a 429, or a 503 sent before processing) are safe to retry blindly. gRPC's `UNAVAILABLE` is not on that list: the [status-code documentation](https://github.com/grpc/grpc/blob/master/doc/statuscodes.md) warns that retrying non-idempotent operations is not always safe, because the same code covers a connection that broke after some of the request had already been sent. A timeout, a 500 after processing began, or an `UNAVAILABLE` on a write needs an idempotency key first. [Rate limiting algorithms](/learn/networking/network-algorithms/rate-limiting-algorithms) covers the limiters.

## Versioning and evolution

| Style | How versions work | Removing something | Signal to clients |
|---|---|---|---|
| REST | Major version in the path (`/v1`) or media type; additive changes within it | Ship `/v2` alongside, migrate, retire `/v1` | `Deprecation` (RFC 9745) and `Sunset` (RFC 8594) response headers, docs |
| GraphQL | One evolving schema, no versions | Add the replacement, mark the old field `@deprecated(reason: ...)`, watch per-field usage by client until it reaches zero, then remove | Introspection shows deprecations |
| gRPC | Protobuf compatibility rules; package `v1`, `v2` for breaks | `reserved` numbers; new package for breaking changes | `deprecated = true` option (`@Deprecated` in Java; no effect in most languages) |

In every style, adding optional fields is safe only if clients are **tolerant readers** that ignore unknown fields; adding an enum value breaks a client with an exhaustive `switch`; making an optional input required breaks every old caller. Mobile clients stay installed for years, so "remove" really means "measure usage, then remove". [API design and versioning](/learn/system-design/building-blocks/api-design-and-versioning) covers the organisational side.

## Production failure modes

| Failure | Symptom | Diagnosis | Fix |
|---|---|---|---|
| GraphQL N+1 | Database or downstream QPS jumps after a schema change; p99 rises with list length | Traces show one backend call per list item | DataLoader per request; batch endpoints downstream |
| Expensive query | One client's query saturates the servers | Query logs show deep nesting or huge `first` values | Cost and depth limits before execution; persisted queries only |
| Deep offset pages | Latency climbs with page number; crawlers hit page 10,000 | Plans show large OFFSET scans | Keyset cursors; cap offset depth |
| Duplicate side effects | Two orders or charges for one click during network trouble | Same client request id twice in logs, no idempotency key or key stored outside the transaction | Idempotency keys stored atomically with the effect |
| Invisible failures | 5xx dashboards green while users see errors | GraphQL `errors` or `grpc-status` not parsed | Protocol-aware metrics |
| Breaking change | Old app versions crash after a deploy | Removed or retyped field still used by old clients | Deprecate, measure usage, remove at zero |

## Trade-offs

| | REST | GraphQL | RPC (gRPC) |
|---|---|---|---|
| Unit of design | Resource | Type graph | Procedure |
| Who shapes the response | Server | Client, per query | Server, per method |
| Round trips for an aggregated view | Many, unless composite endpoints exist | One | One, if a method exists |
| Where N+1 lives | On the network | In the resolvers | In the method's implementation |
| HTTP caching | Native for `GET` | Only with persisted queries over `GET` | None |
| Error signal | HTTP status | `errors` array, HTTP 200 | `grpc-status`, HTTP 200 |
| Natural home | Public APIs, cacheable reads | First-party UIs with many screens and teams | Service to service |

Mixing is normal: gRPC between services, GraphQL or BFFs for first-party apps, REST for third parties. The mistake is choosing by fashion and then rebuilding, badly, the parts of HTTP the style threw away.

## Interviewer follow-ups

**"Your GraphQL p99 doubled after a new field shipped. What do you look for?"** Model answer: the new field's resolver making one call per parent object (an N+1 without a loader), then the query cost of clients requesting it inside large lists, then a downstream that lacks a batch endpoint. Common wrong answer: "GraphQL is slow; add caching", when the fan-out is the problem.

**"How do you make `POST /payments` safe to retry?"** Model answer: a client-generated idempotency key; the server stores key, body fingerprint, state and response in the same transaction as the payment, replays on a match, answers 409 while in progress and 422 for a different body, and expires keys after the retry window. Common wrong answer: "check whether a payment with the same amount exists", which blocks legitimate repeat purchases and races.

**"Why is page 10,000 slow, and what replaces it?"** Model answer: `OFFSET` walks and discards every earlier row (200,000 for page 10,000 at 20 per page, 2 ms against 0.004 ms for keyset even in memory), and it duplicates or skips rows under writes; a keyset cursor on a total order uses the index for every page. Common wrong answer: "add an index", when the index is already used and the rows must still be walked.

**"REST, GraphQL or gRPC for a new public API?"** Model answer: REST, for universal clients, CDN caching and familiar semantics, possibly generated from the same contract that drives internal gRPC. Common wrong answer: "GraphQL, because clients can ask for anything", which hands third parties an unbounded cost surface.

## What mid-level engineers get wrong

- **Adding GraphQL without DataLoader**, turning one screen into dozens of backend calls.
- **Sharing a DataLoader cache across requests**, which serves stale or other users' data.
- **Exposing arbitrary queries publicly** without depth and cost limits.
- **Writing the idempotency key outside the side effect's transaction**, so a crash still creates duplicates.
- **Using offset pagination for feeds** and exposing deep pages to crawlers.
- **Returning 200 for errors in REST**, or counting only 5xx for GraphQL and gRPC.
- **Removing a field because the current app no longer uses it**, while older installed versions still do.

## Senior signals

- You compare styles on one concrete payload: requests, dependent round trips, bytes and over-fetch, and you name where each style's N+1 went.
- You trace DataLoader batching per level of a query, keep its cache per request, and cap query cost before execution.
- You know which styles get HTTP caching and how persisted queries win it back for GraphQL.
- You treat idempotency as key, fingerprint, state and stored response in one transaction, with 409 for concurrent duplicates and 422 for a different body.
- You use keyset pagination on a total order with opaque cursors and can quantify the cost of `OFFSET` at depth.
- You design errors that say whether and when to retry, and you evolve APIs by measuring usage before removing anything.

## Check yourself

```quiz
- q: >-
    A team replaces a REST API with GraphQL for its mobile app. Round trips per screen drop from 20 to 1, but the title service now receives 20 separate lookups per home screen. What is the standard fix?
  options: ["Enlarge the title service's thread pool to cope", "Revert to REST, where each screen made its own calls", "Cache every GraphQL response at the CDN by its URL", "Batch resolver calls per request with a DataLoader"]
  answer: 3
  explanation: >-
    GraphQL moved the N+1 from the network to the resolvers. A per-request loader collects every title id requested in the same tick and issues one batched lookup, and also deduplicates repeated ids. Reverting brings back the 20 round trips; CDN caching by URL fails because every query is a POST to the same URL; more threads make the N+1 faster without removing it.
- q: >-
    A client retries POST /orders with the same Idempotency-Key but a different amount in the body. What should the server do?
  options: ["Process it as a new order with the new amount", "Reject it, for example with 422, creating nothing", "Update the original order to use the new amount", "Return the stored response from the first request"]
  answer: 1
  explanation: >-
    Reusing a key with a different body is a client bug; replaying the old response would hide it, and processing it would defeat the key. A concurrent retry with the same body gets 409 or waits, and a completed one with the same body gets the stored response.
- q: >-
    A feed API uses offset=20 and limit=20, sorted newest first. Between fetching page 1 and page 2, three new items are posted. What does the client see?
  options: ["Page 1's last three items reappear on page 2", "Page 2 silently skips three of the older items", "The request fails because the offset is stale", "Page 2 is correct, because offsets are stable"]
  answer: 0
  explanation: >-
    Offsets are positions, and insertions at the top shift every item down three places. Items 18 to 20 of the old ordering become 21 to 23 and are served again at the top of page 2. Deletions cause the opposite, skips. A cursor based on the last item's sort key is unaffected by inserts above it.
- q: >-
    With 20 items per page, why does page 10,000 of an OFFSET query take hundreds of times longer than page 1 even though an index matches the ORDER BY?
  options: ["The database walks and discards 199,980 rows first", "The query cache is invalidated for large offsets", "The index is ignored once the offset passes a limit", "Each page re-sorts the whole table in memory first"]
  answer: 0
  explanation: >-
    OFFSET means skip that many rows of the ordered result, and the only way to skip them is to walk them, even through a covering index. In the measurement, page 10,000 took 2.05 ms against 0.003 ms for page 1, while a keyset query after the last row of page 9,999 took 0.004 ms, because it seeks straight to the cursor position in the index.
- q: >-
    An operations dashboard counts HTTP 5xx responses at the load balancer and shows zero errors, but users of the GraphQL and gRPC APIs report failures. Why?
  options: ["Both styles report failures inside an HTTP 200 response", "The load balancer drops error responses before logging", "The CDN is caching 5xx responses and hiding them", "The failures are all client-side JavaScript errors"]
  answer: 0
  explanation: >-
    GraphQL allows partial success with errors listed in the errors array alongside data, and gRPC puts the call status in the grpc-status trailer after an HTTP 200, so HTTP-level metrics miss both. Monitoring must be protocol-aware.
- q: >-
    A public GraphQL API receives a query nesting users(first: 50), orders(first: 20) and items(first: 10). Why do servers compute a cost before executing it?
  options: ["Page sizes multiply, so it may touch over 20,000 nodes", "Deep queries are rejected by HTTP/2 frame size limits", "Nested queries cannot use DataLoader batching at all", "The response must be cached before it can be sent"]
  answer: 0
  explanation: >-
    Worst-case work multiplies down each path: 50 users, 1,000 orders, 10,000 items and 10,000 products, about 21,050 nodes. Estimating that before execution lets the server reject queries above a budget along with overly deep ones. DataLoader still batches such a query per level; it reduces calls, not the number of nodes.
```

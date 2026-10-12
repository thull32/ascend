---
lesson: api-styles
source: 198ce005c5bc34c3
---
## 1

A team replaces a REST API with GraphQL for its mobile app. Round trips per screen drop from 20 to 1, but the title service now receives 20 separate lookups per home screen. What is the standard fix?

A, enlarge the title service's thread pool to cope. B, revert to REST, where each screen made its own calls. C, cache every GraphQL response at the CDN by its URL. D, batch resolver calls per request with a DataLoader.

[think]

The answer is D: batch resolver calls per request with a DataLoader.

GraphQL moved the N plus 1 problem from the network into the resolvers. A per-request loader collects every title ID requested in the same tick and issues one batched lookup, and it also deduplicates repeated IDs. Reverting brings back the 20 round trips. Caching by URL fails because every query is a POST to the same URL, and more threads make the N plus 1 faster without removing it.

## 2

A client retries a POST to the orders endpoint with the same idempotency key, but a different amount in the body. What should the server do?

A, process it as a new order with the new amount. B, reject it, for example with a 422, creating nothing. C, update the original order to use the new amount. D, return the stored response from the first request.

[think]

The answer is B: reject it, for example with a 422, creating nothing.

Reusing a key with a different body is a client bug. Replaying the old response would hide it, and processing it would defeat the key. A concurrent retry with the same body gets a 409 or waits, and a completed one with the same body gets the stored response.

## 3

A feed API pages with an offset of 20 and a limit of 20, sorted newest first. Between fetching page 1 and page 2, three new items are posted. What does the client see?

A, page 1's last three items reappear on page 2. B, page 2 silently skips three of the older items. C, the request fails because the offset is stale. D, page 2 is correct, because offsets are stable.

[think]

The answer is A: page 1's last three items reappear on page 2.

Offsets are positions, and insertions at the top shift every item down three places. Items 18 to 20 of the old ordering become 21 to 23, and are served again at the top of page 2. Deletions cause the opposite: skips. A cursor based on the last item's sort key is unaffected by inserts above it.

## 4

With 20 items per page, why does page 10,000 of an offset query take hundreds of times longer than page 1, even though an index matches the sort order?

A, the database walks and discards 199,980 rows first. B, the query cache is invalidated for large offsets. C, the index is ignored once the offset passes a limit. D, each page re-sorts the whole table in memory first.

[think]

The answer is A: the database walks and discards 199,980 rows first.

An offset means skip that many rows of the ordered result, and the only way to skip them is to walk them, even through a covering index. In the lesson's measurement, page 10,000 took about 2 milliseconds against 3 microseconds for page 1, while a keyset query starting after the last row of page 9,999 took 4 microseconds, because it seeks straight to the cursor's position in the index.

## 5

An operations dashboard counts HTTP 500-class responses at the load balancer and shows zero errors, but users of the GraphQL and gRPC APIs report failures. Why?

A, both styles report failures inside an HTTP 200 response. B, the load balancer drops error responses before logging them. C, the CDN is caching the error responses and hiding them. D, the failures are all client-side JavaScript errors.

[think]

The answer is A: both styles report failures inside an HTTP 200 response.

GraphQL allows partial success, with errors listed in an errors array alongside the data, and gRPC puts the call's status in a trailer after an HTTP 200, so metrics at the HTTP level miss both. Monitoring must understand the protocol.

## 6

A public GraphQL API receives a query for the first 50 users, each user's first 20 orders, each order's first 10 items, and each item's product. Why do servers compute a cost before executing it?

A, the response must be cached before it can be sent. B, page sizes multiply, so it may touch over 20,000 nodes. C, nested queries cannot use DataLoader batching at all. D, deep queries are rejected by HTTP/2 frame size limits.

[think]

The answer is B: page sizes multiply, so it may touch over 20,000 nodes.

Worst-case work multiplies down each path: 50 users, 1,000 orders, 10,000 items and 10,000 products, about 21,050 nodes. Estimating that before execution lets the server reject queries over a budget, along with overly deep ones. DataLoader still batches such a query level by level; it reduces calls, not the number of nodes.

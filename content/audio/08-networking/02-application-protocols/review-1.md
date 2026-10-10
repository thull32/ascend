---
review: application-protocols
source: 4db0a519843c779c
---
## Introduction

Twelve questions from the application protocols module. Answer out loud before the answer comes.

They run in the order of the lessons: HTTP/1.1 caching and keep-alive, HTTP/2, real-time transports, gRPC, API styles, CDNs, and load balancing. Each one has four options, A to D, then a few seconds for you to commit to one.

## Question 1

A response carries a cache-control header of no-cache, together with a max-age of 3,600 seconds. A CDN receives a request for it 10 minutes later. What does the CDN do?

A, it revalidates with the origin, and serves its copy if the origin answers 304. B, it serves its copy only to requests with no authorization header. C, it serves its copy, since 10 minutes is within the max-age. D, it refuses to store the response, so every request goes to the origin.

[think]

The answer is A: it revalidates with the origin and serves its copy on a 304.

No-cache allows storage but requires revalidation before every use, whatever max-age says. The CDN sends a conditional request and serves its stored body if the origin answers 304. Refusing to store is no-store, a different directive. And an authorization header affects whether a shared cache may store a response, not revalidation.

## Question 2

A Node.js service with the default 5-second keep-alive timeout sits behind a load balancer whose idle timeout is 60 seconds. About one request in a few thousand gets a 502 that no application log records, mostly at low traffic. Which change fixes the cause?

A, set the backend's keep-alive timeout above 60 seconds. B, raise the backend's maximum header size to 64 kibibytes. C, lower the backend's keep-alive timeout to 1 second. D, make the load balancer retry failed POST requests.

[think]

The answer is A: set the backend's keep-alive timeout above 60 seconds.

The balancer reuses a connection at the very moment the backend's 5-second idle timer closes it, and gets a reset. The side that reuses connections must have the shorter idle timeout, so the backend's must exceed 60 seconds. A shorter backend timeout makes the race more frequent, and retrying POSTs risks duplicate side effects.

## Question 3

A mobile app on a lossy cellular link moves from HTTP/1.1 over six connections to HTTP/2 over one. Median latency improves, but the 95th percentile gets worse. What is the most likely cause?

A, the server is ignoring HTTP/2's priority tree entirely. B, HTTP/2 disables TLS session resumption on each reconnect. C, one lost TCP segment now stalls every multiplexed stream. D, header decompression is CPU-bound on the phone's processor.

[think]

The answer is C: one lost TCP segment now stalls every multiplexed stream.

All HTTP/2 streams share one ordered TCP byte stream, so a single loss blocks all of them until the retransmission arrives. With six HTTP/1.1 connections, a loss stalls only one connection's work. At 1 percent loss and 100 packets per round trip, about 63 percent of round trips contain a loss. Priorities, resumption and header compression do not produce this tail.

## Question 4

A build-log page streams lines from the server, and the user never sends anything after opening the page. Which transport is the best default, and why?

A, WebRTC data channels, because large logs need direct peer-to-peer bandwidth. B, long polling, because build logs are bursty and each burst fits one response. C, Server-Sent Events, because the flow is one-way, plain HTTP, with automatic reconnection. D, WebSockets, because a persistent socket gives the lowest latency for log lines.

[think]

The answer is C: Server-Sent Events, because the flow is one-way plain HTTP with automatic reconnection.

One-directional server push is exactly the case Server-Sent Events were made for: no protocol upgrade, automatic reconnection that resumes from the last event ID, and every proxy, CDN and mesh passes it. WebSockets add a two-way channel nobody uses and a hand-written reconnect loop. Their latency edge only matters when the client sends often.

## Question 5

After scaling a gRPC service from 3 to 12 pods behind a Kubernetes ClusterIP service, only the original 3 pods receive traffic. What is the cause?

A, ClusterIP picks a pod per connection, not per call. B, gRPC clients cap each service at three backends. C, each pod caches its own copy of the protobuf schema. D, the new pods are failing their readiness checks.

[think]

The answer is A: ClusterIP picks a pod per connection, not per call.

An L4 balancer such as ClusterIP decides once per TCP connection. gRPC multiplexes every call as a stream over long-lived HTTP/2 connections that were opened when only 3 pods existed, so the new pods get nothing until clients reconnect. Per-request balancing, through an L7 proxy or client-side round robin over all pod addresses, or a server-side maximum connection age, fixes it.

## Question 6

The edge sets a 300 millisecond deadline, spends 10 milliseconds, and calls service A. A spends 40 milliseconds and calls service B. What timeout should A pass to B, and what happens to B's work if the edge gives up?

A, 300 milliseconds, and B finishes its work even after the edge gives up. B, about 250 milliseconds, and the cancellation propagates so B stops. C, no timeout, because B should always complete what it started. D, about 250 milliseconds, and B keeps working until its own budget ends.

[think]

The answer is B: about 250 milliseconds, and the cancellation propagates so B stops.

A received about 290 milliseconds and has used 40, so it passes on the remainder, less any reserve it keeps for a fallback. When the edge's deadline fires, it cancels its stream, A's context is cancelled, and that cancellation travels on to B, so B stops rather than working for a caller that has left. A fresh 300 milliseconds per hop, or no deadline at all, lets the chain outlive the request.

## Question 7

A team replaces a REST API with GraphQL for its mobile app. Round trips per screen drop from 20 to 1, but the title service now receives 20 separate lookups per home screen. What is the standard fix?

A, enlarge the title service's thread pool to cope. B, revert to REST, where each screen made its own calls. C, cache every GraphQL response at the CDN by its URL. D, batch resolver calls per request with a DataLoader.

[think]

The answer is D: batch resolver calls per request with a DataLoader.

GraphQL moved the N plus one problem from the network into the resolvers. A per-request loader collects every title ID requested in the same tick and issues one batched lookup, and it deduplicates repeated IDs too. Reverting brings back the 20 round trips. Caching by URL fails because every query is a POST to the same URL. And more threads make the N plus one faster without removing it.

## Question 8

A client retries a POST to the orders endpoint with the same idempotency key, but a different amount in the body. What should the server do?

A, process it as a new order with the new amount. B, reject it, for example with a 422, creating nothing. C, update the original order to use the new amount. D, return the stored response from the first request.

[think]

The answer is B: reject it, for example with a 422, creating nothing.

Reusing a key with a different body is a client bug. Replaying the old response would hide it, and processing it would defeat the key. A concurrent retry with the same body gets a 409 or waits, and a completed one with the same body gets the stored response.

## Question 9

A campaign email links to a cached landing page, and the origin is overwhelmed despite a five-minute TTL at the CDN. Each link contains a unique tracking ID in its query string. What is the best fix?

A, allowlist only the query parameters that matter in the cache key. B, raise the TTL to one day so entries live longer. C, add a vary header on user agent so each device gets its own copy. D, purge the page every minute to keep it fresh.

[think]

The answer is A: allowlist only the query parameters that matter.

Every unique URL is a separate cache entry, so the hit ratio is near zero whatever the TTL. A cache key that includes only the parameters that change the response maps every recipient's URL to the same key and restores sharing. Varying on user agent would fragment the cache further, and purging only creates more misses.

## Question 10

Edges hit 95 percent of requests. A shield tier is added that hits 70 percent of the requests the edges miss. What fraction of requests now reaches the origin?

A, half a percent. B, 5 percent. C, 3 and a half percent. D, 1 and a half percent.

[think]

The answer is D: 1 and a half percent.

Origin traffic is the edge miss rate times the shield miss rate: 5 percent of 30 percent, which is 1.5 percent. The shield cut origin load by more than two thirds without changing anything about the edges.

## Question 11

All 40 instances fail their health checks when a shared database has a 30-second blip, and the load balancer serves errors for every request. Which two changes most directly prevent this?

A, switch from L7 to L4 balancing, and lower the check timeouts. B, enable sticky sessions, and raise the healthy threshold count. C, shorter check intervals, and more instances in the pool. D, keep the database out of the readiness check, and add a panic threshold.

[think]

The answer is D: keep the database out of readiness, and add a panic threshold.

The check made every instance share the database's fate, and the balancer had no rule for everything looking down at once. Readiness should reflect the instance's own ability to serve. A panic threshold treats most hosts failing together as a probable checking problem, and uses all of them. Faster checks or more instances would all fail the same check together.

## Question 12

Why does power of two choices beat always picking the globally least-loaded backend, when many independent balancers share a fleet?

A, it works without any load information about the backends. B, two samples cut the imbalance, and the randomness stops herds. C, it guarantees perfectly even load across all of the backends. D, it removes the need for health checks on the backends.

[think]

The answer is B: two samples cut imbalance, and randomness stops herds.

With stale counts, every balancer that picks the global minimum sends its traffic to the same idle host at once. Comparing two random hosts keeps most of the benefit, a maximum load of about 3 instead of 5 to 8 in the simulation, while different balancers pick different targets. It still needs in-flight counts, and it promises no perfect balance.

## Recap

Three ideas kept coming back. Long-lived connections decide where load goes: HTTP/2 and gRPC pin every call to the connection's backend, so balance per request or cap connection age. Caches are only as good as their keys and directives: no-cache means revalidate, tiers multiply miss ratios, and a unique query string defeats everything. And failures hide where generic tools do not look, from a keep-alive race that logs nothing to a health check that ejects the whole fleet.

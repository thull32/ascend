---
lesson: connection-pooling-and-keep-alive
source: 5f0f8359c3846d28
fit: great
desk:
  - "The reuse measurements, including the Nagle and delayed-acknowledgement stall"
  - "The 502 race traced as a timeline, and the idle-gap measurement table"
  - "Server keep-alive defaults and library defaults, with the Go transport settings"
  - "The HTTP/2 coalescing misroute, step by step"
  - "Exercise: watch a pool become a queue"
---
## Introduction

An order service calls a payment service with a 50 millisecond round trip. Opened fresh, each call pays a TCP handshake, then a TLS handshake, then the request itself, plus the CPU for the key exchange on both ends. Over a warm connection, the same call is one round trip. That is why every serious HTTP client, database driver and proxy keeps a pool of open connections.

But a pool is a cache, and it has every problem a cache has. It must be sized. Its entries go stale: the server closed the connection, or a NAT forgot it. It needs invalidation: DNS changed, and a pooled connection keeps talking to the old address. And unlike most caches, when it runs dry, callers wait. That makes it a queue no dashboard on the server side can see.

Four ideas, then. What reuse actually saves. The idle-timeout race behind the classic 502. Sizing a pool, and why the cap is a bulkhead. And the ways a long-lived connection outlives the world it was opened in.

## What a pool is, and what reuse saves

A pool keeps a set of open connections per origin. A request checks out an idle one, or opens a new one if the pool is under its cap, and checks it back in when the response is complete. If the pool is full and nothing is idle, the request waits.

With HTTP/1.1, a connection carries one request at a time, so the number of connections is your concurrency to that host. With HTTP/2, one connection multiplexes many streams, often a hundred, so a single connection per origin is often enough, and the pool's job becomes keeping that one healthy.

The lesson measured reuse at a 50 millisecond round trip. A fresh TCP and TLS request: about 152 milliseconds, three round trips. A reused connection: about 50, one round trip. Each fresh TLS request also cost one and a half to nearly two milliseconds of CPU across client and server, against a tiny fraction of that for a reused one. At tens of thousands of requests a second, that is whole cores.

One aside from that experiment. The first run measured 44 milliseconds for a fresh TLS request with no added delay at all. The server had Nagle's algorithm on, so its second handshake write waited for an acknowledgement that the client's kernel delayed by about 40 milliseconds. Turning on no-delay fixed it. Handshakes are small writes in quick succession, exactly the pattern Nagle and delayed acknowledgements punish, and pools hide that by handshaking rarely.

A connection is only reusable once the previous response has been read to the end. A client that stops reading halfway, or never closes the response body, cannot return the connection, so the pool opens another, and another. In Go, it is forgetting to drain and close the body. The symptom is a connection count that grows with traffic until something runs out of file descriptors.

## The classic 502

Every hop that holds idle connections has an idle timeout, and they must be ordered. Here is the rule: the side that sends requests must give up on an idle connection before the side that receives them. A load balancer is the client of its backends, so the backend's keep-alive timeout must be longer than the balancer's.

The textbook mismatch: an AWS Application Load Balancer, idle timeout 60 seconds by default, in front of Node.js, whose keep-alive timeout is 5 seconds by default. Before I trace it: who closes the connection first, and what does the user see?

[pause]

The backend. Five seconds after its last response, Node.js closes the socket and sends a FIN. The balancer still thinks the connection is idle and usable for another 55 seconds. If a request picks that connection an instant before the FIN arrives, it is already on the wire. It reaches a socket that no longer exists, the backend's kernel answers with a reset, and the balancer returns a 502 to the user.

The window is about one round trip wide, which is why these 502s are sporadic and never reproduce on demand. The lesson measured it with a one-second server timeout and a 10 millisecond round trip. Reuse after an idle gap of up to 990 milliseconds: fine. Between 992 milliseconds and the full second: failed, even with a check that the idle socket was readable, because the FIN had not arrived yet. Just after the second: the check caught it and reconnected. No client-side check closes a race whose width is the round trip. Only ordering the timeouts does.

The fix, in order. Raise the backend's keep-alive above the balancer's idle timeout, 61 seconds or more for that balancer. Set client pools' idle expiry below every server's timeout on the path. And let clients retry idempotent requests that fail on a reused connection before any response byte arrived, on a fresh connection. Raising the balancer's timeout, or lowering the backend's, makes the inversion wider.

A related trap is TCP keepalive, which is a different mechanism with a similar name. Linux waits two hours before its first probe, far longer than the few minutes after which many NAT gateways and firewalls forget an idle flow. A pooled connection idle for ten minutes behind such a box may be dead without either end knowing. Set probes below the smallest idle timeout on the path, or simply keep the pool's idle timeout below it.

## Sizing, and the bulkhead

Little's law sizes a pool. Connections in use equal the request rate times how long each request holds a connection. 2 thousand requests a second at 12 milliseconds is 24 connections. When the dependency has a bad minute and latency rises to 50 milliseconds, that is 100. A reasonable cap is around 64 to 128: enough for peaks and a wobble, not enough for 2 thousand requests to sit on 2 thousand connections.

Run it the other way and you get the pool's capacity. Ten connections to a service with 20 millisecond responses carry at most 500 requests a second. At 600, the line grows by a hundred requests every second. And the downstream's dashboards show 20 milliseconds and a calm 500 a second, because the queue is inside your process. When the dependency is fast but calls to it are slow, check the pool's wait time first.

That arithmetic is also why the cap is a bulkhead. If the dependency slows from 20 milliseconds to 2 seconds, the connections needed at the same traffic rise a hundredfold. An uncapped pool opens them all, piling load onto a struggling dependency while your threads wait on it. A capped pool with a short acquire timeout fails the excess fast, keeps your service responsive for everything that does not need that dependency, and leaves the dependency room to recover.

Database pools have one more job: protecting the database from you. Postgres runs one process per connection, and its throughput peaks at a small multiple of the core count. Then multiply. Sixty pods, four worker processes each, a pool of 10 per process: 2,400 connections once traffic fills the pools. With the database allowing 500, the scale-out that took you to sixty pods is the one that starts failing with too many clients. Size pools from the database's budget divided across the fleet, and put a transaction-mode pooler such as PgBouncer in between, so thousands of client connections share a few dozen server connections.

## Connections that outlive the world

Here is a fact that surprises people. DNS is consulted when a connection is opened. A pooled connection keeps using that address for as long as it lives, whatever the TTL says.

Walk through a database failover. The record has a 30 second TTL. Each instance holds 20 connections opened hours ago. The old primary is demoted and the record updated. After 30 seconds every resolver has the new address, and the pool still holds 20 connections to the old one. If the old primary is still up as a read-only replica, those connections are perfectly healthy, and every write fails with a read-only error, indefinitely, until someone restarts the service. Keepalive will not help: the connections are alive.

Max lifetime bounds it. With a lifetime of 5 minutes, every connection is replaced within 5 minutes, and each replacement resolves the name again. Add about 10 percent jitter, so a pool opened all at once does not reconnect all at once.

The same stickiness breaks load balancing. Scale a gRPC service from four instances to eight behind a layer 4 balancer, and the four new ones sit almost idle. A layer 4 balancer balances connections, not requests, and HTTP/2 multiplexes every request a client makes over one long-lived connection. The fixes: balance per request at layer 7, with a proxy or sidecar; balance on the client side, with a connection to every backend; or give the server a maximum connection age, after which it sends GOAWAY and the client reconnects, possibly elsewhere.

And one HTTP/2 twist: coalescing. A browser holding a connection to api dot example dot com may send a request for static dot example dot com over it, if the certificate covers both names and the address matches. If a TLS-passthrough proxy routes whole connections by the name in the first handshake, the static request lands on the API cluster and gets a 404. The protocol's way out is 421, Misdirected Request: the server answers it, and the client retries on a new connection. Or route by the request's authority at layer 7.

Last, the defaults that bite. Go's default transport keeps only two idle connections per host, so at a concurrency of 100, 98 connections are closed after every use: a handshake per request and thousands of sockets waiting out their close. And not pooling at all has a hard ceiling: every new connection needs a fresh local port, and the side that closes first holds it for 60 seconds, which caps you at about 470 new connections a second to one backend on Linux's usual port range before connect fails.

## In the interview

A follow-up the lesson expects. Your load balancer returns occasional 502s, always on the first request after a pause. What is your hypothesis, and how do you prove it?

[pause]

An idle-timeout inversion. The backend closes idle connections before the balancer does, and a request races the FIN. Compare the two timeout settings, capture on the backend side for the pattern FIN, then a request, then a reset, and fix the ordering. The wrong answer is "the backend is crashing". That would show errors in its logs.

And the simplest one: how big should a connection pool be? Little's law, rate times time per request, sized for the latency of a bad minute rather than the mean. Capped as a bulkhead with a short acquire timeout. And for databases, bounded by the server's budget divided across the fleet. The wrong answer is "as big as possible so nothing waits", which removes the bulkhead and overloads the database.

## Recap

Four things to remember. Reuse turns three round trips into one and saves real CPU, but only if bodies are drained and clients are shared. Order idle timeouts so the side that sends requests closes first: Node's 5 seconds behind a 60 second balancer is the classic 502. Size pools with Little's law for a bad minute, cap them as bulkheads, and multiply across the fleet before you scale out. And DNS changes do not reach open connections, so give pools a max lifetime with jitter, and balance HTTP/2 per request, not per connection.

At your desk: the reuse measurements, the 502 timeline and idle-gap table, the server and library defaults, the coalescing misroute, and the pool-as-a-queue exercise.

---
lesson: connection-pooling-and-keep-alive
source: 8ddf6b4c16213c57
---
## 1

A service makes 1,500 requests per second over HTTP/1.1 to a dependency with a mean latency of 40 milliseconds. About how many pooled connections are in use on average?

A, about 1,500. B, about 60. C, about 6. D, about 600.

[think]

The answer is B: about 60.

Little's law: 1,500 a second times 40 milliseconds is 60 connections in use on average. HTTP/1.1 carries one request per connection at a time, so this is also the concurrency. Size the cap above this for peaks and latency spikes, but nowhere near 1,500.

## 2

An AWS Application Load Balancer with a 60 second idle timeout fronts Node.js servers left at their 5 second keep-alive default. Users see rare 502s. What is the fix?

A, raise the load balancer's idle timeout to ten minutes. B, raise the backends' keep-alive timeout above 60 seconds. C, lower the backends' keep-alive timeout to one second. D, enable TCP keepalive probes on the Node.js sockets.

[think]

The answer is B: raise the backends' keep-alive timeout above 60 seconds.

The balancer is the client of the backend connection, so it must be the side that gives up on an idle connection first. With the backend closing at 5 seconds, a request the balancer sends while the close is in flight meets a closed socket and a reset, and the balancer returns 502. Raising the balancer's timeout, or lowering the backend's, widens the inversion, and TCP keepalive probes do not stop an application-level idle close.

## 3

After scaling a gRPC service from 4 to 8 instances behind a layer 4 load balancer, the 4 new instances get almost no traffic. Why?

A, long-lived HTTP/2 connections stay on the old four. B, the new instances are failing their health checks. C, gRPC clients do not support load balancing at all. D, clients cache DNS answers past the record's TTL.

[think]

The answer is A: long-lived HTTP/2 connections stay on the old four.

Layer 4 balancing picks a backend only when a connection opens. Existing clients keep their long-lived connections, and HTTP/2 multiplexes every request over them, so all their traffic stays on the original instances. Use layer 7 or client-side balancing, or a server-side maximum connection age, so clients reconnect and redistribute.

## 4

A database fails over by updating a DNS record with a 30 second TTL. Ten minutes later, one service is still failing every write with read-only transaction errors. What is the most likely cause?

A, old pooled connections still reach the old primary. B, TCP keepalive is disabled on the service's sockets. C, resolvers are ignoring the record's 30 second TTL. D, the new primary is too overloaded to accept writes.

[think]

The answer is A: old pooled connections still reach the old primary.

DNS is consulted when a connection opens. Old connections to a demoted primary, which is now a healthy read-only replica, never error at the network level, so nothing forces a reconnect, and the pool keeps them; keepalive would find them perfectly alive. A bounded maximum lifetime, or closing connections that report a read-only server, makes the failover converge.

## 5

Browsers get 404s for static dot example dot com, but only when api dot example dot com was loaded first. Both names resolve to one address that holds a wildcard certificate, and a proxy that passes TLS straight through routes connections by the server name sent in the handshake. What is happening?

A, the browser's DNS cache maps the static name to the api name. B, the wildcard certificate fails validation for the static name. C, HTTP/2 connection coalescing sends static requests over the api connection. D, the proxy strips the host header on reused TLS sessions.

[think]

The answer is C: HTTP/2 connection coalescing sends static requests over the api connection.

The connection's certificate covers both names and the address matches, so the browser reuses the api connection for static requests. The proxy routed that connection by the first name it saw, api, so the static request reaches the API cluster. Route by each request's authority at layer 7, answer 421, Misdirected Request, for hosts the connection's backend does not serve, or stop sharing the certificate and address.

## 6

Sixty pods each run 4 worker processes with a database pool of 10, and the database allows 500 connections. What happens once load fills the pools, and what is the standard fix?

A, connections are refused, so put PgBouncer in front. B, the database queues the extra connections itself. C, nothing, because the pools connect only lazily. D, throughput roughly doubles with the extra pools.

[think]

The answer is A: connections are refused, so put PgBouncer in front.

Pools multiply across pods and processes: 60 times 4 times 10 is 2,400 attempted connections. Beyond the database's maximum, new ones fail with "too many clients" rather than queueing. Size pools from the database's budget, and put a transaction-mode pooler such as PgBouncer in front: it multiplexes many client connections onto a few server connections, which also keeps the database near its throughput peak.

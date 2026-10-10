---
review: networking-in-practice
source: 180a3e34b6482748
---
## Introduction

Twelve questions from the networking-in-practice module. Answer out loud before the answer comes.

Three from latency and bandwidth, three from timeouts and retries, then two each from connection pooling, debugging the network, and service meshes. Each one has four options, A to D, then a few seconds for you to commit to one.

## Question 1

A single TCP connection between two data centres, with a 100 millisecond round trip, is transferring at 5 megabits a second on a 10 gigabit link, with zero packet loss. What is the most likely limiting factor?

A, the propagation delay of the fibre. B, the receive window is capped at 64 kilobytes. C, the link is saturated by other traffic. D, the application is CPU-bound.

[think]

The answer is B: the receive window is capped at 64 kilobytes.

Throughput is at most the window divided by the round trip. 64 kilobytes every tenth of a second is 640 kilobytes a second, about 5 megabits, exactly the observed rate. Zero loss rules out congestion, and propagation sets the round trip but not the ceiling for a given window. Check the advertised window and the receive-window-limited share in the kernel's socket statistics, and the window-scale option in a capture.

## Question 2

A page fans out to 100 backends in parallel and must meet its 99th percentile latency target. At which percentile must each backend meet that same latency?

A, at its 99.99th percentile. B, at its 99.9th. C, at its 99.999th. D, at its 99th.

[think]

The answer is A: at its 99.99th percentile.

The page is fast only if all 100 calls are fast, so each must be fast with probability 0.99 to the power of one hundredth, about 0.9999. Holding each backend's 99th percentile at the target leaves only about 37 percent of pages fast. The lesson's simulation confirmed it: the page's 99th percentile landed at a single backend's 99.99th.

## Question 3

On a 50 millisecond path, a 1 megabyte response on a long-lived connection took one round trip when requested back to back, but four round trips after the connection sat idle for one second. What explains the difference?

A, the receive window shrinks back to 64 kilobytes when idle. B, an idle connection must repeat its TCP handshake. C, the kernel halves the congestion window for each retransmission timeout of idle time. D, Nagle's algorithm holds the first segment after idle.

[think]

The answer is C: the kernel halves the congestion window for each retransmission timeout of idle time.

With slow start after idle switched on, which is the default, Linux restarts the congestion window after an idle period longer than the retransmission timeout, so the transfer slow-starts again. With that setting off, the same idle case took one round trip. The receive window and the handshake are unaffected by idleness, and Nagle does not delay full-sized segments.

## Question 4

A request to create an order, a POST with a 500 millisecond read timeout, times out. The order service does not support idempotency keys. What should the client do?

A, do not retry; surface the ambiguous outcome. B, send a GET first, then retry the POST if the order is absent. C, retry after a jittered exponential backoff delay. D, retry immediately, since timeouts are usually transient.

[think]

The answer is A: do not retry, and surface the ambiguous outcome.

A read timeout means the server may have created the order. Without an idempotency key, a retry, with or without backoff, risks a duplicate. And a GET cannot reliably tell whether a create that is still running will land. Connect failures are retryable; ambiguous outcomes on non-idempotent operations go back to the caller.

## Question 5

A gRPC channel uses retry throttling with a maximum of 10 tokens and a token ratio of 0.1. Above roughly what failure rate do retries stay switched off?

A, about 9 percent of attempts. B, about 50 percent. C, about 1 percent. D, about 90 percent.

[think]

The answer is A: about 9 percent of attempts.

Each failure costs one token and each success earns a tenth of one. So the bucket drains whenever failures outnumber successes by more than one to ten, which is a failure rate above one in eleven, about 9 percent. The tokens then sink below half the maximum and retries stop. The 50 percent option confuses the token threshold with a failure rate.

## Question 6

In the lesson's simulation of a thousand clients, plain exponential backoff without jitter took nearly 33 seconds to drain the herd, while the jittered variants took 2 to 3.7 seconds. Why?

A, every client reached the 10 second cap on its very first retry. B, retries arrived in synchronised waves separated by idle buckets. C, the server penalised deterministic retries with longer queues. D, its sleeps were shorter, so more retries were rejected outright.

[think]

The answer is B: retries arrived in synchronised waves separated by idle buckets.

Without jitter, every rejected client computes the same sleep, so the herd arrives together at 110 milliseconds, 320, 730, and so on. Each wave gets one bucket's worth of admissions, and the buckets in between sit idle. Jitter spreads the same clients across those idle buckets. The sleeps were the same length, not shorter, and the cap is reached only after several doublings.

## Question 7

An AWS Application Load Balancer with a 60 second idle timeout fronts Node.js servers left at their 5 second keep-alive default. Users see rare 502s. What is the fix?

A, raise the load balancer's idle timeout to ten minutes. B, raise the backends' keep-alive timeout above 60 seconds. C, lower the backends' keep-alive timeout to one second. D, enable TCP keepalive probes on the Node.js sockets.

[think]

The answer is B: raise the backends' keep-alive timeout above 60 seconds.

The balancer is the client of the backend connection, so it must be the side that gives up on an idle connection first. With the backend closing at 5 seconds, a request the balancer sends while the FIN is in flight meets a closed socket and a reset, and the balancer returns a 502. Raising the balancer's timeout or lowering the backend's widens the inversion, and keepalive probes do not stop an application-level idle close.

## Question 8

A database fails over by updating a DNS record with a 30 second TTL. Ten minutes later, one service is still failing every write with read-only transaction errors. What is the most likely cause?

A, old pooled connections still reach the old primary. B, TCP keepalive is disabled on the service's sockets. C, resolvers are ignoring the record's 30 second TTL. D, the new primary is too overloaded to accept writes.

[think]

The answer is A: old pooled connections still reach the old primary.

DNS is consulted when a connection opens. Connections to a demoted primary that is now a healthy read-only replica never fail at the network level, so nothing forces a reconnect, and keepalive would find them perfectly alive. A bounded maximum connection lifetime, or closing connections that report a read-only server, makes the failover converge.

## Question 9

mtr shows 45 percent loss at hop 6 of 11, and no loss at hops 7 to 11, including the destination. What do you conclude?

A, hop 6 is dropping almost half of the traffic through it. B, the destination host is down or intermittently up. C, the path is asymmetric, so the numbers mean nothing. D, hop 6 is only rate-limiting its replies to probes.

[think]

The answer is D: hop 6 is only rate-limiting its replies to probes.

If hop 6 really dropped forwarded traffic, every later hop and the destination would show at least that much loss. Loss that does not persist downstream is the router's control plane rate-limiting or deprioritising its own replies; traffic through it is fine. Only loss that continues to the destination counts.

## Question 10

A capture on a server shows client SYNs arriving and being retransmitted after about a second, with no SYN-ACK sent in between, and the listen-overflow counter is rising. What is happening?

A, the server replies with a reset, which is filtered out. B, the client's SYNs carry a bad TCP checksum. C, a firewall between the hosts drops the SYN-ACKs. D, the accept queue is full, so the kernel drops SYNs.

[think]

The answer is D: the accept queue is full, so the kernel drops SYNs.

Listen overflows count connections dropped because the accept queue was full, and the kernel drops the SYN after the capture point, so the capture shows SYNs arriving and never answered. A firewall dropping SYN-ACKs would leave SYN-ACKs visible on the server and no overflow counter. A reset would be visible in the capture, and checksum failures show up in their own counter instead.

## Question 11

An Envoy access log shows a 503 with the flag UO and a duration of zero milliseconds, for calls from orders to payments. What does it tell you?

A, no route is configured in the mesh for payments. B, the mutual TLS handshake between the sidecars failed. C, payments itself returned 503 because it is overloaded. D, the orders sidecar rejected the request at a concurrency cap.

[think]

The answer is D: the orders sidecar rejected the request at a concurrency cap.

UO is upstream overflow. The local proxy's circuit-breaker thresholds, which are concurrency caps such as the limit on pending requests, were full, so it failed fast in zero milliseconds and payments never saw the request. The cause is often a slow upstream holding requests open, or limits sized too small, but the 503 itself came from the caller's side. A missing route would be the flag NR.

## Question 12

In Istio ambient mode, which component enforces an authorisation policy that allows only POST on the charge path?

A, the ztunnel on the destination pod's node. B, the ztunnel on the source pod's node. C, the waypoint proxy that serves the destination. D, the istiod control plane, on each request.

[think]

The answer is C: the waypoint proxy that serves the destination.

ztunnel is a layer 4 proxy. It does mutual TLS, identity-based layer 4 authorisation and TCP telemetry, and never parses HTTP, so it cannot see methods or paths. Layer 7 policy runs in a waypoint, an Envoy deployed for the namespace or service account that the traffic is routed through. istiod only distributes configuration; it is never on the request path.

## Recap

Three ideas kept coming back. First, the arithmetic decides: the window divided by the round trip, fan-out to the 99.99th percentile, and a token bucket that switches retries off at about 9 percent failures. Second, ordering and ambiguity: the side that sends requests must close idle connections first, open connections ignore DNS changes, and a read timeout on a non-idempotent call is not retried. And third, read the evidence before you blame anyone: loss that does not reach the destination, a listen-overflow counter, a response flag that says the caller's own proxy said no.

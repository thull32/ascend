---
lesson: load-balancing
source: 7f7e75c48b6025b1
fit: great
desk:
  - "The L4 versus L7 table and the NAT, DSR and tunnelling comparison"
  - "The smooth weighted round robin trace, and the power-of-two-choices max-load table"
  - "The Envoy outlier-detection and panic-threshold configuration"
  - "Exercises: smooth weighted round robin, and power-of-two-choices least-requests"
---
## Introduction

The database fails over and is unreachable for 30 seconds. Every one of your 40 API instances has a health endpoint that runs a trivial database query, so every instance starts failing the load balancer's health checks. After three failed checks, the balancer marks all 40 unhealthy and has nowhere to send traffic, so it returns errors for every request, including the many that never touch the database. The database comes back after 30 seconds, but the instances need three consecutive passing checks at 10-second intervals to be readmitted, so the outage lasts another half a minute on top.

A partial dependency failure became a total outage, and the component that turned it into one was the load balancer, doing exactly what it was configured to do.

A load balancer makes three decisions. Which backends are eligible: that is health. Which one gets this request or connection: that is the algorithm. And whether it should go where the previous one went: that is affinity. It makes them with the information visible at its layer. So: what each layer sees, how the algorithms behave when backends are not identical, health-check timing, and the same ideas scaled to regions.

## L4 versus L7

A layer 4, or L4, balancer works on packets and connections. It sees addresses, ports and the protocol, picks a backend when a new connection arrives, and sends every later packet of that flow to the same place. It never sees HTTP, and TLS passes through it untouched. An L7 balancer is a proxy. It terminates TCP and usually TLS, parses each request, and uses its own pooled connections to backends. So it can route by host or path, balance each request separately, retry idempotent ones elsewhere, and report per-route metrics.

One consequence matters more than the rest. With HTTP/2 or gRPC, every stream on a connection sticks to one backend behind an L4 balancer, while an L7 balancer balances each stream. And terminating TLS at L7 means the proxy holds the private keys and pays the handshake CPU. A proxy that only needs the host name can read it from the TLS hello message and forward at L4 without decrypting.

An L4 balancer can forward in three ways. With NAT, it rewrites addresses and carries both directions. With direct server return, or tunnelling, the backend replies straight to the client, so the balancer carries only the small requests and not the large responses, which suits video. Tunnelling costs packet size: wrapping in another IP header adds 20 bytes, so operators clamp the maximum segment size. The lesson measured Cloudflare's edge advertising 1,400 bytes rather than the 1,460 a plain path allows, a 60-byte margin of the kind encapsulating networks keep.

Routers spread flows across many L4 machines, and a change can send the next packet of an established flow to a machine that has never seen it. Google's Maglev solves this by having every machine compute the backend from the same consistent-hash lookup table, so they all agree without coordinating. The lookup table handles new flows, and a local connection table protects existing ones.

## The algorithms

Start with round robin, which gives each backend its turn regardless of state. Twenty backends share a thousand requests a second, normally 20 milliseconds each. One degrades to 100 milliseconds: a noisy neighbour, a bad disk. Round robin still sends it 50 requests a second. So 5 percent of all requests are slow, and one sick machine sets the service's 95th percentile. By Little's law, it holds five requests in flight while its peers hold one.

Weighted round robin splits traffic in proportion to capacity, for mixed instance sizes or canaries. NGINX's smooth version interleaves the picks instead of sending a burst to the heaviest backend. That trace is one to follow at your desk.

Least outstanding requests sends each request to the backend with the fewest in flight. A slow backend accumulates in-flight work, and so receives less new work. Here is the formula, in words: in flight equals rate times latency. If the in-flight counts stay equal, a backend five times slower gets a fifth of the rate. Before I tell you: in the same example, what share of requests is slow now?

[pause]

About 1 percent instead of 5. The slow backend gets roughly 10 requests a second instead of 50. One note: count outstanding requests, not connections. "Least connections" is a stand-in that breaks once connections are reused or multiplexed.

But least-requests has two failure modes. Many balancers each see only their own counts, so all of them see a newly started backend at zero and send it everything at once: a herd that knocks over a cold instance. And finding the global minimum means scanning every backend on every request.

Power of two choices fixes both. Pick two backends at random, and send the request to the less loaded of the two. The lesson ran the classic experiment: place n items into n bins. With one random choice, the fullest bin held 5 to 8 items as n went from a thousand to a hundred thousand. With the better of two random choices, about 3. One extra sample halves the worst case. Just as important, randomness breaks the herd: balancers with stale counts do not all pick the same target, because each compares a different random pair. It is the default in Envoy's least-request policy, HAProxy's random balancer and Finagle.

Two more tools. Consistent hashing sends the same key to the same backend, which is right when the backend holds a warm cache or a local shard; with bounded loads, no backend takes more than a fixed multiple of the average, and the excess spills to the next. And slow start: a fresh instance has an empty cache and cold pools, so ramp it in. A linear ramp over 60 seconds gives it a quarter of a full share at 15 seconds and half at 30. One trap: an AWS application load balancer target group refuses slow start with least outstanding requests, so there you choose between the ramp and load awareness.

## Health checks

Active checks probe each backend on a schedule. Passive checks, called outlier detection, watch real traffic and eject a backend after, say, five consecutive errors. The difference is time. Same twenty backends, a thousand requests a second, and one dies by refusing connections, so it was getting 50 a second.

Active checks every 5 seconds, three failures to mark down, a 2-second timeout: worst-case detection is three times five plus two, 17 seconds, and about 850 failed requests meanwhile. With AWS's target-group defaults, 30-second intervals, two failures and a 5-second timeout, it is 65 seconds and over 3 thousand failed requests. Passive detection: five failed requests, about a tenth of a second. Recovery runs the same arithmetic in reverse: AWS's default of five healthy checks at 30 seconds means 150 seconds before a recovered backend gets traffic. Passive checks only see what traffic reveals, so an idle backend is never tested. That is why you combine the two.

Now back to the opening incident. It came from three mistakes. First, the check tested a shared dependency. If every instance calls the same database, a database failure fails every check at once. The check that removes an instance from rotation should answer one question: can this process serve requests? A service that cannot work without the database should fail requests fast behind a circuit breaker, not hide from the balancer.

Second, nothing failed open. When most backends look unhealthy at once, a broken check is likelier than forty simultaneous machine failures. Envoy's panic threshold, 50 percent by default, ignores health and balances across every host when fewer than half are healthy. An AWS application load balancer does the same when every target is unhealthy. And Envoy caps outlier detection so that it never ejects more than 10 percent of hosts.

Third, readmission was slow. High healthy thresholds add intervals of outage after the dependency returns.

## Draining and long-lived connections

Removing an instance for a deploy runs the same machinery deliberately. On the termination signal, start failing readiness while still serving. Wait until every balancer has noticed: the interval times the threshold, plus any deregistration delay. Then stop accepting, finish in-flight requests, close idle keep-alive connections so clients reconnect elsewhere, and exit. With a 5-second interval and a threshold of three, that wait is at least 15 seconds. Skip it, and every deploy produces a burst of connection errors.

Next, the long-lived connection problem. An L4 balancer is balanced only when connections are short and numerous. Four backends serve 400 HTTP/2 or gRPC client connections, 100 each, and you add four more. New backends receive only connections opened after they join, and a client that keeps one connection for days never moves. The old four stay hot; the new four idle.

The fix is a maximum connection age. If servers send a go-away after 300 seconds, each client reconnects within 300 seconds, and each reconnection can land on any of the eight backends. After one full age period, the expected split is 50 each. Add jitter, plus or minus 10 percent in gRPC's Go implementation, so clients do not reconnect in synchronised waves.

And sticky sessions, which pin a client to one backend, usually because sessions live in process memory. Heavy users stay put. With source-address hashing, thousands of users behind one carrier NAT become one client. When the pinned backend dies, its sessions die. And draining takes as long as the longest session. Move session state into a shared store or a signed cookie, and keep affinity only where losing it is harmless.

## Global load balancing

Across regions, the choice is again DNS or anycast. GeoDNS answers by resolver location, with fine control and failover bounded by TTLs. Anycast lets BGP deliver packets to the nearest region, with fast failover and coarse control.

But the hard constraint is capacity, not routing. If one of N regions fails, the rest absorb its traffic. So each region can run at no more than N minus one over N of its capacity at peak. Two regions: 50 percent. Three: about 67. Four: 75. Run each of two regions at 70 percent, and failover means 140.

Netflix's write-up of Project Nimble shows where the time goes. A regional failover took about 50 minutes, of which 3 to 5 went to provisioning and about 25 to instance start-up, because the clusters autoscale with daily traffic rather than idling at that headroom. Keeping pre-booted standby instances outside the serving path, sized by time of day, brought failover under 10 minutes. Headroom can be held as standby capacity rather than low utilisation, but it has to exist before the failover starts. The routing is the easy part.

## In the interview

Here is a follow-up the lesson expects. Why power of two choices, rather than always picking the globally least-loaded backend?

[pause]

Because with many balancers and stale counts, global least-loaded herds everyone onto the same idle host. Two random samples keep most of the benefit, a maximum load of about 3 instead of 5 to 8 in the simulation, while different balancers pick different targets. And it costs two lookups instead of a scan. The wrong answer is "it is only cheaper", which misses the herd.

And: you scaled from 4 to 8 gRPC backends and the new ones get nothing. Why? Connection-level balancing with long-lived HTTP/2 connections. Add a jittered maximum connection age so clients reconnect across all eight within one age period, or balance per request at L7 or in the client. The wrong answer is "restart the clients", which rebalances once and fails again at the next scale-out.

## Recap

Four things to remember. Choose the layer by what it must see, and never rely on L4 alone for HTTP/2 or gRPC. Quantify algorithms: one slow host in twenty makes 5 percent of requests slow under round robin and about 1 percent under least-requests, and power of two choices with slow start is the sensible default. Compute detection time from interval, threshold and timeout, combine active and passive checks, keep shared dependencies out of readiness, and set a panic threshold. And size regions for losing one: 50 percent with two, 67 with three.

At your desk: the layer and forwarding tables, the smooth weighted round robin trace and the two-choices table, the Envoy configuration, and the two exercises.

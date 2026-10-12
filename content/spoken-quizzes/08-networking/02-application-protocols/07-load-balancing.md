---
lesson: load-balancing
source: 569acdd392f74f58
---
## 1

One of 20 backends slows from 20 milliseconds to 100 milliseconds per request. With round robin, what share of requests is slow, and roughly what share with least outstanding requests?

A, every request slows by a fifth, under either algorithm. B, about 1 percent with round robin, and about 5 percent with least requests. C, about 5 percent with round robin, and about 1 percent with least requests. D, about 5 percent with round robin, and about 5 percent with least requests.

[think]

The answer is C: about 5 percent with round robin, and about 1 percent with least requests.

Round robin gives the slow host its full share, one in 20. Least requests keeps the in-flight counts roughly equal, and since in flight equals rate times latency, the slow host's rate falls to a fifth of a fast host's. Work that through for 19 fast hosts and one slow one, and the slow host gets about 1 percent of the traffic.

## 2

All 40 instances fail their health checks when a shared database has a 30-second blip, and the load balancer serves errors for every request. Which two changes most directly prevent this?

A, switch from layer 7 to layer 4 balancing, and lower the check timeouts. B, enable sticky sessions, and raise the healthy threshold count. C, shorter check intervals, and more instances in the pool. D, keep the database out of the readiness check, and add a panic threshold.

[think]

The answer is D: keep the database out of the readiness check, and add a panic threshold.

The check made every instance share the database's fate, and the balancer had no rule for everything looking down at once. Readiness should reflect the instance's own ability to serve. A panic threshold treats most hosts failing together as a probable checking problem, and uses all of them. Faster checks or more instances would all fail the same check together.

## 3

Why does the power of two choices beat always picking the globally least-loaded backend, when many independent balancers share a fleet?

A, it works without any load information about the backends. B, two samples cut the imbalance, and the randomness stops herds. C, it guarantees perfectly even load across all of the backends. D, it removes the need for any health checks on the backends.

[think]

The answer is B: two samples cut the imbalance, and the randomness stops herds.

With stale counts, every balancer that picks the global minimum sends its traffic to the same idle host at once. Comparing two random hosts keeps most of the benefit, a maximum load of about 3 instead of 5 to 8 in the lesson's simulation, while different balancers pick different targets. It still needs in-flight counts, and promises no perfect balance.

## 4

Active health checks run every 5 seconds, mark a host down after 3 failures, and time out after 2 seconds. A host starts refusing connections right after a successful check. Roughly how long until the balancer stops sending it traffic?

A, about 2 seconds. B, about 5 seconds. C, about 17 seconds. D, about 7 seconds.

[think]

The answer is C: about 17 seconds.

Three consecutive failed checks are needed, 5 seconds apart, plus the timeout of the last one: about 3 times 5, plus 2, which is 17 seconds, during which the host keeps its share of traffic. Passive outlier detection on real requests catches it within a few failed requests, which is why the two are combined.

## 5

A gRPC service scales from 4 to 8 backends behind a layer 4 balancer, and the new backends stay idle. Which change spreads the load without changing the balancer?

A, more HTTP/2 streams allowed per connection. B, sticky sessions keyed on the client's IP address. C, a longer idle timeout on the balancer. D, a jittered maximum connection age on the servers.

[think]

The answer is D: a jittered maximum connection age on the servers.

Clients hold long-lived HTTP/2 connections, and a layer 4 balancer only chooses when a connection opens. A maximum connection age makes servers send a go-away frame, so clients reconnect, and each new connection can land on any of the eight backends. Jitter prevents synchronised waves of reconnection. The other changes keep connections pinned longer.

## 6

A service runs active-active in three regions. What is the highest peak utilisation each region can run at, if the service must survive the loss of any one region without shedding load?

A, about 50 percent. B, about 67 percent. C, about 90 percent. D, about 33 percent.

[think]

The answer is B: about 67 percent.

If one of three regions fails, the other two must carry the whole load, so each needs capacity for 1.5 times its normal share: a normal utilisation of at most two thirds. With two regions the figure is 50 percent, and with four, 75. Global failover is a capacity plan before it is a routing change.

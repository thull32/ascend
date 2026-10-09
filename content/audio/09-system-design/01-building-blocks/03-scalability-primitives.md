---
lesson: scalability-primitives
source: 1fc2971a34e74261
fit: great
desk:
  - "The load-test and key-affinity simulation tables"
  - "The replica-sizing code"
  - "The pod-termination trace, and the Kubernetes autoscaler's defaults"
  - "Exercise: replay a Horizontal Pod Autoscaler"
---
## Introduction

Your single application server handles 800 requests a second at 60 percent CPU. A campaign next week will triple traffic. You can buy a bigger machine, or run three of the current one behind a load balancer.

The second sounds better until you ask three questions. Where does the user's shopping cart live? In server one's memory. What happens when the balancer sends that user's next request to server two? The cart is gone. And what do three servers do to the one database they share? Three times the connections, and the database becomes the bottleneck.

Horizontal scaling is a set of disciplines, not a feature. Make services stateless so any replica serves any request. Spread load and route around failure. Add capacity automatically without making things worse. And do the arithmetic that says how many replicas you need, and at what utilisation they stop keeping their latency promise.

## Bigger or more, and where state goes

The textbook says big machines cost more per core. In the cloud that is mostly false: within an instance family, price scales linearly with cores. The real limits of vertical scaling are the ceiling, the blast radius, and software that cannot use the extra cores. Measured on Postgres, primary-key lookups ran at 7,700 a second on one connection and 69,000 on 90. Nine times the throughput for ninety times the concurrency, because the machine ran out of cores.

So vertical scaling is the right first move for the database, and the wrong one for stateless compute, where a single machine is a single failure.

Horizontal has its own tax: headroom for losing a replica. If the latency knee is at about 80 percent, and you must carry the peak with one replica down, then with 3 replicas each can run at only 53 percent. With 10, 72 percent. With 30, 77. Small fleets pay the most for redundancy.

Statelessness means no request depends on which replica served the previous one. State does not vanish; it moves. Durable things, like orders and carts that must survive a crash, go to the database, about a millisecond away. Sessions and rate-limit counters go to a shared cache like Redis, about half a millisecond. Identity and small preferences can travel with the client in a signed token, which costs nothing to reach. The price of a signed token is revocation: a stolen one is valid until it expires, unless you keep a server-side deny list, which brings state back. Short expiry plus a refresh token is the usual compromise.

Now look at the fan-in. Thirty replicas, each with the default database pool of 10 connections, want 300 connections. Postgres runs a process per connection and defaults to a limit of 100. The stateless tier scales out cleanly; everything it talks to receives the sum.

## The knee

A load balancer gives many replicas one address and stops sending to unhealthy ones. The decision that matters most here is the algorithm. The lesson simulated 10 replicas with a total capacity of 4,000 requests a second, comparing random routing with sending each request to the less loaded of two randomly chosen replicas.

At 80 percent utilisation, random routing had a 99th percentile of 49 milliseconds. At 95 percent, 127. It more than doubled. The two-choice version went from 38 to 43 milliseconds over the same range: nearly flat.

Before I explain it: why would picking the less busy of just two replicas make that much difference?

[pause]

Because with random routing, each replica is an independent queue. One can be backed up while its neighbours sit idle. Picking the less loaded of two pools the queues, so the fleet behaves more like one big server. And above 100 percent, no algorithm helps: the queue grows by 200 requests every second, and after 30 seconds the median request had waited eight-tenths of a second.

One more point on the same simulation. Lose one of the ten replicas at 80 percent and utilisation goes to 89. With two-choice routing the 99th percentile was 40 milliseconds. That is why 80 percent on ten replicas is a defensible target, and 80 percent on three is not.

One routing idea is worth knowing because it looks like the opposite of statelessness. Route by a hash of the key, and each replica's local cache holds only its share of the key space, so the fleet's caches add up instead of duplicating each other. Simulated with 20 replicas, hash routing lifted the local hit ratio from 58 to 83 percent. The price is skew: the replica owning the hottest keys took more than twice the average load. Consistent hashing with bounded loads caps each replica at, say, 1.25 times the average and spills the overflow to a neighbour, and still kept 81 percent. This is not a sticky session. When a replica dies its keys move, and are served more slowly for a minute, never wrongly.

Two quick rules for health checks and removal. Keep liveness shallow and readiness local: a readiness check that queries a shared database ejects the whole fleet when the database blips. And drain on removal: fail readiness first, wait for the balancers to notice, finish in-flight work, then exit.

## Little's law

For any stable system, the number of things inside equals the arrival rate times the time each spends inside. That one formula sizes almost everything.

Thread pools. 2,000 requests a second at 50 milliseconds each is 100 requests in flight. At 20 threads per replica and a 70 percent target, that is 8 replicas, and 12 to survive losing one of three zones.

Connection pools. If each request makes one 5 millisecond query, 2,000 requests a second is just 10 concurrent queries across the whole fleet. Thirty replicas with pools of 10 hold 300 connections to do the work of 10. Size pools from the arithmetic, then put PgBouncer in front.

And a slow dependency. One downstream call slows from 5 milliseconds to a 500 millisecond timeout. Concurrent calls jump from 10 to 1,000. With a pool capped at 200, 800 requests a second queue or fail. That is the mechanism behind "one slow service took the site down". The fixes bound the time, with a timeout, and bound the concurrency per dependency, with a bulkhead, and shed the excess.

## Autoscaling is a control loop

Start with the metric. CPU is the default, and it is wrong for input-output-bound services, where a replica sits at 20 percent CPU with every thread blocked on the database. Scale on in-flight requests, queue depth, or latency against a target: the things Little's law actually sizes.

Then the delays. A VM takes 30 to 120 seconds to serve, a container 5 to 30, plus start-up and cache warm-up. Spikes take seconds. The lesson simulated the Kubernetes autoscaler: it runs every 15 seconds, pods serve 60 seconds after they are requested, 400 requests a second per pod, a 60 percent target. A ramp from 2,000 to 6,000 requests a second over ten minutes, starting at 8 pods, was never over capacity. A sudden step to 6,000 spent 120 seconds over capacity.

Why so long? At 6,000 requests a second, 8 pods can only report 100 percent CPU. So the formula asks for 14 pods, not the 25 needed. A saturated metric under-reports demand. Sixty seconds later, 14 pods report 100 percent again, and only then does it ask for 24. Starting at 12 pods halved the time over capacity. Autoscaling handles ramps; spikes need headroom, faster boots, or load shedding.

Two more rules. Scale out fast and in slowly, with separated thresholds, or the fleet oscillates. The Kubernetes autoscaler waits five minutes before scaling down, taking the highest recommendation in that window. And beware the herd on scale-out: ten new replicas each open 10 connections and warm their caches with the same queries, right when the database is already loaded. Stagger starts and warm lazily.

## Deploys are capacity events

A rolling deploy removes replicas on purpose. Kubernetes by default lets a quarter of the pods be unavailable at once. On a 20-pod fleet at 70 percent, the worst moment of a rollout leaves 15 serving pods at 93 percent. That is past the knee, and every deploy's 99th percentile shows it. Either surge new pods so capacity never drops, or set a utilisation target that already allows for a quarter of the fleet being away.

Removal also races with routing. When a pod is deleted, Kubernetes sends it the termination signal and updates the routing tables in parallel. A pod that exits immediately keeps receiving traffic from every router that has not caught up yet, for sub-second to several seconds. Put a number on it: 1,000 pod terminations a day, at 50 requests a second each, with a 2 second window, is 100,000 failed requests a day. That is more than a 99.9 percent availability target's entire error budget, spent on deploys alone.

The fix is an ordering, not a bigger fleet. Before stopping, sleep 5 to 15 seconds, longer than the slowest router's lag, while still serving normally. On the termination signal, stop accepting, finish what is in flight, and close idle keep-alive connections. And exit inside the grace period, 30 seconds by default.

Long-lived connections are the other trap. WebSockets and gRPC streams stay where they were opened. Add 5 replicas to 10 that each hold 50,000 connections, and the new ones start at zero. If 2 percent of connections reconnect each minute, the old replicas take about 15 minutes to come within 10 percent of the new average. Meanwhile a CPU autoscaler sees the old replicas still hot and keeps adding pods that receive almost nothing. The fix is active: old replicas ask a paced fraction of their clients to reconnect elsewhere.

## In the interview

Here is a follow-up the lesson expects. Your service is at 70 percent CPU and latency is climbing. Do you add replicas?

[pause]

First find where the latency lives. If database latency doubled, more replicas add connections and make it worse. If the replicas really are the constraint, yes, and ask why the autoscaler had not fired earlier, and whether this is a ramp it can follow or a spike that needs headroom or shedding today. The wrong answer is "yes, scale out", without checking the downstream.

And: why not sticky sessions with the cart in memory? It's faster. Faster by a Redis round trip of about half a millisecond, next to 50 to 100 milliseconds of user round trip. In exchange, a replica failure loses every cart on it, every deploy becomes that failure, scale-in becomes a decision about which carts to drop, and load is as skewed as the users. Carts go in Redis, keyed by session, and in the database at checkout. The wrong answer is "sticky sessions are fine if the balancer supports them".

## Recap

Four things to remember. Say where every piece of state lives before you draw a second replica; everything the fleet talks to receives the sum. Know the knee: with independent queues the 99th percentile more than doubles between 80 and 95 percent, and you size the target for losing a replica. Size threads, pools and fleets with Little's law, arrival rate times time inside. And treat autoscaling as a control loop with delays and a sensor that saturates, and every replica removal as a drain with an order: wait, stop accepting, finish, exit.

At your desk: the load-test and affinity tables, the replica-sizing code, the pod-termination trace, and the autoscaler exercise.

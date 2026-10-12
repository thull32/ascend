---
lesson: scalability-primitives
source: fb5869c3b7993bf0
---
## 1

A service receives 3,000 requests per second, with an average latency of 40 milliseconds. Roughly how many requests are in flight at any moment?

A, about 120. B, about 12. C, about 1,200. D, about 75.

[think]

The answer is A: about 120.

Little's law: in flight equals the arrival rate times the time each spends, so 3,000 times 0.04 seconds is 120. That is the number of threads or connections the fleet needs before requests queue. 12 forgets the unit conversion, and 1,200 would mean a 400 millisecond latency.

## 2

In the simulated load test, random routing's 99th percentile went from 49 milliseconds at 80 percent utilisation to 127 milliseconds at 95 percent, while least-of-two-choices stayed near 43. Why the difference?

A, random routing forces requests to retry more often under load. B, two-choice routing gives every replica extra worker threads. C, random routing leaves one replica's queue full while others idle. D, two-choice routing sends fewer requests to the fleet as a whole.

[think]

The answer is C: random routing leaves one replica's queue full while others idle.

With random routing, each replica is an independent queue, so one can be backed up while its neighbours are idle. Picking the less loaded of two pools the queues, and the fleet behaves more like one large server, which keeps queueing low until close to 100 percent. Total load and thread counts are the same in both runs.

## 3

During a sudden tripling of traffic, an autoscaler driven by CPU, with a 60 percent target, and 8 saturated pods first asks for only 14 pods, although 25 are needed. Why?

A, saturated pods report 100 percent CPU, hiding the real demand. B, the 10 percent tolerance suppresses most of the increase. C, the pods report more CPU than they are really using. D, the autoscaler caps any single step at 14 pods by default.

[think]

The answer is A: saturated pods report 100 percent CPU, hiding the real demand.

CPU cannot exceed 100 percent, so eight saturated pods look like 8 divided by 0.6, about 14 pods of demand. Only after those pods boot does the metric reveal more. Scaling on concurrency or queue depth, step policies, or headroom avoid this. The default scale-up limit here is the larger of doubling or 4 pods, which allows 16.

## 4

Your health check verifies that the replica can query the database. The database has a 3-second hiccup. What most likely happens?

A, nothing, since a 3-second blip ends before the next check can see it. B, the balancer marks the database unhealthy and routes around it. C, only replicas that were mid-query fail their checks and are removed. D, every replica fails its check at once, and the whole fleet is ejected.

[think]

The answer is D: every replica fails its check at once, and the whole fleet is ejected.

A deep check shares a failure domain: a blip in a dependency fails every check at once, and the balancer ejects everything. Use shallow liveness and local readiness for the balancer. The balancer knows nothing about the database; it only sees replicas failing.

## 5

A service must survive losing one replica at peak, and replicas keep a good 99th percentile up to about 80 percent utilisation. With 3 replicas, what is the highest safe peak utilisation per replica?

A, about 72 percent. B, about 80 percent. C, about 27 percent. D, about 53 percent.

[think]

The answer is D: about 53 percent.

After losing one of three, the other two carry the load, so each one's normal utilisation is scaled up by half. To stay at or below 80 percent, it must be at most two thirds of 80, which is 53 percent. Ten replicas allow 72 percent, which is why small fleets pay the most for redundancy.

## 6

Your pods exit as soon as they receive the termination signal, and every rolling deploy produces a few seconds of 502s. What is the cause?

A, routers keep sending to the pod until they see its removal. B, the liveness probe fails the moment the termination signal arrives. C, new pods pass readiness before their caches are warm. D, the surge setting schedules more new pods than the nodes can hold.

[think]

The answer is A: routers keep sending to the pod until they see its removal.

Kubernetes sends the termination signal and updates endpoints in parallel, and kube-proxy, ingress controllers and cloud balancers each learn of the removal seconds later, so a pod that exits at once receives traffic it can no longer serve. A pre-stop sleep longer than that lag, then draining in-flight work, removes the errors. Cold caches raise latency rather than causing 502s, and liveness probes play no part in a deletion.

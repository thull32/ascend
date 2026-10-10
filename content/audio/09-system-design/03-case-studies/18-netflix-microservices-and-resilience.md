---
lesson: netflix-microservices-and-resilience
source: 29f36d7d5073f450
fit: great
desk:
  - "The five-policy simulation table, row by row"
  - "The dependency wrapper sketch: timeout, bulkhead, breaker and fallback"
  - "The chaos sample-size table and the timed evacuation"
  - "Exercise: a Hystrix-style circuit breaker"
---
## Introduction

On Christmas Eve 2012, a load-balancing outage at AWS in one region took Netflix streaming down for many members, mostly on TV-connected devices across the Americas. Nothing in Netflix's own code was broken. The failure came from a dependency, in one place, and the architecture had no way to route around it.

So the question here is not "design a feature". It is: how do you design hundreds of services so members can always browse and press play, when every instance, every dependency, every availability zone and occasionally a whole region will fail? The video bytes come from Netflix's own CDN. This is about the control plane: sign-in, the home page, playback authorisation, choosing a CDN server.

A note on sources. Everything here about Netflix comes from what its engineers have described publicly. The numbers are illustrative assumptions, and the design is what you would build with those ideas, not Netflix's current internals.

Four deep dives after the numbers: one home page under five resilience policies, fallbacks, chaos experiments sized by statistics, and a timed regional evacuation.

## Requirements and the numbers

Instance failures invisible, continuously. Zone failures invisible or nearly so. A region failure moves members to healthy regions within minutes. A dependency failure degrades the product rather than breaking it. And hundreds of teams deploy independently, many times a day.

The senior requirement is the availability metric. Netflix has described measuring availability as stream starts per second, against its expected daily curve. Per-service uptime is not what members experience. Pick one business metric that says whether members got what they came for, define healthy as that metric following its normal curve, and judge every mechanism by whether it protects it.

Now the arithmetic, with 100 million members active a day. About 600 thousand requests a second at the edge, about 6 million internal calls a second. So a one-in-a-million failure happens six times a second.

Here is the number that should change how you design. A home page with 30 synchronous dependencies, each 99.99 percent available, is only about 99.7 percent available. At 50 thousand page loads a second, that is 150 failed pages a second, with every team meeting its target. So dependency failure must become degraded success, not an error.

And one slow dependency. At a thousand requests a second, a dependency that takes 5 seconds needs 5 thousand requests in flight, by Little's law. Against a pool of 200 threads, that saturates in a fifth of a second. Finally, regions: with three, losing one makes the survivors carry one and a half times their load, so 65 percent utilisation becomes 98.

## The architecture in words

Three regions, active-active, each a full copy of the control plane serving live traffic. Geo DNS sends devices to a region according to a traffic map. Requests enter through Zuul, the edge, which handles routing, authentication, priority and load shedding. An API layer assembles device-shaped responses and fans out to mid-tier services, which find each other through Eureka, a client-cached registry, and call each other through isolation wrappers. Member data lives in Cassandra, replicated asynchronously across regions, and hot data in EVCache, which is replicated across regions so a member is already warm wherever they are sent. Playback returns CDN addresses; video never touches the cloud.

Every internal call carries a deadline, the member's remaining budget, so a service three hops deep does not start work the edge has abandoned. It carries a priority class: playback outranks prefetch, which outranks log upload. And during experiments, it carries failure-injection context.

Three ideas run through the components. Prefer availability for control-plane metadata: a registry 30 seconds stale is fine, one that refuses to answer during a partition is not. Put resilience in the caller, who suffers when a dependency is slow. And move shared mechanisms down the stack: discovery, balancing and retries started as Java libraries and are moving into a service mesh sidecar.

## One home page, five policies

The lesson simulated one API instance: a thousand requests a second, 200 threads. 70 percent are home pages, calling five dependencies in parallel, including ratings. 30 percent are playback requests, which never touch ratings. Ten seconds in, ratings slows to 5 seconds per call.

With no timeouts, 94 percent of requests are rejected. Home pages want 3,500 threads and there are 200. And playback, which never calls ratings, fails with them. That is the cascade.

Add one-second timeouts, Hystrix's old default. Before I give you the number: does that fix it?

[pause]

No. 72 percent are still rejected. 700 home pages a second, each holding a thread for a full second, still want about 700 threads against 200. A timeout is only safe where rate times timeout fits the pool. And it actually sends ratings more traffic than doing nothing.

Add a bulkhead, a cap on concurrent calls to ratings, sized from normal concurrency: 700 calls a second at 50 milliseconds is 35 in flight, 49 at the slowest normal latency, so 60. Now ratings can hold at most 60 threads and playback is untouched. Home pages still fail, because nothing substitutes for the row. And a bulkhead of 10, Hystrix's default pool size, failed 72 percent of home pages even while ratings was healthy. Size it from the numbers, not the default.

Add a circuit breaker. Once half the calls in a rolling 10-second window fail, with at least 20 calls, it stops calling ratings, sending one trial request every 5 seconds. Load on ratings drops from 700 calls a second to one trial every 5 seconds, and failures take microseconds instead of a second. It opened 5 seconds into the incident, not at once, because the window still held 5 seconds of earlier successes.

Add a fallback, and every home page is served at normal latency, just without the ratings row. That is the end state: 100 percent degraded, zero failed.

The cost: after ratings healed, full pages came back in 0.3 seconds without a breaker and 4.1 seconds with one, because nothing calls the dependency until the next trial. A breaker trades faster failure for slower recovery.

Then retries. If the API, the personalisation service and the ratings client each make three attempts, a fully-down ratings gets three times three times three, 27 attempts per home page. 700 calls a second become 18,900, at the moment it can least take them. At a 50 percent failure rate the same policy only doubles load, so amplification is worst exactly when the dependency is fully down. Retry at one layer, with a budget of 10 percent of normal traffic, never past the deadline.

Finally, Netflix moved on from hand-tuned numbers. Every Hystrix command had its own timeout and pool size, set once and wrong after the next change. The direction since is adaptive concurrency limits: treat rising latency as queueing and shrink how many requests are allowed in flight. The patterns are permanent; the library and its hand-tuned numbers were not.

## Fallbacks are product decisions

For the home page, a ladder. Live personalisation. Else the profile's precomputed rows from the replicated cache, hours stale. Else popular rows for the country. Else the static default the device already holds. Optional pieces, like a ratings badge or a banner, fail silent. Playback cannot fake a DRM licence or an entitlement check; those fail fast and rely on redundancy, a retry on another instance, and evacuation.

Four rules make the ladder real. The fallback must not share the failure: reading the recommendations cache is no fallback if that cache is why recommendations failed. It must be cheaper than the primary, or one outage becomes load on another service. It must be exercised, because a path that runs only during incidents has undiscovered bugs. And fallback rate is an alert: if 30 percent of home pages are unpersonalised for a week and nobody notices, the product has quietly degraded.

## Chaos, sized by statistics

Netflix's publicly described practice has three stages. Chaos Monkey kills instances in production during business hours; its real effect was architectural, because once every team knew instances would vanish on a Tuesday, statelessness and zone redundancy became requirements. Failure injection testing then scoped failures to individual requests, from one test account up to a small slice of traffic. And the Chaos Automation Platform runs each experiment on two equal slices, injects only into one, compares their metrics, and aborts automatically.

The experiment: home pages whose ratings calls fail still start streams at the normal rate. 1 percent of members get the failure; another 1 percent are the control. At 5 thousand stream starts a second, each group sees 50 a second, 3 thousand a minute. How small a drop can one minute detect at three standard deviations?

[pause]

About 8 percent. The noise in the difference between two groups of 3 thousand is about 77 starts, and three times that is nearly 8 percent of 3 thousand. Run for 10 minutes and you can resolve about 2.4 percent. So set the abort at three standard deviations below control at any one-minute check, which stops a large regression within a minute, and run for 10 minutes. Shrink the groups to a tenth of a percent and ten minutes only buys what one minute bought before. The blast radius you can afford is set by how fast your metric detects harm.

## Regional evacuation

Active-active means every region serves traffic all the time, so the failover path is exercised continuously. Asynchronous replication is accepted per data type: a "continue watching" position from seconds before an evacuation may be briefly missing, fine for viewing history, wrong for billing, so billing stays off the evacuation path. Traffic moves two ways: a DNS traffic-map change moves new connections, and because devices and resolvers cache answers, the failing region's edge also proxies what it still receives to a healthy region.

The timeline, three regions at 65 percent at peak. Minute zero: stream starts in region A fall below the expected curve. Minute two: a human confirms, evacuate first, debug later. Minutes two to ten: pre-scale B and C to carry one and a half times their load. Then shift a quarter of A's members, wait for stable metrics, half, then everyone, by about minute 16. Debugging starts in a region with no customers.

Shift before scaling and the survivors sit at 97.5 percent, where any wobble overloads them. That is how one regional failure becomes three. Netflix has described Project Nimble, which cut failover from close to an hour to under 10 minutes, largely by keeping pre-provisioned instances ready instead of waiting for new ones to start.

And the failure evacuation cannot help with: a bad global change. Every region degrades at once. Roll out region by region with bake time and automated canary analysis.

## In the interview

Why did Netflix build Eureka instead of using ZooKeeper?

[pause]

Discovery should prefer availability. In a consistent coordination service, instances on the minority side of a partition lose their sessions and vanish from the registry over a network problem that did not affect them. Eureka replicates loosely, clients keep their cached copy, and self-preservation stops mass expiry when renewals suddenly drop, because a partition is likelier than a mass death. "ZooKeeper is consistent, so it is safer" is the wrong answer.

And: how much of this would you build with 30 engineers and one region? Multiple zones; timeouts, bounded retries with jitter and breakers on every remote call, from a library or mesh; a fallback table for the top five features; alerts on one business metric; a quarterly game day. Active-active costs one and a half times the capacity, justified only by the cost of a regional outage. Copying Netflix's architecture buys its costs without its reasons.

## Recap

Five things to remember. Define availability as a business metric, stream starts, and judge every mechanism by it. Little's law explains the cascade: timeouts alone do not stop it at high rates, so size bulkheads from normal concurrency, add breakers, and accept slower recovery. Retries multiply, 27 times at the bottom with three layers of three, so retry at one layer with a budget. Fallbacks are product decisions: independent of the failure, cheaper, exercised and alerted on. And plan regions as N over N minus one, pre-scaling before you shift.

At your desk: the five-policy table, the dependency wrapper sketch, the chaos sample-size table and evacuation timeline, and the circuit breaker exercise.

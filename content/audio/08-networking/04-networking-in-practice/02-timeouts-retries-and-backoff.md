---
lesson: timeouts-retries-and-backoff
source: 165f05e5fe62674d
fit: great
desk:
  - "The client defaults table and the SYN retransmission capture"
  - "The grpc-timeout encoder and the deadline propagation code"
  - "The retry budget traced token by token, and the budget implementations table"
  - "The 1,000-client herd simulation, its code and its tables"
  - "The hedging percentile table"
  - "Exercise: a full-jitter backoff schedule that respects a deadline"
---
## Introduction

A downstream service pauses for four seconds during a deploy. Every caller has a 30 second default timeout and three retries. Their threads stay pinned, then they all retry in lockstep. The downstream comes back to nine times its normal load, falls over properly, and what should have been a blip lasts forty minutes. Nobody wrote a bug. They accepted defaults.

Timeouts and retries are the two knobs that decide whether a partial failure stays partial. Both are usually set wrong, in the same two directions: timeouts too long, retries too eager.

Four ideas. Which timeout you are actually setting. How deadlines travel down a call chain. Why retries multiply load, and how budgets and jitter stop it. And hedging, which is not a retry at all.

## Which timeout?

There is no such thing as the timeout. A single HTTP call passes through at least five waits: DNS, connect, the TLS handshake, the read, and the idle time of a pooled connection. Then there is the one that matters most and is usually missing: a total deadline for the whole call.

When people say the timeout, they mean the read timeout. But a read timeout of 5 seconds is a timeout between bytes. A server that trickles one byte every 4 seconds never trips it. A total deadline is the only guarantee that a call returns.

The defaults are the dangerous part. Python's requests library has no timeout at all unless you pass one, so a silent server blocks the call forever. Java's built-in connection defaults to infinite. Go's default client has no total timeout. Assume every timeout is wrong until you have read the value in the code that sets it.

Now the connect timeout, and the most surprising number in the lesson. A connect fails in one of two ways. If the host is up and nothing listens on the port, it answers with a reset and you get connection refused within one round trip. But if the address is black-holed, say a terminated instance whose old IP now drops packets, nothing answers at all. The kernel just keeps resending its SYN on its own schedule.

How long before connect gives up, with no application timeout, on Linux defaults?

[pause]

About 130 seconds. The lesson captured it: 130 seconds with the textbook schedule, which doubles from one second, and 133 with the newer default, which resends at one-second intervals for a while before doubling. Either way, over two minutes. And Little's law turns that into an outage: a service making 50 calls a second to a vanished host piles up 6,500 half-open sockets before the first one even fails.

The fix inside a data centre is a connect timeout under one second. The round trip there is about half a millisecond, so 200 milliseconds is already 400 round trips. It also means the kernel never gets to its first retransmission: you fail fast and try another endpoint.

For request timeouts, the rule is to set them from the dependency's latency distribution, not from feel. Slightly above its 99th percentile, with room left for a retry. A timeout at the median cancels half of all calls by definition. At the 99th percentile, it cancels 1 percent.

## Deadlines down the chain

A user request enters at the edge with a one-second budget. The service it calls has a 2 second timeout, someone's default. The database below has 5 seconds, someone else's. At one second and one millisecond the edge gives up and returns a gateway timeout. The service is still waiting, the database is still working, and resources for a request nobody wants stay allocated for another four seconds. Under load, that orphaned work competes with requests someone is still waiting for.

The fix is deadline propagation. The edge computes a deadline, and every hop passes the remaining budget downstream, after subtracting its own expected cost. The service receives a thousand milliseconds, keeps about 200 for itself, and passes 800. The database client gets 800 and sets a 500 millisecond statement timeout, leaving room for one retry. And if the remaining budget is smaller than a hop's own median, it rejects immediately. A request that cannot finish in time should fail at the cheapest possible hop.

gRPC builds this into the protocol. The deadline travels as a header carrying a duration, not a timestamp. The receiver turns it into a deadline on its own clock the moment the headers arrive, so clock skew between hosts cannot corrupt it. A timestamp header has the opposite property: a host whose clock is 2 seconds fast rejects every request as already expired.

Cancellation is the other half. When a client gives up, gRPC cancels that stream, the server's context for the call is cancelled, and if the handler passed that context to its own outbound calls, they are cancelled too. One expired deadline tears down the whole tree of work. The classic bug is a handler that starts its outbound call from a fresh, empty context. The deadline and the cancellation stop at that line, and every hop below does orphaned work.

## Retries multiply

A retry turns a transient failure into a success. It also turns a struggling dependency into a dead one. Which one happens is arithmetic.

With up to three attempts, healthy traffic barely notices. At a 1 percent failure rate, it is 1.01 attempts per call. At 10 percent, 1.11. Nesting is what hurts. Put three attempts at each of three tiers, and take the bottom tier hard down. Each of the edge's three attempts reaches the middle, each of those tries the bottom three times. Three times three times three: a dependency that could not handle normal load now gets 27 times it. And when a dependency is overloaded, its failures are not independent. Every attempt fails. That is a retry storm.

So retry only where a retry can help. The single most useful distinction is between a connect failure and a read timeout. A connect failure guarantees the server saw nothing, so the retry is free. A read timeout guarantees nothing: the server may have done the work. A payment that times out on read might have charged the card, and retrying might charge it twice. Either do not retry, or attach an idempotency key so the server can deduplicate. Retry policy and idempotency are one decision, not two. And never retry a client error other than too many requests: the request is wrong, and it will be wrong again.

## Budgets and jitter

A per-request count gives you 27 times. A retry budget bounds retries as a fraction of traffic instead, so a healthy system never touches it and an outage cannot multiply load.

gRPC's version is a token bucket. Say it holds 10 tokens. Every failed attempt takes one away, every success adds a tenth of one, and retries are allowed only while the bucket is more than half full. Against a hard-down server, after three retries the bucket drops to five and retries stop. From then on, amplification is exactly one. The nice property: with that ratio, tokens drain whenever more than about 9 percent of attempts fail. Retries switch themselves off in exactly the regime where they stop helping and start hurting. Envoy, Finagle and Linkerd use a similar idea at about 20 percent of traffic, with a floor so low-traffic clients can still retry.

When a retry is allowed, it must not happen immediately, and it must not happen at the same instant as everyone else's. Exponential backoff doubles the ceiling on each attempt. Jitter randomises each sleep under that ceiling, so a thousand clients that failed together do not retry together.

The lesson simulated exactly that: a thousand clients hit a server that admits a hundred per 100 milliseconds. With no backoff, everyone finishes in under a second, but by sending 46 thousand attempts, 46 per success. On a real server, that retry load alone can keep it saturated after the original trigger is gone. That is a metastable failure.

Plain exponential backoff without jitter cut attempts to 5,500 but took nearly 33 seconds. Before I tell you why: the sleeps were the same length as the jittered ones. What went wrong?

[pause]

The herd stayed a herd. Every rejected client computed the same sleep, so they arrived together in waves of 900, then 800, then 700, with idle buckets in between. Almost every bucket before the last success had unused capacity. Every jittered variant finished in 2 to 3.7 seconds, with 2,700 to 4 thousand attempts. Full jitter can sleep for zero, but the expected sleep is half a doubling ceiling, so the population spreads out. Which jittered variant wins depends on the parameters. That jitter beats no jitter did not move across twenty seeds.

Backoff slows retries; a circuit breaker stops them. Once the failure rate to a dependency crosses a threshold, say half of the last 20 calls, the breaker opens and calls fail immediately without touching the network. After a cooling period, one probe goes through. It protects the caller as much as the dependency: a call that would pin a thread for a second fails in microseconds, and the caller can serve something degraded instead of stalling. One breaker per dependency, so one bad backend does not cut off the healthy ones.

## Hedging

A retry waits for failure. A hedged request does not. Send the request, wait until the dependency's 95th percentile, and if nothing has come back, send a second copy to a different replica. Use whichever answers first and cancel the other.

Measured on a heavy-tailed simulation: no hedging gave a 99th percentile of 145 milliseconds. Hedging at the 95th percentile cut it to 36, fourfold, and cut the 99.9th twelvefold, for 5 percent more requests. Hedging at the median took another 10 milliseconds off, for ten times the extra load.

The catch is independence. If the slowness is shared, both replicas overloaded or one slow database under both, the hedge waits just as long and adds load to an overloaded system. So hedge at a high percentile, only idempotent calls, cancel the loser, and draw on the same budget as retries so hedges stop when errors pile up.

## In the interview

A follow-up the lesson expects. Retries are configured at three tiers, with three attempts each. What do you change?

[pause]

Retry in one layer only, usually the one closest to the failing dependency, or the mesh. Give that layer a budget. Make the others fail fast. And propagate a deadline, so an outer layer never retries work an inner layer is still doing. The wrong answer is "lower each tier to two attempts". That still gives eight times the load when the bottom is down.

And another. A dependency's host is terminated and your calls to its old IP hang. Why, and for how long? The address is black-holed, so SYNs get neither an answer nor a reset. The kernel keeps retransmitting and gives up after about 130 seconds. Set an explicit connect timeout and remove the endpoint from discovery. "The connection is refused, so it fails immediately" is only true when a live host answers.

## Recap

Four things to remember. Name the timeout: connect, read, idle and total are different, a read timeout is between bytes, and a connect to a black-holed host lasts about 130 seconds. Propagate deadlines as a remaining duration, and pass the request's context to every outbound call so cancellation cascades. Retries multiply by tier, so retry in one layer, with a budget, only idempotent work or work with a key, and always with jittered backoff. And hedge at a high percentile for tail latency, knowing it fails when slowness is shared.

At your desk: the client defaults and the SYN capture, the gRPC deadline code, the token-by-token budget trace, the herd simulation, the hedging table, and the deadline-aware backoff exercise.

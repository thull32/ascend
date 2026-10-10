---
lesson: the-design-interview-method
source: b930919b11065c08
fit: great
desk:
  - "The full timestamped run, with the estimates and latency-budget tables"
  - "The key-strategy comparison and the random-key generation code"
  - "The trade-offs table and the failure modes of the round"
---
## Introduction

You have 45 minutes, a whiteboard, and a one-sentence prompt: design a URL shortener. Nobody designs a production system in 45 minutes, and the interviewer knows it. What they measure is whether you can turn an ambiguous problem into a set of decisions, justify each one with a number, and say out loud what will break.

Candidates who fail this round rarely fail on knowledge. They fail on sequencing. Boxes before scale, the wrong bottleneck optimised, and the clock running out before anything senior has been said.

So here is a protocol that fixes the sequencing. Seven phases with a time budget. Then one complete run on one prompt, minute by minute, with what the interviewer probes at each stage and an answer that earns the signal. And finally, how the round is actually scored.

## The seven phases

The budget. Requirements, five minutes. Estimates, five. The API, three. The data model, five. The high-level design, seven. Deep dives, fourteen. Wrap-up, five. That adds to 44, which leaves one minute at the very start to announce the plan.

Each phase produces something on the board. Requirements produce a functional list, non-functional targets, and an explicit list of what is out of scope. Estimates produce queries per second, storage, bandwidth, the read to write ratio, and one sentence on what dominates. The API is three to five endpoints. The data model is tables or key schemas, modelled from the queries, not from the nouns in the prompt. The high-level design is one diagram, with every arrow labelled by protocol and rate.

Real interviews drift, and that is fine. The point is that the deep dives get a third of the time, because that is where senior is decided: trade-offs, failures, numbers.

Before I say it: what is the commonest shape of a failing interview?

[pause]

Twenty-five minutes on a handsome diagram, then a rushed deep dive that never reaches a failure.

## Requirements and estimates

The first minute is one sentence. "I'll take about five minutes on requirements and five on estimates, then API, data model and a high-level design by minute 26, then two or three deep dives on what is hard at this scale, and a wrap-up. Stop me if you want to go somewhere else." The interviewer writes "drives the conversation" before you have drawn anything.

Requirements for the shortener. Functionally: create a short link for a long URL, with an optional custom alias and an optional expiry; redirect; delete. Out of scope, and said out loud: the analytics dashboard. The redirect path emits a click event, so analytics can be added later without touching it. Non-functional: a redirect 99th percentile under 20 milliseconds server-side, redirect availability of 99.99 percent, and a created link is never lost. And scale, asked rather than assumed: 100 million new links a month, 100 reads per write, kept for five years.

At minute five the interviewer adds: we also want custom aliases, and links should never expire. The answer that scores: aliases go through the same primary-key insert as generated keys, so uniqueness is enforced in one place, with a denylist of words like admin and login and a cap on length. And "never expire" makes storage grow without bound, so the five-year storage figure becomes the number to watch. The common wrong answer adds a separate alias table, which gives you two sources of uniqueness to keep in sync.

Now the estimates. 100 million writes a month, over roughly 2.6 million seconds in a month, is 40 writes a second, about 120 at a three times peak. Reads are 100 times that: 4,000 a second on average, about 20,000 at a five times peak. For size, plan 500 bytes a link, which is generous against what a measured Postgres row took, to cover longer URLs, another index and bloat. That is 50 gigabytes a month and 3 terabytes in five years.

Then the sentence that matters. "Read-heavy, 20,000 reads a second at peak, 3 terabytes in five years. That is a cache in front of one replicated database. I will not shard on day one."

The probe at minute ten: what if it's 100 times bigger? Re-derive, don't hand-wave. Writes become 12,000 a second at peak. On the machine used for this lesson, Postgres committed 16,000 single-row transactions a second with 64 connections sharing each disk flush, so one primary could take it, with no headroom. Reads become 2 million a second at peak: a cache cluster of roughly 20 Redis nodes, or redirects cached at the CDN edge. Storage becomes 300 terabytes over five years, and storage, not throughput, forces sharding. The design changes in exactly those two places. The wrong answer is "everything scales a hundred times, so add Kafka and Cassandra".

## API, data model and the diagram

Three endpoints: create a link, follow a short key, delete a link. Create requires an idempotency key, so a client that retries after a timeout does not mint two links.

The probe at minute 13: why a 302 and not a 301? A 301 is cacheable by default and a 302 is not. With a 301, browsers stop asking you. Less load, but no click events, no way to change a destination, and no way to take down a malware link for users who already cached it. A 302 sends every click through you. If load mattered more than control, you would send a 302 with a five-minute cache lifetime, which bounds how long a takedown takes. The wrong answer is "301 because it is faster", which ignores that it is permanent.

The data model starts from the two access patterns: look up by short key, 20,000 a second, and insert, 120 a second. Everything else is secondary. One table, keyed by a seven-character base62 key. That is 3.5 trillion possible keys, and five years of links use 0.17 percent of them.

The probe: SQL or a key-value store? The hot path is a point lookup, which either one serves. Choose what the team already operates, and keep a relational store if "list my links" or analytics joins are likely. The wrong answer is "NoSQL because it scales", with no access pattern behind it.

The high-level design is small. A load balancer, a stateless redirect service, Redis, and a Postgres primary with a read replica in another availability zone. Walk the read path with a latency budget. Balancer to service, about half a millisecond. Service to Redis, about the same. On a miss, a primary-key lookup, half a millisecond to a millisecond. A hit costs 1 to 2 milliseconds in total, a miss 2 to 3. Well inside the 20 millisecond target, which leaves room for tails.

The probe at minute 25: where are the single points of failure? Answer with failover times. The Postgres primary, for creates: managed failover takes tens of seconds to minutes, during which creates fail and redirects keep working from the cache and the replica. Redis, if it is one node: Sentinel by default marks a primary down only after 30 seconds of failed pings. The wrong answer is "there are none, everything is replicated", which skips the failover window.

## Deep dives

Minute 26. Pick what is hard at this scale, or what the interviewer has been nudging towards. Here: key generation, the cache under failure, and the cross-region read.

Key generation has four candidates: random keys with a unique constraint, a counter encoded in base62, a pre-generated key pool, or a truncated hash of the URL. Random keys with the database's unique constraint win: no coordination, and not guessable. A counter is guessable, because sequential keys enumerate every link. The collision rate is existing keys over the key space: at a billion keys, 0.03 percent, one retry per roughly 3,500 inserts. Truncated hashes collide far more than intuition says. Inserting a million seven-character hash prefixes produced 1,846 duplicate keys, almost exactly the 1,863 the birthday arithmetic predicts.

The probe: two servers generate the same key at the same instant? Both insert. The primary-key index makes the second wait until the first commits, then fail, and that server draws another key. The wrong answer is "check with a select first". That is a check-then-act race: both see nothing, both insert.

The cache: cache-aside, a 24-hour TTL with 10 percent jitter. Then the probe at minute 33. The Redis primary dies. What happens in the first minute?

[pause]

20,000 reads a second land on Postgres until failover completes and the cache rewarms. Measure before predicting collapse. The lesson's Postgres served 53,000 primary-key lookups a second on a 32-thread workstation; an 8 virtual CPU cloud instance does roughly a quarter of that, so a primary plus a replica can absorb the load. What breaks first is connections. 50 service replicas with a default pool of 10 each want 500 connections against a limit of 100, and requests fail on connection errors, not CPU. So: PgBouncer in front, per-replica pools of 2 to 5, a 50 millisecond query timeout, and load shedding that returns a fast 503 beyond what the database can take. The wrong answer is "the database falls over, so add more database", which was never measured.

Last, the cross-region read. A link is created in the US and clicked in Europe 200 milliseconds later. With a European replica 300 milliseconds behind, the click gets a 404, and if 404s are cached, the link stays broken. So a miss in Europe falls through to the US primary, a round trip of 70 to 90 milliseconds, negative results are cached for seconds only, and you state that cross-region read-after-write is guaranteed only through the primary. The wrong answer is "it replicates instantly".

## What gets written down

Minute 40, the wrap-up, in three parts. Next steps: click events to a queue, rate limits on creation, malware scanning of destinations. What you are not doing: no sharding at 3 terabytes, no queue in a create path of 120 writes a second, no 301. And the weakest point: 99.99 percent redirect availability is not met by a single-region primary plus a cache. It needs a regional failover plan, which costs seconds of replication lag and possibly the last writes.

Naming the weakness yourself matters because of what happens after you leave. The interviewer fills in a structured write-up, and a committee or hiring manager who never saw you reads it. The dimensions converge on four: problem exploration, design, technical depth, and communication. Each needs written evidence. "Estimated 20,000 reads a second and concluded no sharding" is evidence. "Seemed strong" is not.

Two consequences follow. A trade-off you considered but did not say is invisible, so say it. And the level decision is mostly about independence. A mid-level packet shows a working design with prompting. A senior packet shows the candidate choosing the deep dives, quantifying, and naming the weakness before being asked.

Which is why hints matter. When the interviewer asks "what about when the cache goes down?", that is the interviewer choosing your next deep dive. Ignoring hints is one of the most reliable ways to fail; the hint is the rubric leaking. Answer it, then return to your plan rather than letting the question become the agenda. And when you don't know a number, say so and reason from first principles instead of bluffing.

## In the interview

Two follow-ups the lesson expects. First: at what point would you shard, and on what?

[pause]

Writes are 120 a second at peak, so storage decides. Past a few terabytes, a single node's restore time and index maintenance hurt, and at 600 gigabytes a year that is around year five. Shard by a hash of the short key into many logical partitions, because every hot query is a point lookup on it; range sharding would put every new key on the newest shard. Exhaust replicas and the cache first. The wrong answer is "shard from day one to be safe", which buys cross-shard queries for no measured reason.

Second: with a 90 percent hit ratio, what is the redirect's 99th percentile, and what dominates it? The misses. With 10 percent of requests missing, the 99th percentile request is a miss plus queueing, a few milliseconds server-side. To move it, speed up the miss path, with the right index and a pool sized so a miss never waits for a connection, or raise the hit ratio. Faster hits do nothing for it. The wrong answer is quoting the mean.

## Recap

Four things to remember. Budget the 45 minutes, and give the deep dives a third of them. Derive the architecture from the estimates, re-derive when a number changes, and say when one database is the right answer. End every deep dive with a failure, a number and a mitigation. And price every decision, including the weakness of your own design, before the interviewer asks.

At your desk: the full timestamped run with its tables, the key generation code, and the trade-offs and failure modes of the round.

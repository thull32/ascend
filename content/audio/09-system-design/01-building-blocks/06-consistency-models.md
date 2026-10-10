---
lesson: consistency-models
source: cc83825666bd6f4b
fit: great
desk:
  - "The histories H1 to H7, laid out as timelines, and the anomaly table"
  - "The quorum inversion trace, step by step"
  - "The staleness simulation table"
  - "The read-your-writes code with log positions, and the systems table"
  - "Exercise: check a history for linearizability or sequential consistency"
---
## Introduction

A user posts a comment, refreshes the page, and the comment is gone. Two seconds later it is back. Nothing crashed and nothing was lost, and everyone on the team will say the system is eventually consistent, as if that explained it. It does not. The comment went to the primary, and the refresh was served by a replica 400 milliseconds behind. The system kept every promise it made. It just never promised the user would see their own write.

A consistency model is exactly that kind of promise: a rule about which values a read may return, given the writes around it. Every replicated system has one, written down or not. The senior skill is naming the model each operation needs, knowing its price in latency and availability, and knowing where a weaker one is safe.

Four ideas, then. How to judge whether a history is legal under a model. Why a quorum is not the same as one copy. How stale "eventually" really is, in numbers. And the session guarantees you implement yourself, cheaply, to fix the vanishing comment.

## Judging a history

A history is a list of operations on one value, call it x, starting at 0. Each operation has a client, what it did, and the real-time interval from when the call started to when it returned. A model allows a history if you can line all the operations up in one single order that follows the model's rule, and in which every read returns the latest write before it.

The models differ only in the rule. Linearizable: the order must respect real time, so if one operation returned before another began, it comes first. It behaves as if there were one copy and each operation took effect at an instant inside its interval. Sequential: the order only has to respect each client's own program order, so everybody agrees on one order, but it may disagree with the clock. Causal: causes before effects, and concurrent writes may be seen in different orders. Eventual: nothing at all while writes continue; replicas converge once they stop.

Try one. Client A writes 1, and the call returns at 20 milliseconds. Client B starts a read at 50 milliseconds and gets 0. Linearizable?

[pause]

No. A's write returned before B's read began, so real time puts the write first, and the read must return 1. But it is sequentially consistent. A and B each did one thing, so you can put B's read before A's write and everything is legal. That is exactly what a replica that had not yet applied the write produces.

A subtler one. A's write runs from 0 to 30. B reads 1 between 10 and 20. C reads 0 between 15 and 25. Everything overlaps, so you choose instants: C at 15, the write at 16, B at 17. Linearizable. Reads that overlap a write may return either value. Now move C's read to start at 25, after B has already returned 1. B fixed the write's moment before 20, so C must see it. C saw 0. Not linearizable. That new-then-old inversion across clients is exactly what linearizability exists to forbid.

What pays for it is coordination on every operation: a single leader that confirms it is still the leader before serving a read, or a quorum. The cost is a round trip to a majority, 1 to 2 milliseconds across availability zones, and 60 to 80 milliseconds across US regions. And here is the quiet version of the same fact. Add a read replica to a Postgres primary, route your selects to it, and you have left linearizability without changing one line of application code.

## Why a quorum is not one copy

Three replicas. Writes need 2 acknowledgements; reads ask 2 replicas and return the highest version they see. Read quorum plus write quorum is greater than the number of replicas, so every read overlaps every write. Surely that is linearizable?

Trace it. A starts writing 1. Replica one applies it; the messages to replicas two and three are delayed. B reads replicas one and two, sees the new version on one, and returns 1. Then C reads replicas two and three, both still old, and returns 0. Only after that does replica two apply the write and A's write return.

That is the inversion from a moment ago. B returned new, C began after B, and C returned old. The overlap guarantees a read sees the last completed write, not one still in flight.

The fix is the second phase of the ABD algorithm, from 1995. A reader that sees replicas disagree writes the newest value back to a write quorum before it returns. B writes version 1 to replica two, and now C's quorum contains it. The price is a second round trip on every read that finds a disagreement. Cassandra does this repair during quorum reads by default, which removes this inversion, yet its quorum operations are still not linearizable: a write that was reported as failed can surface later through repair, and concurrent writes are ordered by timestamps the clients supply.

## Causal, and the orphaned reply

Sequential consistency is the next step down. ZooKeeper offers it by default: writes are totally ordered through the leader, and each server answers reads from its own state, which is a prefix of that order. Reads scale with servers; writes do not.

Causal is weaker again, and the example is social. Alice posts "spare ticket?". Bob reads the post and replies "yes please". Carol reads the reply, then reads the post, and finds nothing. Is that allowed under causal consistency?

[pause]

No. Bob read the post before writing his reply, so the post happens before the reply. Carol has seen the reply, so the post is in her causal past, and her later read must return it. Eventual consistency allows it: the reply's partition simply replicated first, and Carol sees an orphaned "yes please".

The mechanism is dependency tracking. Each write carries the versions it depended on, and a replica holds a write back until its dependencies have been applied. That metadata, and the held-back writes, are why few systems offer full causal consistency. MongoDB's causally consistent sessions do it per session, making a secondary wait until it has applied everything the session has seen.

Causal still allows one anomaly that sequential forbids. Two clients write 1 and 2 at the same time, neither having read the other. One observer sees 1 then 2; another sees 2 then 1. There is no happens-before edge between the writes, so that is causal, but no single order explains both observers. This is the anomaly of multi-leader replication: each region applies its local write first. Systems that also promise convergence add a conflict rule, last-writer-wins or siblings that the application merges. Either way the observers disagreed for a while, and that is the price of accepting writes without coordinating them.

## How stale is eventually

Eventual consistency promises only that replicas converge if writes stop. The honest description of "eventually" is a number. A healthy Postgres replica in the same zone lags 1 to 10 milliseconds, and seconds to minutes during bulk loads or long transactions. A cross-region asynchronous replica, 50 to 200 milliseconds. A Cassandra read at consistency level one, for a write a replica missed, can be stale until repair, possibly hours.

The lesson simulated how often a read misses a recent write, an idea called probabilistically bounded staleness. Three replicas, each applying a write after half a millisecond plus a random delay averaging 2 milliseconds, with 1 percent of deliveries stalled an extra 50 milliseconds by a pause or a busy disk.

Three readings to keep. Immediately after a write, a single-replica read is stale about half the time, 53 percent. So read-your-writes cannot be left to luck. Second, staleness decays fast, to about 5 percent after 5 milliseconds, and then hits a floor set by the stall rate, not the average delay: after 50 milliseconds the only stale reads left are the ones that landed on a stalled replica. Third, reading two replicas buys more freshness than writing to two. At 5 milliseconds, reading two was stale 0.2 percent of the time; writing to two, 3.1 percent. A read that sees any fresh copy wins, while a write that waits for two still leaves the third behind.

That shape, a fast decay onto a tail set by pauses, is what to expect from any real store.

## Session guarantees, and the other replicas

Now the cheap fixes. Four guarantees scoped to one client's session cover the anomalies users actually notice. Read-your-writes: after you write, your reads see it. Monotonic reads: once you have seen version 5, you never see version 4. Monotonic writes: your writes apply in the order you issued them. And writes-follow-reads: a write you issue after reading a value is ordered after that value.

The vanishing comment is a read-your-writes failure, and the implementation is a log position. When the primary commits the write, it returns the position in its log, and the API hands that token to the client. On the next read, if the replica has applied at least that position, it serves the read; if it is behind, the read goes to the primary. In Postgres that position is the location in the WAL. Other users may still see the stale replica, which is usually fine: they cannot know a write happened.

Monotonic reads fixes a different bug, time travel. A user sees a new value, then an old one, because the balancer sent the second request to a replica further behind. Carry the highest position seen, and refuse replicas behind it, or pin the session to one replica.

One catch. A token held by the client gives read-your-writes per session, not per user. Edit your profile on your phone, open your laptop, and the laptop's session has no token. If the product promises your change shows everywhere you are signed in, keep the user's last write position on the server, in a small entry that expires after the longest lag you tolerate. Almost every read finds no entry and goes to a replica at no cost.

And clients observe the whole path, not the database. A linearizable primary behind a cache-aside layer gives users whatever the cache says, and the classic race, a slow reader setting a value it read before the writer's delete, leaves the cache stale until its TTL. HTTP caches are replicas with no invalidation at all: a max-age of 60 seconds on a profile page serves the old profile for up to a minute after the edit, however consistent the database is.

## In the interview

Here is the opening story as a question. The feed is eventually consistent. What does a user see when they post and refresh?

[pause]

Their post. The posting session gets read-your-writes: the write returns its log position, and the next read is served only by a replica that has applied it, otherwise by the primary. Other users may miss the post for up to the lag, under 100 milliseconds in a region, which is invisible to them. The wrong answer is "eventually they see it", because that is the bug.

The follow-up: which operations here need linearizability? The ones where two clients acting on a stale value produce a wrong outcome: the last seat, an inventory decrement, a lock, a balance before a transfer. Those go to the leader, or through a conditional write that fails on a version mismatch. Everything else, usually over 95 percent of reads, tolerates staleness. The wrong answer is "all writes", which confuses durability with ordering.

If they push on why the strong models cost so much, there is a theorem behind the line. Mahajan, Alvisi and Dahlin showed in 2011 that no model stronger than a real-time variant of causal consistency can stay available on both sides of a partition and still converge. Everything stronger pays by refusing some requests when the network splits. And watch for the deliberate trap: consistency is not isolation. Isolation is about concurrent transactions on one database; replication consistency is about copies on different machines. A serializable primary with an asynchronous replica gives you serializable transactions and eventual reads at the same time.

## Recap

Five things to remember. A consistency model is a rule about which histories are legal, and you can judge a small one by hand by looking for one order that respects the rule. Linearizability means real time and costs a majority round trip, and adding a read replica quietly leaves it. Quorum overlap is not linearizability; a read that sees disagreement must write back before returning. Staleness is a distribution: about half of single-replica reads right after a write are stale, decaying fast onto a tail set by pauses. And the anomalies users see about their own actions are fixed cheaply with session guarantees carried as log positions, kept per user when they must span devices, remembering that caches and CDNs are replicas too.

At your desk: the histories as timelines, the quorum trace, the staleness table, the read-your-writes code, and the history-checker exercise.

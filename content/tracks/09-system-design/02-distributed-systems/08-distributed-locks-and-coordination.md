---
slug: distributed-locks-and-coordination
title: "Distributed locks and coordination: Redlock, ZooKeeper, etcd and the single-writer patterns"
description: Efficiency locks versus correctness locks, why a single-Redis lock has two holders after a failover, the Redlock debate settled with a verdict, how ZooKeeper and etcd locks work and fail, and the designs that need no lock at all.
minutes: 30
difficulty: expert
tags: [system-design, distributed-systems, distributed-locks, redlock, zookeeper, etcd, leader-election]
---
Twenty replicas of a service each run a nightly job that emails every customer a statement. The job must run once. The obvious answer, "take a distributed lock, run the job, release the lock", is where the trouble starts: which lock, held how, and what happens when the holder pauses for 30 seconds halfway through, loses the lock without noticing, and a second replica starts sending the same emails.

The first question a senior engineer asks about any distributed lock is what it is for. If the lock prevents *wasted work* (two replicas both computing a report, one of which is thrown away), the occasional double holder costs money and nothing else, and a fast, best-effort lock is fine. If the lock prevents *incorrect results* (two writers corrupting a file, two payments for one order), no lock built on timeouts is sufficient by itself, and the resource must enforce the exclusivity with a fencing token. Everything else in this lesson follows from that distinction.

## Efficiency vs correctness

| Purpose | Consequence of a double holder | Acceptable lock |
|---|---|---|
| Efficiency: avoid duplicate work (cache refresh, report generation, cron dedupe where the job is idempotent) | Some wasted compute; maybe a duplicate email if the job is not idempotent | Single Redis `SET NX`, Redlock, any lease with a TTL |
| Correctness: prevent conflicting writes (single writer to a file, one payment per order, one leader mutating shared state) | Corrupted data, double charge, split brain | Consensus-backed lease **plus** fencing enforced at the resource, or a design with no lock |

The nightly-statement job is closer to correctness than it looks: a duplicate email is a customer complaint. The right fix is not a stronger lock; it is making the job idempotent (record "statement sent for customer C for month M" with a unique key; the second run finds it and skips), at which point the lock is only for efficiency and any lock will do. Most correctness locks disappear when you ask this question.

## A single-node Redis lock

The minimal lock: `SET lock:job <random_token> NX PX 30000`. `NX` sets only if absent (atomic acquire), `PX` sets a 30-second expiry (a lease, so a crashed holder does not block forever), and the random token identifies the holder so that release only deletes the holder's own lock:

```text
-- release, atomically: only delete if the value is still my token
if redis.call("GET", KEYS[1]) == ARGV[1] then
  return redis.call("DEL", KEYS[1])
end
return 0
```

Without the token check, a slow holder whose lock expired would delete the *next* holder's lock. With it, the release is safe. The acquire is ~1 ms over the network, which is why this is the most widely deployed distributed lock in the world.

Its failure is Redis's replication. Redis replicates asynchronously: the primary acknowledges `SET` before the replica has it. Primary crashes; replica is promoted; the lock key does not exist there; another client acquires it. Two holders. Turning on `WAIT` for synchronous replication reduces the window at a latency cost but does not close it, because a replica that acknowledged may still be behind on promotion in some failure sequences. A single-node lock is an efficiency lock.

```viz
{"type": "system", "scenario": "distributed-lock", "nodes": 3,
 "title": "Acquire, hold, expire, re-acquire", "caption": "The lock is a key with a TTL. The holder that stops renewing loses it without being told. Watch the moment the TTL expires while the first holder is still working: from here on there are two holders, and only the resource can tell them apart."}
```

## Redlock and the debate

Redlock, proposed by Redis's author, tries to remove the single-node weakness with N independent Redis masters (typically 5, no replication between them). To acquire: note the start time; try `SET NX PX` on each master in sequence with a short per-node timeout; if a majority (3 of 5) succeeded and the elapsed time is less than the TTL, the lock is held for TTL minus elapsed time minus a clock-drift allowance; otherwise release everything and retry after a random delay. A single master crashing or being partitioned no longer hands out a second lock, because the second client cannot reach a majority the first still holds.

Martin Kleppmann's critique made two points. First, the timing assumption: Redlock's safety depends on the clocks of the Redis masters and the clients being reasonably synchronised and on processes not pausing for long. A master whose clock jumps forward expires its lock early; a client that pauses after acquiring (the GC scenario from [Failure detection and leases](/learn/system-design/distributed-systems/failure-detection-and-leases)) acts after expiry. Second, and more fundamentally: Redlock issues no fencing token, so even if its own logic were perfect, a paused holder's late write cannot be rejected by the resource. A lock that the resource cannot enforce is, for correctness purposes, advisory.

Antirez's response: the timing assumptions are the same ones every lease-based system makes, clock jumps are avoidable with sane configuration, and the pause problem afflicts any lock, ZooKeeper's included, unless the resource checks something. Both are right about the facts. The verdict a senior engineer gives:

- For **efficiency** locks, Redlock is more robust than a single Redis node against master failure, at 5x the infrastructure and a few extra milliseconds; whether that is worth it over a single node with idempotent work is a judgement call, and often it is not.
- For **correctness** locks, use a lease from a consensus system that issues a monotonic token, and enforce the token at the resource. Redlock does not provide the token; ZooKeeper and etcd do.

## ZooKeeper locks

The recipe uses ephemeral sequential znodes under a lock path:

1. Create `/lock/guid-lock-` with the `EPHEMERAL | SEQUENTIAL` flags; ZooKeeper appends a monotonically increasing sequence number: `/lock/guid-lock-0000000042`.
2. List the children of `/lock`. If your znode has the lowest sequence number, you hold the lock.
3. Otherwise, set a watch on the znode with the next-lower sequence number (only that one), and wait. When it is deleted (its holder released or its session expired), go to step 2.
4. Release by deleting your znode. Session expiry deletes it for you.

Watching only the predecessor avoids the **herd effect**: with 500 waiters, a release wakes one client, not 500 that all rush to re-list and mostly go back to sleep. Fairness is FIFO by sequence number. The `guid` prefix handles the case where the create succeeded but the response was lost: the client can list and find its own znode instead of creating a duplicate.

The failure mode is session expiry. The client's session has a timeout (a few seconds to tens of seconds); if the client cannot heartbeat within it, ZooKeeper deletes its ephemeral znodes, the next waiter's watch fires, and the lock changes hands while the first client may still be working. The client library reports the expiry as an event, but the code mid-operation does not see it until it checks. That is the pause problem in ZooKeeper's clothing, and the answer is the same: the znode's `czxid` (creation zxid) or the sequence number is a monotonic fencing token; the resource rejects operations bearing a lower token than the last it accepted.

```mermaid
sequenceDiagram
    participant A as Client A
    participant Z as ZooKeeper
    participant B as Client B
    A->>Z: create /lock/l- EPHEMERAL SEQUENTIAL
    Z-->>A: /lock/l-0000000042 (lowest: held)
    B->>Z: create /lock/l- EPHEMERAL SEQUENTIAL
    Z-->>B: /lock/l-0000000043
    B->>Z: watch /lock/l-0000000042
    Note over A: session expires (pause or partition)
    Z->>Z: delete /lock/l-0000000042
    Z-->>B: watch fired
    B->>Z: list children
    Z-->>B: 0000000043 is lowest: held
    Note over A,B: A may still believe it holds the lock; fencing token 43 > 42 at the resource
```

## etcd locks

etcd's primitives are a lease (TTL, kept alive by the client) and a transaction with compare-and-swap semantics on key revisions. A lock is: create a lease; `Txn(if create_revision(key) == 0 then put key with lease)`; if the put succeeded you hold the lock; the key vanishes when the lease expires. etcd's `concurrency` package wraps this with a per-lock prefix and revision ordering so waiters queue fairly, watching the predecessor like ZooKeeper.

The fencing token is the key's `mod_revision` or the lease-holder key's `create_revision`: a cluster-wide monotonic counter from etcd's Raft log. It is returned with the acquisition and should be passed to the resource on every operation. Kubernetes' leader election is this pattern on a Lease object; Consul sessions with `acquire` on a KV key are the same shape with a session TTL.

Latency: a lock acquisition is a consensus write, a few milliseconds in-region (one Raft round trip plus fsyncs). Throughput: on the order of thousands of acquisitions per second per cluster, not hundreds of thousands. A lock service on the request hot path is a bottleneck; locks are for coarse-grained coordination (who leads, who owns partition 7, whether the nightly job has started), not per-request mutual exclusion.

```viz
{"type": "system", "scenario": "leader-lease", "nodes": 3,
 "title": "Leader election as a lease on a key", "caption": "Candidates try to create the leader key under their lease. One succeeds and renews; if it stops, the key expires and another candidate's create succeeds. The key's revision is the fencing token every follower and every protected resource compares against."}
```

## Leader election patterns

Leader election is a lock whose holder does the work while others wait. Three ways to get one:

**Lock-based.** Whoever holds the lock is leader; the others watch and take over on release. Simple; the leader is only as reliable as the lock's lease; fencing is via the lock's token.

**Lease on a key.** Kubernetes-style: the leader renews a record with its identity and a timestamp; candidates take over if the record is stale. Works on any store with conditional writes (a database row with `UPDATE ... WHERE holder = 'me' OR renew_time < now() - 15s`), no ZooKeeper needed; the store's row version is the fencing token.

**Consensus-internal.** The Raft group's own leader is *the* leader; there is no separate lock. This is what etcd itself does and what you get by embedding a Raft library. Fastest failover and strongest guarantees, at the cost of running consensus in your service.

```viz
{"type": "system", "scenario": "raft-election", "nodes": 3,
 "title": "Election built into the replication protocol", "caption": "When the service embeds consensus, leadership is a property of the log itself: the leader for the current term is the only node whose entries can commit, and a deposed leader's writes are rejected by term, which is fencing for free."}
```

In every case the leader does the same thing with its authority: it is the **single active writer** for some resource, and the resource must enforce that with a conditional write keyed on the token. DynamoDB's conditional expressions, S3's conditional puts on an ETag, Postgres's `UPDATE ... WHERE version = $expected` and Kafka's producer epoch (a zombie producer after a rebalance is fenced by epoch) are all the same mechanism.

## Alternatives to locks

Most lock requirements dissolve into one of these:

| Instead of | Use | Why it is better |
|---|---|---|
| Lock, read, modify, write, unlock | Optimistic concurrency: read with version, write `WHERE version = v`, retry on conflict | No lock service; conflicts are rare and cheap to retry; the version is the fence |
| Lock to ensure one job runs | Idempotent job with a unique-keyed "done" record | The second run is a harmless no-op; no lease timing to get right |
| Lock per key across services | Partition ownership: each key has exactly one owner by hash (Kafka consumer groups assign partitions to one consumer each) | Ownership is exclusive by construction; the assignment protocol fences with a generation number |
| Lock around a counter | Atomic increment (`INCR`, `UPDATE ... SET n = n + 1`) or a CRDT counter | The operation is already atomic or commutative |
| Global lock for exclusivity | Single writer per key by design; forward writes to the owner | Exclusivity without coordination on the hot path |

```sql
-- optimistic concurrency: the version check is the fence
UPDATE accounts
SET balance = balance - 30, version = version + 1
WHERE id = 42 AND version = 17;
-- 0 rows updated: someone else wrote first; re-read and retry
```

The design conversation in an interview should reach for these before reaching for a lock service. A lock is a serialisation point with a timing assumption; a conditional write is a serialisation point without one.

## Two worked examples

**The nightly statement job.** Make the job idempotent: for each customer, `INSERT INTO statements (customer_id, month) ... ON CONFLICT DO NOTHING`; only on a successful insert send the email; the email send carries an idempotency key of `(customer_id, month)` to the mail provider. Now twenty replicas can all start the job and the work is done once, with duplicate attempts skipping. Add an efficiency lock (single Redis `SET NX` with a 10-minute TTL keyed on the month) so that nineteen replicas do not waste CPU scanning. If Redis fails over and two replicas run, the outcome is still correct.

**A shard owner writing to object storage.** Owner of shard 7 is elected via an etcd lease; the acquisition returns revision 1,204. Every object write includes `x-fence-token: 1204` and the storage layer (a small proxy, or a conditional put against a per-shard version object) rejects tokens below the latest it has seen. Owner pauses for 20 seconds; the lease expires; a new owner acquires with revision 1,231 and writes; the old owner resumes and its write with 1,204 is rejected. The old owner treats the rejection as "I am no longer owner", stops, and re-enters the election.

## Failure modes

**Lock held after a crash.** No TTL; the holder dies; the lock is held forever; the job never runs again. Detect: lock age. Mitigate: every lock is a lease.

**TTL expiry mid-work.** The other side of the same coin: the holder is slow, the lease expires, a second holder starts. Detect: fencing rejections; duplicate side effects. Mitigate: fencing at the resource; idempotent work; renewal on a dedicated thread.

**Herd effect.** 500 waiters watch the lock; a release wakes all of them; ZooKeeper takes a burst of 500 list operations; most go back to waiting. Detect: request spikes on the lock service at each release. Mitigate: watch the predecessor only.

**Lock service on the hot path.** Every request takes a lock; the consensus cluster does 5,000 ops/s and the service needs 50,000. Detect: request latency dominated by lock acquisition; lock-service saturation. Mitigate: partition ownership or optimistic concurrency; locks only for coarse coordination.

**Session expiry unnoticed.** The ZooKeeper client's session expires; the code keeps running as if it holds the lock. Detect: fencing rejections. Mitigate: treat session expiry as fatal in the client (stop all work, re-elect); fencing at the resource for the window before it notices.

**Re-entrancy and lock stealing.** A holder re-acquires its own lock and the release logic frees it while an outer scope still needs it; or a client deletes another's lock because release does not check ownership. Detect: locks released by non-holders in the audit log. Mitigate: token-checked release; no re-entrancy across processes.

**Time-based validity as a safety guarantee.** "The lock is valid for 10 seconds, so I have 10 seconds" treated as a fact. Detect: a design review that asks "and if you pause for 11?". Mitigate: fencing; the lease bounds liveness, not safety.

## Interviewer follow-ups

**Q: "Twenty replicas, one nightly job. How do you run it exactly once?"**

I do not rely on the lock for that. I make the job idempotent: each unit of work inserts a uniquely keyed completion record and only acts on a successful insert, and the external side effect carries an idempotency key. Then the lock is an efficiency lock, a single Redis `SET NX PX` so nineteen replicas skip the scan, and if Redis fails over and two replicas run, the completion records make the second one a no-op. If someone insists the job cannot be made idempotent, I use an etcd lease with the revision as a fencing token and make the job's writes conditional on it, and I say that the lock service is now a dependency of the batch tier.

**Q: "Is Redlock safe?"**

Safe enough for efficiency locks, where a rare double holder wastes work; five independent masters make it more robust than one Redis node against master failure. Not sufficient for correctness locks, for two reasons Kleppmann laid out: its safety depends on bounded clock drift and bounded process pauses, which no one can guarantee, and it issues no fencing token, so a paused holder's late write cannot be rejected by the resource even if Redlock itself behaved perfectly. Antirez is right that every lease shares the timing assumption; the token is the part Redlock lacks. For correctness I use a consensus-backed lease with a token and enforce it at the resource, and I would rather redesign to a single writer than argue about which lock.

**Q: "Why watch only the predecessor znode in the ZooKeeper lock recipe?"**

To avoid the herd effect: if every waiter watched the lock itself, one release would wake all of them, and hundreds of clients would hit ZooKeeper with list requests at once, most of them only to go back to sleep. Watching the next-lower sequence number means a release wakes exactly one client, the one that is next in FIFO order, so the lock service sees O(1) work per release and the hand-off is fair.

**Q: "Where would you put a distributed lock in the request path?"**

Nowhere. A consensus-backed lock costs a Raft write, a few milliseconds and a few thousand per second cluster-wide; per-request locking would make the lock service the bottleneck and the outage domain of the whole product. In the request path I use conditional writes, `UPDATE ... WHERE version = $v`, which serialise conflicting updates at the database without a lock service and without a timing assumption, or I give each key a single owner by partitioning so there is nothing to lock. Locks are for who leads, who owns which partition, and whether the batch job has started.

**Q: "The leader's lease expired during a GC pause. Walk me through what happens."**

The lease service reassigns leadership to a candidate and issues a higher token. The old leader is paused, so it neither renews nor notices. It resumes and, because its last observation was "I am leader", it issues a write with its old token. The resource compares the token against the highest it has seen, which is the new leader's, and rejects the write. The old leader treats the rejection as loss of leadership, stops, and rejoins the election as a candidate. There is a window where nobody leads, bounded by the lease TTL, and there is no window where two leaders' writes both succeed. If the resource did not check tokens, the old leader's write would succeed and I would have a split brain, which is why the token check is the design's load-bearing element.

## Senior signals

- You ask **efficiency or correctness** before choosing a lock, and you convert most correctness locks into idempotent operations or conditional writes.
- You explain why a **single-Redis lock has two holders after failover** and what the ownership-checked release protects against.
- You can present **both sides of the Redlock debate** and give a verdict that depends on the lock's purpose.
- You know the **ZooKeeper recipe** including predecessor watches and the session-expiry failure, and etcd's lease-plus-revision equivalent.
- You keep lock services **off the hot path**, with the throughput number that says why.
- You describe leadership as **single active writer plus a fencing token enforced at the resource**, and you can name the conditional-write primitive in three different stores.

## Check yourself

```quiz
- q: >-
    A lock is held via SET NX PX on a single Redis primary with an asynchronous replica. The primary crashes and the replica is promoted. What can happen?
  options: ["The lock survives on the replica", "The lock key may be missing on the replica, so a second client acquires it while the first still holds it", "All clients lose their connections and the lock is released safely", "Redis refuses promotions while locks are held"]
  answer: 1
  explanation: >-
    Asynchronous replication means the SET may not have reached the replica before the crash. Two holders result. This makes a single-node Redis lock suitable for efficiency, not correctness.
- q: >-
    The most fundamental criticism of Redlock for correctness-critical locking is:
  options: ["It is too slow", "It requires five servers", "It does not produce a fencing token, so a paused holder's late operations cannot be rejected by the resource", "It uses Lua scripts"]
  answer: 2
  explanation: >-
    Even a perfect lock service cannot stop a holder that pauses past expiry from acting afterwards; only the resource can, and it needs a monotonic token to compare. Redlock's timing assumptions are the secondary concern.
- q: >-
    In the ZooKeeper lock recipe, a waiter should set a watch on:
  options: ["The lock directory, to see any change", "The znode with the next-lower sequence number", "Its own znode", "The current holder's znode regardless of order"]
  answer: 1
  explanation: >-
    Watching the immediate predecessor means each release wakes one client in FIFO order, avoiding the herd effect where every waiter wakes and re-lists on each release.
- q: >-
    Twenty replicas must run a nightly job once. The most robust design is:
  options: ["A ZooKeeper lock with a long session timeout", "Make each unit of work idempotent with a uniquely keyed completion record, then add a best-effort lock only to avoid wasted effort", "Redlock across five Redis nodes", "Run the job on only one replica by configuration"]
  answer: 1
  explanation: >-
    Idempotent work is correct even if the lock fails and two replicas run; the lock becomes an optimisation. Configuration pinning creates a single point of failure; stronger locks still have expiry windows.
- q: >-
    Which operation replaces a distributed lock around a read-modify-write on a database row without a timing assumption?
  options: ["A longer transaction", "A conditional update: UPDATE ... WHERE version = expected, retrying on zero rows", "A Redis lock with a shorter TTL", "A queue in front of the database"]
  answer: 1
  explanation: >-
    Optimistic concurrency serialises conflicting writes at the database; the version acts as the fence and there is no lease to expire. Locks and queues add coordination; longer transactions hold locks longer.
```

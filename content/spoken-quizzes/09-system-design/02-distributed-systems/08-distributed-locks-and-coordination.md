---
lesson: distributed-locks-and-coordination
source: fb1a3219bacf816e
---
## 1

A lock is taken with a set-if-not-exists, with an expiry, on a Redis primary that replicates asynchronously. The primary crashes, and a replica is promoted. What can happen?

A, the replica lacks the key, so a second client acquires the lock. B, all clients disconnect, and the lock is released safely. C, the lock survives, because replicas copy every key at once. D, Redis refuses to promote a replica while any lock is held.

[think]

The answer is A: the replica lacks the key, so a second client acquires the lock.

The primary acknowledged the write before replicating it, so the promoted replica may never have seen the key, and a second client acquires the lock while the first still works. Waiting for replication narrows the window, but does not make Redis strongly consistent. That makes a single-node Redis lock an efficiency lock.

## 2

Client 1 locks Redis nodes R1, R2 and R3, out of five. NTP then steps R3's clock forward 20 seconds, expiring its key. Client 2 locks R3, R4 and R5. What is the outcome?

A, both clients hold the lock at the same time. B, Redis refuses to apply the forward clock step. C, client 2 fails, since R3 still counts client 1. D, client 1's lock moves over to R4 and R5.

[think]

The answer is A: both clients hold the lock at the same time.

Redis compares a key's absolute expiry with the wall clock, so the step expires client 1's key on R3 early. Each client then has a majority of three, and both believe they hold the lock. This is Kleppmann's second timeline, and the same happens if R3 restarts without persistence.

## 3

Why can Redlock not provide fencing tokens?

A, its keys expire on wall-clock time, not monotonic time. B, its tokens would need five round trips per acquisition. C, its values are random, and its masters share no counter. D, its Lua release script is not atomic across all nodes.

[think]

The answer is C: its values are random, and its masters share no counter.

A fencing token must increase with every grant. A random value is unique but unordered, and five independent masters have no shared counter; producing one would need them to agree on the order of grants, which is consensus. etcd revisions and ZooKeeper sequence numbers are such counters. Wall-clock expiry is a separate weakness.

## 4

Waiters B, C and D queue behind holder A in a ZooKeeper lock, each watching its predecessor. C's session expires. What should D do?

A, nothing, since its watch was set on the parent. B, watch A's znode, because A is the current holder. C, take the lock, since its predecessor has gone. D, re-list the children, find B ahead, and watch B.

[think]

The answer is D: re-list the children, find B ahead, and watch B.

D's watch fires because C's znode was deleted, but a notification means re-check, not granted. D lists the children, sees A and B still ahead, and watches B, its new predecessor. Taking the lock would give two holders, and watching A or the parent brings back the herd effect.

## 5

Kubernetes leader election uses a 15-second lease, a 10-second renew deadline, and a 2-second retry. The leader's last renewal succeeds at 20 seconds, and then it loses the API server. When does it stop, and when can a candidate take over?

A, it stops at 30 seconds, and takeover is possible from about 30. B, it stops at 22 seconds, and takeover from about 24. C, it stops at 30 seconds, and takeover from about 35. D, it stops at 35 seconds, and takeover from about 30.

[think]

The answer is C: it stops at 30 seconds, and takeover from about 35.

The leader gives up when it has not renewed within the 10-second renew deadline, at 30 seconds. A candidate treats the lease as expired 15 seconds after it last observed a change, at 35, and acquires on its next retry. The 5-second gap is the safety margin; overlapping them would allow two leaders even without pauses.

## 6

Twenty replicas must run a nightly statement job once. Which design is the most robust?

A, idempotent work keyed per customer and month, with a lock only to save effort. B, a ZooKeeper lock with a long session timeout, held by the replica that runs it. C, Redlock across five independent Redis nodes, so that one failure cannot split it. D, a configuration flag that pins the job to one named replica of the twenty.

[think]

The answer is A: idempotent work keyed per customer and month, with a lock only to save effort.

With a uniquely keyed completion record per customer and month, and an idempotency key on the email, two replicas running at once still produce each statement once, so the lock only avoids wasted scanning. Stronger locks still expire under pauses, and pinning to one replica makes the job fail whenever that replica is down.

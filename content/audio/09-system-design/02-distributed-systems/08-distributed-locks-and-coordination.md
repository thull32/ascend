---
lesson: distributed-locks-and-coordination
source: 2140d9a5cf0b445b
fit: great
desk:
  - "The Redis lock code with its compare-and-delete release, and the release and failover traces"
  - "Redlock's validity arithmetic and the two debate timelines, as tables"
  - "The ZooKeeper queue trace and the etcd lock in Go"
  - "The Kubernetes leader election trace and the alternatives-to-locks table"
  - "Exercises: replay the ZooKeeper lock recipe, and find the second Redlock holder"
---
## Introduction

Twenty replicas of a service each run a nightly job that emails every customer a statement. The job must run once. The obvious answer is: take a distributed lock, run the job, release it. That is where the trouble starts. Which lock, held how, and what happens when the holder pauses for 30 seconds halfway through, loses the lock without noticing, and a second replica starts sending the same emails?

Four ideas. The question to ask before choosing any lock. Why Redis locks, and Redlock, end up with two holders. How ZooKeeper and etcd locks work, and why they can be fenced. And the alternatives you should reach for first.

## Efficiency or correctness

The first question a senior engineer asks about any distributed lock is what it is for.

If it prevents wasted work, two replicas computing the same report and one copy thrown away, then an occasional double holder costs money and nothing else. A fast, best-effort lock is fine. If it prevents incorrect results, two writers corrupting a file, two charges for one order, then no lock built on timeouts is enough by itself. The resource has to enforce exclusivity with a fencing token.

The nightly job is closer to correctness than it looks: a duplicate statement is a customer complaint. But the fix is not a stronger lock. It is an idempotent job. Record "statement sent to customer C for month M" under a unique key, and send only when that insert succeeds. Now two replicas running at once is harmless, the lock only saves CPU, and any lock will do. Most correctness locks dissolve under this question. The ones that remain need fencing.

## The single Redis lock

The standard Redis lock is one command: set the key only if it is absent, with an expiry of, say, 30 seconds. Setting only if absent is the atomic acquire. The expiry makes it a lease, so a crashed holder cannot block everyone forever. The value is a random token, new for every acquisition.

The token matters at release. Picture client A acquiring the lock, then stalling for longer than 30 seconds. The key expires. Client B acquires it. Then A wakes up and does a plain delete. It has just deleted B's lock, and a third client can walk in while B still works. So release must be a compare-and-delete: delete only if the key still holds my token, done atomically inside Redis, with a small script. And the token must be unique per acquisition, not per process; a hostname is shared by a restarted process.

Even done right, failover gives it two holders. Redis replicates asynchronously: the primary acknowledges the set before any replica has it. If the primary crashes a millisecond later, a replica is promoted without the key, and client B acquires the lock while A is still working. Waiting for a replica to acknowledge narrows the window but, as Redis itself documents, does not make it strongly consistent. A single-node lock, replicated or not, is an efficiency lock.

## Redlock and the debate

Redlock, proposed by Redis's author, antirez, removes the single node. It uses five independent masters with no replication between them. A client tries to set the key on all five, each with a short timeout. It holds the lock if a majority, three of five, succeeded, and if the time spent is less than the lease. Its validity is the lease minus the time spent, minus a small drift allowance.

A worked example: three of five succeed in 58 milliseconds, on a 10 second lease. The drift allowance is 102 milliseconds. So the client must finish its work within 9,840 milliseconds of when it started, on its own clock.

In 2016, Martin Kleppmann argued Redlock is unsafe for correctness, and antirez replied. Their disagreement is clearest as two timelines.

Timeline one: a pause past validity. Client 1 acquires, checks it has time, begins its write, and a garbage collection freezes it. At 10 seconds the keys expire. Client 2 acquires all five and writes. At 16 seconds client 1 wakes up and sends its write, which overwrites client 2's.

Timeline two: a clock jump on one node. Client 1 locks nodes one, two and three; four and five are partitioned from it. Then a time sync steps node three's clock forward 20 seconds. Redis stores expiry as absolute wall-clock time, so client 1's key on node three is now expired. Client 2 reaches nodes three, four and five. Before I say it: who holds the lock?

[pause]

Both of them. Each client saw a majority, and neither did anything wrong. A restart without persistence on node three gives the same result.

## The verdict

antirez's first point is right: the pause in timeline one afflicts every lock with automatic release, ZooKeeper's included. That is why fencing exists. But here is the precise conclusion.

For efficiency, Redlock is fine, though a single Redis node usually is too, at a fifth of the infrastructure. For correctness, Redlock is unsafe without fencing, because a pause, a clock step, or an unpersisted restart produces two holders. And Redlock cannot generate fencing tokens. Its values are random: unique, but unordered. Five independent masters share no counter, and making them agree on an order of grants would be consensus. At that point, use etcd or ZooKeeper, which already provide the counter.

## ZooKeeper and etcd locks

ZooKeeper's recipe uses ephemeral sequential nodes. Each client creates a node under the lock path, and ZooKeeper appends the next sequence number. The lowest number holds the lock. Everyone else watches only the node immediately before theirs. Release by deleting your node, and if your session expires, ZooKeeper deletes it for you.

Why watch only the predecessor? The herd effect. If 500 waiters all watched the whole lock directory, every release would fire 500 notifications and 500 listings of about 500 names each, roughly 250 thousand names shipped to hand the lock to one client. With predecessor watches, a release costs one notification and one listing, and the hand-off is first in, first out.

Now the trap. A holds the lock; B, C and D queue behind, each watching its predecessor. C's session expires, and D's watch fires. What should D do?

[pause]

Re-list the children, see that B is still ahead, and watch B. A fired watch means "re-check", not "you hold the lock". A client that treated it as a grant would run alongside A.

The holder learns late about its own expiry. The client library reports a disconnect when it loses its server, but learns the session expired only after it reconnects. Curator calls the first state suspended, meaning stop mutating and wait, and the second lost. A process paused through the whole timeout sees neither. The cure is the same as always: the sequence number increases with every node created, so it is a fencing token. Pass it with every operation and let the resource reject lower ones.

etcd's lock is the same shape: a key attached to a lease, ordered by revision. Every write to etcd gets the next revision of its Raft-replicated store, so revisions increase cluster-wide. The key with the lowest create revision holds the lock, and that revision is the fencing token. An acquisition costs a Raft write, a quorum round trip plus a disk sync, a few milliseconds. A cluster sustains on the order of thousands of lock operations a second. Locks are for coarse coordination, not per-request exclusion.

## Kubernetes leader election

Leader election is a lock whose holder does the work while the others wait. Kubernetes' controller manager and scheduler elect a leader on a Lease object, with a 15 second lease, a 10 second renew deadline and a 2 second retry. Candidates never compare the lease's timestamp to their own clock. Each records when it last saw the record change, and treats the lease as expired 15 seconds after that.

Trace it. The leader's last renewal succeeds at 20 seconds, then it loses the API server. It stops leading at 30 seconds, when its renew deadline passes. A candidate takes over at about 35 seconds, 15 seconds after it last saw a change. The 5 second gap with no leader is the safety margin.

Now replay it with the leader paused instead. It cannot notice its deadline while frozen, the candidate leads from 35 seconds, and when the old leader wakes up it can act as leader until its renewal loop notices. The client library's documentation says so directly: it does not guarantee only one leader is acting. Controllers mostly survive because every API object carries a version and updates are conditional on it. That is fencing per object, not per leadership, and it does not cover side effects outside the API server, such as a cloud provider call.

## Alternatives to locks

Reach for these before a lock service. A conditional write, compare-and-set, where the compared value is the fence: DynamoDB condition expressions, S3 conditional puts, an update with "where version equals 17". Single-writer partitioning, where each key has one owner and the assignment's generation fences zombies, as in Kafka consumer groups. And idempotent operations, where duplicates are harmless. A lock is a serialisation point with a timing assumption; a conditional write is a serialisation point without one.

## In the interview

"Is Redlock safe?"

[pause]

For efficiency, yes, and it keeps working when a minority of masters fail. For correctness, no: a pause past validity, a clock step or an unpersisted restart on one node gives two holders, and it cannot produce a fencing token because its values are random and its masters share no counter. For correctness, use etcd or ZooKeeper, with the resource checking the token. The wrong answer is "yes, it uses a majority, like Raft."

And: where would you put a distributed lock in the request path? Nowhere. A consensus lock costs a Raft write, milliseconds, from a cluster-wide budget of thousands a second, so per-request locking makes the lock service your bottleneck and your outage domain. Use conditional writes, or give each key a single owner by partitioning.

## Recap

Four things to remember. Ask efficiency or correctness first, and turn most correctness locks into idempotent work, conditional writes or single ownership. A Redis lock needs a random per-acquisition token and an atomic compare-and-delete, and still has two holders after a failover. Redlock is fine for efficiency, unsafe for correctness, and unable to fence, because random values have no order. ZooKeeper and etcd locks also get two holders under a pause, but they hand you a sequence number or revision the resource can check, and a fired watch means re-check, not granted.

At your desk: the Redis lock code and its traces, Redlock's arithmetic and the two timelines, the ZooKeeper and etcd traces, the Kubernetes election trace, and the two exercises.

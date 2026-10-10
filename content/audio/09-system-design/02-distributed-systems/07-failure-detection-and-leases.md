---
lesson: failure-detection-and-leases
source: f260c4b89a3bdccb
fit: great
desk:
  - "The false-suspicion simulation table, row by row"
  - "Phi computed by hand under the normal, Akka and Cassandra models, with the code"
  - "The lease clock arithmetic and the GC pause trace, as timelines"
  - "The fenced SQL write, and the Kubernetes, Chubby, Spanner and etcd lease settings"
  - "Exercises: compute phi the way Akka does, and enforce fencing tokens at the storage"
---
## Introduction

The primary has not sent a heartbeat for 8 seconds. Is it dead? If it is, and you wait, every write stalls while you wait. If it is not, if it is 12 seconds into a full garbage collection, or a switch is dropping its packets in one direction, and you promote a replica, you now have two primaries. And the old one will resume writing as though nothing happened.

From outside, a crashed process, a paused process and a partitioned process look exactly the same: silence. A failure detector is a guess, and its only knobs are how long you wait and how often you are wrong.

Three ideas, then. How a detector trades detection time against false alarms, and why phi-accrual does not escape that trade. How a lease lets you act on the guess, and where its safety ends. And the fencing token, which turns a lease from probably safe into safe.

## Heartbeats and the price list

A heartbeat is a periodic "I am alive" message. The detector declares failure after some timeout of silence. A false suspicion is a live node that went quiet for longer than the timeout: a stop-the-world garbage collection, a hypervisor stall, a heartbeat thread starved of CPU, a TCP retransmission, which on Linux is at least 200 milliseconds late.

Real systems choose the timeout from the cost of being wrong, and you can read their settings as a price list. etcd heartbeats every 100 milliseconds and calls an election after about a second, because an election is cheap. A Kubernetes node renews its lease every 10 seconds and is declared unreachable after 50 seconds, 40 before version 1.32. HDFS waits ten and a half minutes before declaring a data node dead, because that declaration starts copying terabytes. A load balancer acts in seconds, because putting an instance back costs nothing.

## The trade, simulated

The lesson simulated one node over 40 thousand node-hours. Heartbeats every second. Small pauses every 10 seconds or so, and a long stall about once an hour, with a heavy tail: one stall in ten lasts past 1.8 seconds, one in a hundred past 5 seconds, one in a thousand past 11.

Here are the numbers that matter. A fixed 2 second timeout raised 0.15 false suspicions per node-hour. Across a fleet of a thousand nodes, that is 3,500 false alarms a day. A 5 second timeout: 350 a day. Ten seconds: 37 a day. Thirty seconds: none in the whole simulation.

Three readings. First, detection time after a real crash is the threshold minus half a heartbeat interval, whatever the detector. Second, the false-suspicion rate is just the pause tail: how many stalls an hour, times the chance one outlasts your threshold. Going from 5 seconds to 10 cut it ninefold. Third, fleet size turns a small rate into a stream. A rate of 0.015 per node-hour sounds like nothing until it is 350 pages a day.

The numbers belong to this pause model. For your own system, read the threshold off the tail of your real heartbeat histogram and your garbage collection logs.

## Phi-accrual and its broken promise

A fixed timeout is a step: alive until the timeout, dead after. The phi-accrual detector outputs a continuous suspicion level instead. It fits a distribution to the recent gaps between heartbeats and asks: how likely is a live node's heartbeat to be this late? Phi is minus the log base ten of that probability. Phi of 1 means a 10 percent chance. Phi of 2, 1 percent. Phi of 8, one in a hundred million.

The lesson's example: heartbeats with a mean gap of 1,000 milliseconds and a standard deviation of 100. Under a normal distribution, phi reaches 8 at 5.61 standard deviations past the mean. That is 1,561 milliseconds, just over a second and a half after the last heartbeat.

So the threshold promises a false alarm once in a hundred million heartbeats. Before I tell you what the simulation measured, what do you expect?

[pause]

0.25 false suspicions per node-hour. About 7 thousand times the promise. The reason is that a window of calm heartbeats has never seen a pause. The fitted tail is thin exactly where real pauses are heavy.

Real systems patch this two ways. Akka adds an acceptable heartbeat pause, 3 seconds by default, to the mean, and floors the standard deviation at 100 milliseconds. A steady cluster then marks a silent member unreachable about four and a half seconds after its last heartbeat. That allowance tells the detector how long a live process can stall, something calm heartbeats can never teach it, and in the simulation it cut false suspicions from 0.25 to 0.02 per node-hour, for 3 extra seconds of detection.

Cassandra instead models the gaps as exponential. Then phi is simply linear in the silence, with no variance term, and the default threshold of 8 convicts after about 18 seconds with one-second gossip. Cassandra also never records a gap longer than two seconds, so an outage cannot teach the detector that outages are normal. Both designs end up as a timeout proportional to the typical interval, plus slack for pauses, but one that adapts per peer.

## Suspect, then convict

What you do on a suspicion matters as much as when. Stopping routing to a node costs seconds of capacity if you were wrong, and reverses at the next good heartbeat. Reassigning its work means two workers on one partition for a while, so consumers must be idempotent. Re-replicating its data cannot be undone: 4 terabytes at a gigabyte a second is over an hour of disk and network taken from live traffic. And taking over its authority, promoting, electing, granting its lock, means two nodes exercising an exclusive power. Split brain, unless fenced.

So a detector should only suspect. Conviction is a separate, slower decision. Suspicion is cheap and local: stop sending the node requests. Conviction starts irreversible work, so it waits longer, gathers evidence from several observers, and is made once, by one decision-maker. SWIM has other members probe before suspecting and lets the node refute it. Kubernetes stops scheduling on a node at 40 to 50 seconds and evicts 300 seconds later.

Correlation is the other reason to wait. A switch reboot silences a whole rack, and convicting on first suspicion turns one blip into a re-replication storm.

## Leases and the clock rule

A lease is authority, leadership, a lock, ownership of a partition, granted for a bounded time. If the holder cannot renew before expiry, the authority lapses without any message reaching it. A crashed process's lock is held until someone breaks it. Its lease ends by itself.

Renew early: etcd's client sends a keepalive every third of the lease, so a 10 second lease survives two lost keepalives. And the lease length bounds failover from below. A 30 second lease cannot fail over in under 30 seconds.

A lease gives liveness: a crashed holder cannot block the system forever. Whether it gives safety, at most one holder acting at a time, depends on clocks and pauses.

The holder and the grantor measure one lease on two different clocks. Two rules make that safe. The holder starts its clock when it sends the request, not when the grant arrives, and stops acting a little early: the lease shrunk by the drift bound, minus a safety margin. The grantor reassigns a little late: the lease grown by the drift bound, plus the margin. With a 10 second lease, 200 parts per million of drift and a 100 millisecond margin, the holder stops at 9.898 seconds and the grantor waits 10.102. The holder always finishes first.

Notice the drift term is only 2 milliseconds on a 10 second lease. Drift is not the threat. Pauses are.

## The pause that no lease fixes

Picture three actors: client A, client B, and the storage. A holds a 10 second lease. One second in, A checks its lease, sees almost 9 seconds left, and enters its write path. Then a full garbage collection freezes it for 15 seconds.

At about 10.1 seconds, the grantor's wait ends. At 10.3, B acquires the lease and writes. At 16, A wakes up mid-write and sends its value, already past its check. A's write overwrites B's.

[pause]

A's check was correct when it ran. No margin helps, because the pause is longer than the lease, and a shorter lease makes the overlap more likely, not less. A virtual machine freeze can be worse: the monotonic clock may not count suspended time, so even a re-check just before the write says 8.9 seconds remain, and A overwrites B with every check passing. A lease gives liveness. Something else has to give safety.

## Fencing tokens

That something is the fencing token, the fix Martin Kleppmann laid out in 2016 and that Chubby shipped as sequencers a decade earlier. Every grant carries a number that increases with each grant: 33 to A, 34 to B. Every operation on the protected resource carries the token. The resource remembers the highest token it has accepted and rejects anything lower.

Replay the trace. B writes with 34, and storage records 34. A wakes and writes with 33. Storage says 33 is less than 34: rejected, and A steps down.

The storage has four duties. Check and write atomically, in one conditional write; in SQL that is one column and one where clause. Accept equal and reject lower, because one holder writes many times under one token. Store the highest token durably with the data, because a node that forgets it on restart accepts 33 again. And let the new holder fence before it reads: storage rejects 33 only once it has seen 34, so B should touch the resource with 34 first, a fenced read or a no-op write, before relying on anything it reads.

The token must come from the grantor's consensus-replicated state: a ZooKeeper sequence number, an etcd revision, a Raft term. Never a wall clock, a per-client counter, or a random value, which is unique but not ordered. And a resource that cannot check anything, a third-party API or an email provider, cannot be protected by a lease at all. Use an idempotency key, a single writer by construction, or state the risk.

## In the interview

The lesson's follow-up: a client holds a 10 second lease and pauses for 15 seconds. What happens to its writes?

[pause]

Without fencing, they overwrite the new holder's work, because the check happened before the pause. With fencing, the storage has seen 34 and rejects 33, and the new holder fences before it reads. The common wrong answers are "re-check the lease before writing" and "use a shorter lease". Neither helps.

And the other one: your primary stops heartbeating; when do you fail over, and why that number? From the measured pause tail and the cost of a wrong failover. In the lesson's model, a 5 second threshold is about 350 false alarms a day across a thousand nodes, and a database failover is expensive, so 10 to 30 seconds. Either way the promotion carries a higher epoch that storage enforces, so a wrong guess costs an aborted write, not a forked history. "After three missed heartbeats", with no mention of pauses or fencing, is the answer that fails.

## Recap

Four things to remember. Crashed, slow and partitioned look identical, so every detector is a false-suspicion rate traded against detection time, and the pause tail sets the rate. Phi of 8 promises one in a hundred million and delivers far worse, because calm heartbeats never saw a pause; Akka adds a pause allowance and Cassandra goes exponential. Suspect cheaply, convict slowly and once. And a lease gives liveness, not safety: drift is milliseconds, pauses are seconds, and only a fencing token checked atomically at the resource stops the paused holder.

At your desk: the simulation table, phi computed by hand, the lease and pause timelines, the fenced SQL write, and the two exercises.

---
lesson: replication
source: aaa2cece9c8218b7
fit: great
desk:
  - "The four replication positions and the lag diagnosis query"
  - "The synchronous commit levels table and the commit sequence diagram"
  - "The failover diagram and the recovery-point and recovery-time table"
  - "Exercise: turn replay lag in bytes into lag in seconds"
---
## Introduction

A user saves their profile, the page redirects, and the old name is displayed. They refresh, and the new name appears. Nothing in your code is wrong. The update went to the primary, the redirect's read went to a replica that had not applied it yet, and the refresh happened to land after it had.

This is the most common replication bug in production, and every senior interview about scaling reads eventually arrives at it.

Replication in Postgres is not a separate subsystem. It is the write-ahead log, sent over a network connection and replayed on another machine. Once you see it that way, lag, failover, slots, synchronous commit and read-your-writes all reduce to one question: which LSN, which position in the log, has each machine reached? The numbers here come from a lab primary running about 44 thousand single-row updates a second.

## The log over a socket

A physical replica starts as a byte-for-byte copy of the primary's data directory, taken at a known position in the log. From then on, three processes cooperate. A sender on the primary reads the log as it is written and streams it. A receiver on the replica writes those bytes to its own disk and flushes them. And the startup process on the replica replays them against its pages, exactly as crash recovery would. A replica is permanently a database in recovery that also happens to accept read-only queries.

In the lab, that update workload generated 29 megabytes of log in 6 seconds, about 110 bytes per update. A streaming client on a local socket stayed 8 to 16 kilobytes behind, about 7 to 8 milliseconds. That is the floor. On a real network, add the round trip, and replay adds its own delay on top.

Because the stream is physical, the replica is an exact copy: same tables, same indexes, same bloat, same major version. It cannot hold a subset of tables, cross a major version, or accept writes.

Logical replication decodes the same log into row changes, like "insert into orders with these values", and applies them on a subscriber as ordinary SQL. The subscriber can run a different major version, take only some tables, add its own indexes, and even be written to. That is how you do a near-zero-downtime major upgrade or feed a warehouse. It does not replicate schema changes or sequence values.

## Four positions, and how bytes become seconds

For each replica, the primary shows four positions. Sent: handed to the socket. Write: written by the replica but not yet flushed. Flush: durable on the replica. Replay: applied, and visible to queries there.

Lag in bytes is simply the primary's current position minus one of those. Lag in seconds is cleverer. The sender keeps a ring of samples, each a log position and the time the primary was there. When the replica reports how far it has replayed, the sender finds the two samples either side of that position, interpolates to estimate when the primary was there, and subtracts that from now.

Two consequences. First, bytes and seconds disagree whenever the write rate is uneven. Four megabytes behind during a steady 5 megabytes a second is 0.8 seconds of lag. Four megabytes behind after a burst that ended a second ago is a second or more. Same bytes, different seconds.

Second, when the primary goes idle, byte lag drops to zero as soon as the replica catches up, even if the last transaction was minutes ago. Meanwhile the replica-side measure, "time since the last replayed commit", keeps growing even with zero lag. So alert on the primary's replay lag, or on that replica-side value only when you know writes are flowing.

## Slots, and what synchronous commit costs

A replica that falls behind or disconnects needs log the primary would otherwise recycle. A replication slot is the primary's promise to keep that log until the consumer confirms it. The promise is unconditional.

In the lab, with the streaming client stopped, the slot's retained log grew from under a megabyte to 30 megabytes in 6 seconds. At that rate an abandoned slot holds 18 gigabytes an hour, 430 a day, and the primary stops when its disk fills. There is a setting that caps the retention: past it, the slot is invalidated and that one consumer must be rebuilt. An invalidated slot is a support ticket. A full disk is an outage. Set the cap, and alert long before it.

Now synchronous commit. By default replication is asynchronous: commit returns once the log is flushed locally, and the replica gets it whenever the network delivers. If the primary is destroyed a moment after acknowledging, that transaction is gone.

Synchronous commit decides how far the commit record must travel first. Off: it returns before even the local flush, which cost 0.16 milliseconds a commit instead of 1.6 in the lab, and a crash loses the last fraction of a second. Local: the local flush only. Remote write: the standby's operating system has it. On: the standby has flushed it, which costs a network round trip plus the standby's flush. And remote apply: the standby has replayed it, so reads there see it.

The round trip is geography: well under a millisecond within one availability zone, single-digit milliseconds between zones in a region, tens of milliseconds between regions. Group commit still helps, because one acknowledgement covers every commit flushed before it.

And here is the sharp edge. You configure one synchronous standby, and it reboots. What happens to writes on the primary?

[pause]

They hang. The primary was told not to acknowledge without that standby, and it obeys rather than silently downgrading durability. A single synchronous standby gives you worse write availability than no replication at all. Production configurations name several candidates and require any one of them.

## Lag, catch-up and conflicts

Which of the four gaps is large tells you where to look. Lots unsent: the primary's sender or the network cannot keep up. Lots unflushed but little unsent: the replica's disk is slow. Little unflushed but lots unreplayed: the log arrived, and replay is behind. That usually means single-threaded replay on an undersized replica, a burst from a bulk load, or a query on the replica conflicting with replay.

Catch-up is arithmetic. A replica 112 megabytes behind, while the primary writes 5 megabytes a second and the replica can replay 20, gains 15 a second, and catches up in 7.5 seconds. But if replay capacity is 4 against 5 megabytes of log, lag grows by a megabyte a second, 3.6 gigabytes an hour, and never recovers until load drops. Replay capacity is the number to know, and it is why replicas should not be smaller than the primary.

Conflicts. Replay sometimes needs to remove row versions a replica query can still see, because vacuum on the primary removed them. Replay waits up to 30 seconds by default, then cancels the query. You can have the replica report its oldest snapshot back so vacuum keeps those versions, but that trades cancelled replica queries for bloat on the primary.

And one thing replicas never do: scale writes. Every replica applies every write, single-threaded, on top of its read load. Replicas add read capacity and zero write capacity. When writes are the bottleneck, you need partitioning and sharding.

## Read-your-writes

Back to the profile bug. Three fixes, in rising engineering cost.

Route by session. After a user writes, pin that user's reads to the primary for a window longer than your 99th percentile lag, say 5 seconds. Cheap, and usually enough. When lag spikes past the window, the bug returns.

Route by LSN. After the write, capture the primary's current log position and hand it to the client in a cookie or header. For the next read, pick a replica whose replay position is at least that far, or fall back to the primary. This is exact rather than a guess. Carry the highest position the client has seen and you also get monotonic reads: time never runs backwards between two replicas.

Or use remote apply to a designated replica. The database enforces it, and every write pays for replay.

"Always read from the primary" is what most teams do after the first bug report. It means the replicas exist only for failover. That can be the right decision, but say it out loud.

## Failover and split brain

When the primary dies, a replica is promoted: it stops replaying, opens for writes, and starts a new timeline so its history cannot be confused with the old primary's. Three things go wrong.

Data loss. With asynchronous replication, anything the old primary acknowledged but the replica never received is gone. Patroni, the common failover manager, bounds it by refusing to promote a replica more than 1 megabyte behind, by default. Only synchronous replication removes it.

Split brain. The old primary was not dead, only unreachable from the monitor. Now two nodes accept writes, and their histories diverge for good. Preventing it requires fencing: the old primary must be unable to write before the new one is promoted. Patroni does it with a lease in etcd. The leader must renew a key every 10 seconds, with a time-to-live of 30, and a leader that cannot renew demotes itself. So a failover takes roughly the lease time plus promotion, around 30 to 60 seconds. Managed services document 60 to 120 seconds, during which writes fail.

And the old primary cannot simply rejoin; its timeline has diverged. A tool called pg rewind can turn it back into a replica, but only if data checksums or WAL log hints were enabled before the incident. The lab cluster, left at defaults, had both off and could not be rewound. Enable them on day one.

Two more shapes worth knowing. Cascading replicas stream from another replica, so ten replicas do not mean ten full streams leaving the primary. And a delayed replica applies the log an hour late. That hour is your undo window for the delete without a where clause, which every other replica copied within milliseconds.

## In the interview

Here is a follow-up the lesson expects. Lag is zero bytes, but the dashboard says the replica is 3 minutes behind. Who is right?

[pause]

Probably both. With no writes, byte lag is zero, while the time since the last replayed commit grows because that commit is old. Use the primary's replay lag, which is only computed while log is flowing. The wrong answer is "the replica is stuck".

And the other classic: how does Patroni prevent split brain? The leader holds a lease with a time-to-live and demotes itself if it cannot renew. A replica is promoted only after the lease expires, so two leaders never overlap. Do not say "the monitor kills the old primary". That fails exactly when the monitor cannot reach it.

## Recap

Five things to remember. Replication is the write-ahead log streamed and replayed, and lag is a difference of positions: sent, written, flushed, replayed, each pointing at a different bottleneck. Bytes and seconds disagree during bursts and idle periods, so watch both. Bound your slots, or an abandoned one fills the disk. One synchronous standby turns a replica reboot into a write outage; require any one of several. And read-your-writes is a routing decision, by session or by LSN, while failover is safe only with fencing.

At your desk: the four positions and the lag query, the synchronous commit table, the failover diagram and its recovery table, and the replay lag interpolation exercise.

---
lesson: replication
source: bfabb65e05580817
---
## 1

A user updates their display name, is redirected, and sees the old name. A refresh shows the new one. Which fix has the least cost on the write path?

A, route that user's reads by the log position of their write, or to the primary. B, add replicas, so that read load, and therefore lag, is spread out. C, make every transaction's commit wait until the replicas have applied it. D, switch to logical replication, so that row changes apply faster.

[think]

The answer is A: route the user's reads by their write position, or to the primary.

Routing by log position, or pinning briefly to the primary, affects only the user who wrote, and adds nothing to commits. Making every commit wait for replay fixes it, but at a cost on every write. More replicas do not reduce lag, and logical replication applies changes more slowly, not faster.

## 2

The replication view shows almost nothing unflushed on the replica, but 112 megabytes not yet replayed. The primary writes 5 megabytes a second, and the replica can replay 20. What is happening, and how long until it catches up?

A, the replica's disk is slow; about 22 seconds at the flush rate. B, the slot was invalidated; it cannot catch up without a rebuild. C, the log arrived but replay is behind; about 7.5 seconds. D, the network is saturated; it catches up once the link frees.

[think]

The answer is C: the log arrived but replay is behind, about 7.5 seconds.

Flushed but not replayed means the bytes are on the replica, and the startup process is behind. It gains 20 minus 5, so 15 megabytes a second, and 112 megabytes takes about 7.5 seconds. If replay capacity were below the log rate, lag would grow without bound. Network or disk problems would show as unsent or unflushed bytes.

## 3

With its streaming client stopped, an inactive replication slot's retained log grew from under a megabyte to 30 megabytes in 6 seconds. What is the danger, and the guard?

A, replicas stop streaming at once; restart the sender process to release it. B, the log piles up until the disk fills; cap it with the maximum slot keep size. C, the slot is dropped after a timeout; raise the general log keep size to protect it. D, commits slow down as the slot grows; add a second standby to share it.

[think]

The answer is B: the log piles up until the disk fills, so cap it with the maximum slot keep size.

A slot promises to keep the log until its consumer confirms, and an absent consumer never does: at this rate, about 18 gigabytes an hour. Postgres never drops idle slots by itself. The maximum slot keep size invalidates the slot past a limit, turning a disk-full outage into a rebuild of one consumer.

## 4

You name a single synchronous standby, replica A, with synchronous commit on. Replica A reboots. What happens to writes on the primary?

A, they fail at once with an error that no standby is available. B, they commit locally and queue in the slot for replica A. C, they hang until replica A returns or the setting is changed. D, they continue asynchronously until replica A reconnects.

[think]

The answer is C: they hang until replica A returns or the setting is changed.

The primary will not acknowledge without the confirmation it was told to wait for, and it does not silently downgrade durability. That is why one synchronous standby reduces write availability, and why production lists several candidates, so that any one of them can confirm.

## 5

A replica is 4 megabytes behind the primary. In one case, the primary is writing a steady 5 megabytes a second. In the other, a 4 megabyte burst ended a second ago, and nothing has been written since. Which statement about the replay lag, in seconds, is right?

A, about 0.8 seconds in the steady case, and over a second after the burst. B, both are 0.8 seconds, because lag in seconds is bytes divided by the write rate. C, both are zero, because replay lag only counts commits the primary has not sent. D, neither can be known, because replay lag is only measured when the replica is idle.

[think]

The answer is A: about 0.8 seconds in the steady case, and over a second after the burst.

Replay lag interpolates, from time-stamped samples, when the primary was at the replayed log position. In the steady stream, 4 megabytes of log covered 0.8 seconds. After the burst, the primary passed that position more than a second ago, so the lag in time is larger, even though the bytes are equal. That is why bytes and seconds are both worth watching.

## 6

During a network partition, the failover manager promotes a replica while the old primary is still running, but cut off from the manager. What must be true for this to be safe?

A, every replica must first reach the same log position as the one being promoted. B, the old primary must first finish its checkpoint and flush all its dirty pages. C, the old primary must have stopped accepting writes, for example because its lease expired. D, all replication slots on the old primary must be dropped before promotion.

[think]

The answer is C: the old primary must have stopped accepting writes, for example when its lease expired.

Two writable primaries create divergent histories that cannot be merged. Fencing guarantees at most one writer: with Patroni, the leader demotes itself when it cannot renew its lease in etcd, and promotion waits until the lease has expired. Equal log positions, checkpoints and slots do not prevent split brain.

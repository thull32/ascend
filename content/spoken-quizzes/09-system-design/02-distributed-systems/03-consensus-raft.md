---
lesson: consensus-raft
source: 9d09a5b259147fc3
---
## 1

A Raft candidate requests votes in term 7. Its last log entry is at index 40, from term 5. A voter's last entry is at index 38, from term 6. Does the voter grant the vote?

A, yes, because the candidate's index 40 is greater than the voter's 38. B, no, because the voter's last entry has a higher term. C, yes, because the candidate's term 7 is higher than 6. D, only if the voter has not already voted in term 7.

[think]

The answer is B: no, because the voter's last entry has a higher term.

Being up to date compares the last entry's term first, then its index. Term 6 beats term 5 regardless of index, so the voter's log is more up to date, and it refuses. The candidate's term 7 only entitles it to ask, and not having voted yet is necessary but not sufficient.

## 2

Two followers time out 2 milliseconds apart, both become candidates in term 2, and each collects one other vote, in a five-server cluster with the leader down. What happens next?

A, the candidate with the higher server ID takes over the term. B, both become leaders of term 2 until the next heartbeat. C, the remaining follower breaks the tie by voting again. D, their timers re-arm randomly, and one wins a later term.

[think]

The answer is D: their timers re-arm randomly, and one wins a later term.

With two votes each and three needed, term 2 has no leader. Each candidate re-arms with a fresh random timeout, and the one that fires first starts term 3, and usually wins. Servers vote once per term, so nobody votes again in term 2, and election safety forbids two leaders in one term.

## 3

A five-server Raft leader's match indexes are 9 for itself, and 9, 6, 7 and 5 for its followers. All entries are from the current term. What is the commit index?

A, 5, the lowest index held by every server. B, 6, the median of the four follower indexes. C, 9, because the leader and one follower have it. D, 7, the third highest of the five match indexes.

[think]

The answer is D: 7, the third highest of the five match indexes.

Sorted, the match indexes are 9, 9, 7, 6 and 5. A majority of five is three servers, and three of them hold index 7 or more, so 7 is committed. Waiting for every server would let the slowest follower set the pace.

## 4

Why does a newly elected Raft leader append a no-op entry immediately?

A, to trigger a snapshot, so lagging followers can catch up. B, to announce the membership configuration to followers. C, to commit a current-term entry, which commits the older ones. D, to reset every follower's election timer in the new term.

[think]

The answer is C: to commit a current-term entry, which commits the older ones.

A leader may not commit an entry from an earlier term by counting replicas, because a server with a higher last term could still win and overwrite it. Committing an entry from the current term makes the whole prefix safe, through log matching. Heartbeats, not the no-op, reset election timers.

## 5

A new Raft leader probes a follower at log index 9, term 6, and is rejected. The follower's log holds 8 entries, with terms 1, 1, 1, 2, 2, 2, 3 and 3. What does the follower hold after repair?

A, its 8 entries, plus the leader's entry 9 appended. B, entries 1 to 3 kept, then the leader's entries 4 to 9. C, nothing, because it must receive a full snapshot. D, entries 1 to 6 kept, then the leader's entries 7 to 9.

[think]

The answer is B: entries 1 to 3 kept, then the leader's entries 4 to 9.

The leader backs off until index 3, term 1 matches, and log matching then proves entries 1 to 3 are identical. The follower deletes its entries 4 to 8, which were never committed, and appends the leader's 4 to 9. A snapshot is needed only when the leader has discarded the entries the follower lacks.

## 6

An etcd cluster's write latency jumps, and leader elections become frequent. What is the most likely cause?

A, too many clients holding watches open on the leader. B, clock skew between nodes corrupting election timers. C, an even number of members splitting every vote. D, slow WAL fsync, delaying appends and heartbeats alike.

[think]

The answer is D: slow WAL fsync, delaying appends and heartbeats alike.

Commits wait for fsync on the leader and a majority, and heartbeats share the WAL path, so a stalling disk delays heartbeats, and followers time out and elect. Election timers are local monotonic durations, so skew does not affect them. Fix the disk, with a 99th percentile fsync under 10 milliseconds, before raising timeouts.

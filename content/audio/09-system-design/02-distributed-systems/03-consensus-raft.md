---
lesson: consensus-raft
source: 60653557d82ef895
fit: partial
desk:
  - "The split-vote election trace, millisecond by millisecond, and the election-time simulation table"
  - "The commit index advancing as match indexes arrive"
  - "Repairing a divergent follower probe by probe, with and without the conflict-term hint"
  - "The Figure 8 schedule, step by step"
  - "The partition trace, and the configuration comparison"
---
## Introduction

Five servers must agree on the order of operations in a log, so that each can apply the same operations to a copy of a state machine and end up in the same state. Any two of them may crash. Messages may be delayed or lost. There is no shared clock.

Quorum replication does not solve this. It gets you overlap, not agreement: two writers with disjoint write sets leave the replicas with no single order. Consensus produces one order, and Raft is the algorithm behind etcd, Consul, CockroachDB, TiKV and Kafka's controllers.

Raft is understandable because it splits the problem in three. Elect one leader. Let the leader dictate the log. And make sure every new leader already has every committed entry. That third part hides the rule almost everyone gets wrong, and we will get to it.

Each server holds a log of entries, each with an index and a term, and applies committed entries in index order. A server is a follower, a candidate or a leader. Time is divided into numbered terms, each with at most one leader. Two messages do all the work: request a vote, and append entries, which doubles as the heartbeat. Any message with a higher term makes the receiver adopt that term and become a follower.

A cluster of 2f plus 1 servers tolerates f failures. Three survive one; five survive two. Every decision needs a majority, and any two majorities share at least one server. Every safety argument in Raft rests on that overlap.

Four servers still tolerate only one failure, and need three votes instead of two. Even sizes buy nothing.

## Leader election

A follower that hears no heartbeat for its election timeout becomes a candidate. It increments the term, votes for itself, and asks everyone else. The timeout is drawn at random, say between 150 and 300 milliseconds.

A server grants its vote if it has not voted in this term, and if the candidate's log is at least as up to date as its own. Up to date means: compare the term of the last entry first, and the index only as a tie-breaker. A candidate with a majority becomes leader and starts sending heartbeats.

Picture a split vote. The leader of five crashes. Two followers time out 2 milliseconds apart, both become candidates in term 2, and each collects exactly one other vote. Each has two of the three it needs, and nobody else will vote again in term 2. What happens?

[pause]

Nothing, for a while. Term 2 has no leader. Each candidate re-arms with a fresh random timeout, and whichever fires first starts term 3 and wins it. The randomness is the whole mechanism: a split vote happens only when two timers fire within about one message delay of each other, and the fresh draw makes a second collision unlikely.

The lesson simulated 20 thousand elections per setting. With a 150 to 300 millisecond range and a 1 millisecond network, under 1 percent of elections needed a second term, and the median time to a leader was 176 milliseconds. Shrink the range to just 5 milliseconds wide, and 98 percent of elections collided, needing a median of six terms.

Two rules fall out. The random range must be wide relative to the message delay. And the timeout must be far above the round trip, or candidates give up before their votes return. etcd asks for an election timeout of at least ten times the round trip; its defaults are a 100 millisecond heartbeat and a 1 second election timeout.

## Replication and the commit index

The leader appends a client command to its own log, tagged with its term, and sends it to every follower along with the index and term of the entry just before it. For each follower, it tracks the highest index known to be replicated there.

An entry is committed when a majority holds it, and, crucially, when it is from the leader's current term. Then the leader applies it, answers the client, and tells followers the new commit index on the next message.

Here is the shortcut: with five servers, the commit index is the third highest of the five match indexes, which is the median. Say the leader and two followers hold index 7, and two slow followers are stuck at 4. Index 7 is committed. Two slow followers do not delay a commit. Three would.

A write therefore costs one round trip to the fastest majority plus a disk flush on each server in it: about 1 to 2 milliseconds within a region on SSDs, and 60 to 80 milliseconds for a cluster spread across regions.

## Log matching and repair

A follower accepts new entries only if its log already holds an entry at the previous index with the previous term. By induction, that gives the log matching property: if two logs have an entry with the same index and term, they are identical up to that point. A leader never compares whole logs. One matching pair proves the whole prefix.

After leader changes, a follower can hold entries that never committed. The new leader probes backwards, one index per rejection, until it finds a match. Then the follower deletes everything after the match and takes the leader's entries. In the lesson's example, that took seven probes and the follower threw away five uncommitted entries.

Backing off one entry per round trip is slow for a follower offline for thousands of entries, so implementations reject with a hint: the conflicting term and where it starts. The leader then skips whole terms. Four round trips instead of seven, one per divergent term rather than one per entry.

## Commit only your own term

Now the rule. A leader may count replicas to commit an entry only if the entry is from its current term.

Why? Here is the shape of the Raft paper's Figure 8. A leader in term 2 replicates an entry at index 2 to one follower, then crashes. Another server wins term 3 and writes its own index 2, then crashes. The first server comes back and wins term 4, and copies its old term 2 entry to a third server. Index 2, term 2, is now on a majority. Is it committed?

[pause]

No. If the term 4 leader declared it committed and crashed, the term 3 server could still win the next election, because its last entry, term 3, beats term 2 on every other server. It would overwrite index 2 everywhere. A "committed" entry, lost.

So old entries commit only indirectly: the leader commits an entry from its own term on top of them, and log matching carries the prefix along. That is why every Raft leader appends a no-op the moment it is elected: to commit everything before it promptly, and to learn its own commit index before serving reads.

## Membership, reads, and real systems

Changing the cluster all at once is unsafe. Growing from 3 to 5 at once, two servers can be a majority of the old three while three others are a majority of the new five, and two leaders can be elected in one term. Either use joint consensus, which needs majorities of both configurations during the switch, or change one server at a time. etcd does one change at a time and lets a new member join as a learner that receives the log without voting until it has caught up.

Reads have a trap. A leader cannot answer linearizable reads from its own state, because a partitioned leader may not know it has been deposed. ReadIndex fixes it: record the commit index, confirm leadership with one heartbeat round to a majority, wait to apply, then answer. One round trip, no disk write. Lease reads skip even that round trip, but they trust bounded clock drift.

Throughput is bounded by the disk. An SSD flush costs about a millisecond, so one append per flush caps a leader near a thousand appends a second; batching 20 writes per append gives about 20 thousand. etcd asks for a log flush time under 10 milliseconds at the 99th percentile, because heartbeats share that path. A slow disk delays heartbeats, followers time out, and the cluster holds elections instead of serving.

For more throughput, do not add members, which only gives one leader more copying. Run many Raft groups, one per shard, with leaders spread across nodes. That is what CockroachDB ranges and TiKV regions are.

And under a partition, with the old leader in a minority of two: it keeps appending entries it can never commit, while the majority of three elects a new leader and carries on. When it heals, the old leader steps down and its uncommitted entries are discarded. No committed entry was lost; only writes no client was told had succeeded. CheckQuorum makes the isolated leader step down early so its clients fail fast.

## In the interview

A follow-up the lesson expects. Elections keep happening in your etcd cluster. What do you check?

[pause]

Disk flush latency first, because disk stalls delay heartbeats. Then network round trip against the election timeout. Then CPU starvation or garbage collection on the leader. Fix the disk before touching timeouts. The wrong answer is "raise the election timeout", which lengthens every real failover and hides the disk problem.

And: why does Raft need a leader when quorum replication has none? Because a quorum gives overlap, not order. The leader assigns each entry one index in one log, and log matching makes every follower's log a prefix of the leader's. "The leader is for performance" misses that it is the serialisation point that creates the order.

## Recap

Four things to remember. Majorities overlap, so 2f plus 1 servers survive f failures, and even sizes buy nothing. Randomised election timeouts, wide relative to the message delay and at least ten times the round trip, make split votes rare and short. The commit index is the median of the match indexes, but a leader commits only entries from its own term, which is why it appends a no-op on election. And Raft is bounded by disk flushes and a single leader: use ReadIndex for linearizable reads, and scale with more groups, not more members.

At your desk: the split-vote trace and election simulation, the commit index table, the follower repair probes, Figure 8 step by step, and the partition trace.

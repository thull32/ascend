---
lesson: gossip-and-anti-entropy
source: 2051e408249aa064
fit: great
desk:
  - "The convergence simulation code and its table of rounds by mode, fanout and cluster size"
  - "The five-node SWIM trace with both branches, and the update-ordering rules"
  - "memberlist's default settings and Lifeguard's suspicion formula"
  - "Cassandra's gossip digest exchange, the Merkle walk hash by hash, and the overstreaming table"
  - "Exercise: find the differing leaves with a Merkle walk"
---
## Introduction

A thousand nodes need to know which of them are alive, who owns which token range, and what the schema version is. A central registry that every node polls becomes the busiest and most fragile box in the system: a thousand polls a second on one machine, and when it is down nobody learns anything. Having every node tell every other node directly is N squared messages, a million per round.

Gossip takes a third path. Each node periodically exchanges what it knows with a few random peers, and they do the same. Information spreads like an epidemic, reaching everyone in a logarithmic number of rounds, with constant load per node and no coordinator. And it survives any node or link failing, because the next round picks different peers.

Four ideas. How fast gossip converges, with real constants. SWIM, which turns gossip into failure detection. Merkle trees, which make repairing large replicas cheap. And the deadline on repair that, if missed, brings deleted data back to life.

## Push, pull and push-pull

Every round, each node picks a few random peers, the fanout, and exchanges state.

With push, a node sends what it knows. The informed count roughly doubles each round at first, but the finish is slow. Near the end almost every push lands on someone who already knows, and the last stragglers wait on luck. With pull, a node asks its peers. It finishes fast: an uninformed node stays uninformed only if the peer it asked is also uninformed, so the uninformed fraction squares each round. Ten percent, then 1 percent, then a hundredth of a percent. Push-pull does both in one exchange, and it is the standard choice.

What gets spread divides protocols in two. Rumour mongering spreads a specific new update and retires it after a bounded number of sends. Cheap, but a rare node can miss it. Anti-entropy periodically exchanges full state, or a digest of it, so any difference, however old, eventually gets repaired. It never stops, and it is the safety net under rumour mongering.

Bandwidth decides what you can afford. At 5 thousand nodes carrying 100 kilobytes of state each, sending full state is 600 kilobytes a second per node and 3 gigabytes a second across the cluster. So real implementations gossip digests, a node id and a version per entry, and fetch only entries that are newer. Steady-state traffic then follows the change rate, not the state size.

## Convergence with real constants

The textbook says "order log N rounds". The lesson measured the constants. Push at fanout 1 needs about log base two of N, plus the natural log of N, rounds: log two N rounds of doubling, then about ln N rounds collecting stragglers. At 10 thousand nodes, that is about 24 rounds. Quote just "log N" and you underestimate it by 40 percent.

Push-pull at fanout 3 is the number to remember: about 5 rounds for a thousand nodes, and under 7 for ten thousand. Each tenfold growth adds only 1.5 to 2.5 rounds. The tails are tight at scale too, within a few rounds of the mean. And fanout has diminishing returns: going from 2 to 3 saves about one round at 10 thousand nodes for 50 percent more messages.

Translated: Cassandra's gossiper is push-pull with about one peer a second, so a change reaches a thousand nodes in roughly 9 to 10 seconds. memberlist pushes updates to 3 members every 200 milliseconds, so it reaches a thousand nodes in under 2 seconds. Treat these as the shape, not a latency guarantee; the model ignores loss and failures.

## SWIM

Heartbeating everyone to everyone is N squared traffic. SWIM makes failure detection constant per node. Each protocol period, every member pings one other member. If no ack arrives within the timeout, it asks a few others, typically three, to ping the target on its behalf. If none of them succeeds, the target is marked suspect, not dead. And updates ride piggybacked on the pings and acks themselves.

Why ask three others before suspecting?

[pause]

So a bad link is not mistaken for a death. If any indirect prober gets an ack, the target is alive and the problem was the path from the original prober.

The second false positive is a pause. Every member carries an incarnation number that only the member itself increments, and only to refute a suspicion. Picture five nodes. E stops answering at time zero. A pings E, gets nothing, asks B, C and D to try, and they get nothing either. At one second, A marks E suspect at incarnation 0 and starts a 4 second timer, and the suspicion spreads. Now two branches. If E was in a two and a half second garbage collection pause, it wakes, hears it is suspected, bumps its own incarnation to 1, and gossips "alive at 1". Alive at a higher incarnation overrides suspect at a lower one, and within a round everyone has it. If E really crashed, A's timer fires at 5 seconds and A declares it dead.

So the indirect probe removes the bad-link false positive, and suspicion plus incarnation removes the short-pause one. Load stays constant: one ping per period per member. And detection is fast without anyone watching E specifically. In a large cluster, the expected wait before somebody probes E is about 1.6 periods.

Lifeguard, from HashiCorp, attacked the remaining false positives, which came mostly from slow probers rather than slow targets. A prober that hears neither acks nor nacks from its helpers concludes the problem is local, maybe CPU starvation, and slows itself down. A sick node stops accusing healthy ones. And the suspicion timeout starts long and shrinks as other members independently confirm. In memberlist at a thousand nodes, the minimum suspicion timeout is 12 seconds, up to 72 until others confirm.

Consul shows the right division of labour. Gossip only detects. The Raft-replicated catalog on the servers decides, so service discovery changes once, through consensus.

## Merkle trees

Gossip spreads small state. Replicas of a large dataset drift apart for other reasons: a write missed one replica, a node was down for an hour, a hint was lost. Comparing them row by row costs the whole dataset each time.

A Merkle tree hashes each slice of the token range into a leaf, and each parent hashes its two children. Equal hashes vouch for everything beneath them. Two replicas compare roots; if they differ, they compare the two children, descend only into the side that differs, and so on down. With 2 to the 15 leaves, about 32 thousand, and one differing leaf, how many comparisons?

[pause]

31. One for the root, then two per level for 15 levels, instead of 32,768. Equal subtrees are never entered.

The expensive part is building the tree, because every row in the range is read and hashed. At 200 megabytes a second, 2 terabytes per replica takes nearly 3 hours of disk and CPU. That is why repair is scheduled, throttled and run per range.

The other cost is overstreaming. A differing leaf streams every partition it covers, even if only one differs. With about 30 partitions per leaf and differences scattered at random, 10 thousand differing partitions, about 1 gigabyte of real difference, streamed 27 gigabytes. The fix is not throttling, which just makes the same 27 gigabytes take longer. It is smaller subranges or incremental repair, which make every leaf finer.

## Repair and resurrected deletes

Cassandra has three mechanisms. Read repair fixes mismatches a read happens to see, so it covers only keys that are read; cold keys, never. Hinted handoff stores writes for a replica that is down and replays them on its return, but only for outages under 3 hours, and only if the coordinator holding the hints survives. Scheduled Merkle repair covers every key, and it has a deadline.

The deadline comes from tombstones. A delete writes a tombstone, and the tombstone is purged after a grace period, 10 days by default. Trace it. Replica C goes down on day zero. On day one, the row is deleted, and A and B write tombstones. On day eleven, compaction purges them. On day twelve, C returns, still holding the row. On day thirteen, repair runs. C has a value; A and B have nothing. So repair streams the row back to them.

The deleted row is back. Hence the two rules: repair every range at least once per grace period, and rebuild a node that was down longer than that, wiping it and streaming its ranges, instead of rejoining it. "Run repair after it rejoins" is precisely what resurrects the deletes.

## When not to gossip

Gossip is the wrong tool when the answer must be agreed: leader election, ownership reassignment, anything that must happen exactly once needs consensus, with gossip as an input. A partition gives gossip two views, each side reporting the other dead, so letting gossip decide ownership directly means two sides that each own everything. It is overkill below about ten nodes. It cannot carry megabytes per node per second. And "converges in about 10 rounds with high probability" is not a hard deadline. Redis Cluster shows the pattern: one node's suspicion is a rumour, promoted to failure only when a majority of masters report it.

## In the interview

"Why does Cassandra need repair if it has read repair and hinted handoff?"

[pause]

Read repair covers only keys that are read, and hints only outages under three hours whose coordinator survived. Only Merkle repair covers every key, and it must run within the grace period or deletes come back. The wrong answer is "read repair fixes everything eventually", which never touches cold data.

And: how does a thousand-node cluster learn a node has died, without a coordinator? SWIM: each member probes one member per second, indirect probes through three others rule out a bad link, then suspicion, with a minimum timeout of 12 seconds at that size, and the death spreads in a handful of gossip rounds. Tens of seconds end to end, at constant cost per node. Not every node heartbeating every other.

## Recap

Four things to remember. Gossip converges logarithmically with real constants: push is log two N plus ln N rounds, and push-pull at fanout 3 covers a thousand nodes in about 5; gossip digests, not full state. SWIM's indirect probes remove the bad-link false positive, and suspicion with incarnation numbers removes the short-pause one. Merkle trees find one bad leaf in 31 comparisons, but coarse leaves overstream, so repair in small subranges. And repair every range within the tombstone grace period, and rebuild rather than rejoin a node down longer, or deletes come back. Gossip detects; consensus decides.

At your desk: the convergence simulation and its table, the SWIM trace, memberlist's settings, the Merkle walk and overstreaming table, and the Merkle exercise.

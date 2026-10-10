---
lesson: partitioning-and-rebalancing
source: f53e787496ccb881
fit: great
desk:
  - "The virtual-node imbalance table, by tokens per node"
  - "The four-to-five-node rebalance table: data sent and received per node under each scheme"
  - "The Redis Cluster slot migration trace, ASK versus MOVED, and the live-move sequence"
  - "The 72-to-96-node growth plan arithmetic, and the hot-key skew table"
---
## Introduction

A key-value store holds 10 terabytes across 20 nodes, each key placed by its hash modulo 20. Traffic grows, and you add a twenty-first node. Now the hash modulo 21 sends almost every key somewhere else. A key stays put only when both remainders agree, about one time in 21, so 95 percent of the data moves.

The cluster spends hours copying 9 and a half terabytes while serving reads that mostly miss. The caches in front of it used the same scheme, so they go cold everywhere at once. Adding one machine to twenty has caused an outage.

The rule that decides where a key lives decides three things: how evenly load spreads, which queries stay cheap, and what happens when the set of machines changes. That last one is where designs fail, because it happens during growth or failure, exactly when you can least afford it.

## Two families, and the key

Hash partitioning maps a hash of the key to a partition. Keys spread evenly whatever their values, but related keys scatter, so a range query touches every partition. Range partitioning gives each partition a contiguous slice of the sorted keys. Range queries hit one or a few partitions, but sequential keys, like timestamps, all pile onto one. Cassandra, DynamoDB and Redis Cluster hash; Bigtable, HBase, Spanner and CockroachDB use ranges.

The scheme matters less than the key you feed it. A good partition key has high cardinality, even access, and locality for the queries that matter. For chat messages, partition by conversation id, so loading a conversation is one partition read. Partition by message id instead and writes spread perfectly, but every conversation load becomes a scatter-gather across the cluster.

The method: write down your top three queries and their rates before choosing. The key that serves the highest-rate query from one partition usually wins, and the rest get indexes.

## Consistent hashing and virtual nodes

Picture the hash space as a ring. Nodes sit at points on it, and a key belongs to the first node clockwise from its position. A new node claims only the arc between itself and its predecessor, so only those keys move.

With one random position per node, though, the arcs are uneven. The lesson simulated 20 nodes. With one token each, the largest node held on average 3.6 times the mean share. And when a node left, its whole arc landed on one successor, whose load grew by over 600 percent.

So give each node many positions, called virtual nodes or tokens. With 16 tokens, the largest node held about one and a half times the mean, and a departure raised the worst survivor's load by about 30 percent. With 256 tokens, about 1.12 times, and 10 percent. Imbalance falls roughly with the square root of the token count, and a failure's load spreads over many successors instead of doubling one.

Cassandra used 256 random tokens per node until version 4.0, which moved to 16 with an allocator that places new tokens into the largest arcs, getting close to the 256-token balance with far fewer ranges to repair.

## Fixed partitions and range splits

The practical alternative is a fixed number of partitions, far more than nodes. The hash picks a partition, and a table assigns partitions to nodes. Kafka, Elasticsearch and Redis Cluster, with its 16,384 slots, all work this way. Growth moves whole partitions and rewrites table entries. No key ever changes partition.

The catch is choosing the count once. Too few and you cannot grow or balance finely; too many and the per-partition overhead adds up. Changing it later moves every key, which in Kafka breaks per-key ordering. Pick it for the throughput you expect in a couple of years.

Now compare the schemes on one rebalance. Four nodes hold 500 gigabytes, and a fifth joins. The ideal is a fifth of the data, 100 gigabytes, all flowing to the new node. Before I give you the numbers: how much does modulo N move?

[pause]

400 gigabytes, four times the ideal, and every node both sends and receives, so every disk and link in the cluster is busy. Consistent hashing with one token moved 292 gigabytes in that run, all from a single neighbour. With 256 tokens, 103 gigabytes, drawn evenly from all four. Twenty fixed partitions, one from each node: 101. Many tokens or fixed partitions approach the ideal and spread the sending, so no one source saturates.

Range-partitioned stores split instead. A range that grows past a threshold splits at a middle key, and one half moves. CockroachDB splits at 512 mebibytes, HBase around 10 gigabytes. But monotonic keys defeat splitting. A sensor fleet writing 100 thousand rows a second keyed by timestamp sends every row to the last range, and a split just creates a new last range. The fix breaks the sort order: salt the key with a small hash prefix, spreading writes over 16 ranges at the cost of 16 merged scans per query, or lead the key with the sensor id.

## Moving data without downtime

To move a partition live: copy a snapshot in bulk, throttled. Stream the writes that arrived since, from the source's log. When the destination is within about a second, pause writes to that partition briefly, drain the tail, flip the routing entry to a new map version, and resume. Clients see a latency blip on one partition, never an outage.

Redis Cluster shows the dual-serve window in its redirects. While a slot is moving from A to B, a client that asks A for a key that has already moved gets an ASK reply. It makes one request to B and does not update its map. Once ownership of the slot is reassigned, A replies MOVED instead, and the client updates its map for good. ASK is a one-request detour; MOVED is the permanent change.

Every system exposes a throttle, and automatic rebalancing has a trap: a node that is only restarting triggers a full re-replication, or a flapping node causes moves in both directions. The senior middle ground is automatic detection with a delay and a cap. Wait out short absences, move only a few partitions at once, and page a human when a plan would move a large fraction of the cluster.

A worked plan. 10 terabytes, three replicas, 500 gigabytes usable per node: 60 nodes minimum, run 72 for headroom. Choose 1,024 fixed partitions, about 10 gigabytes each. Growing to 96 nodes means 768 replica moves, about 7.7 terabytes. At a cluster-wide throttle of 2 gigabytes a second, chosen to keep serving latency flat, that is about an hour. Run it off-peak, 24 moves at a time, with a kill switch that pauses the plan when serving latency rises.

Routing has one rule that matters: a stale map must fail safe. A node asked about a partition it no longer owns redirects, fenced by the map version, rather than serving or accepting the write.

## Hot keys and secondary indexes

Even hashing spreads keys, not load. The lesson simulated a million keys with skewed popularity on 32 nodes. At high skew, the hottest single key carried 19 percent of all traffic, and the hottest node ran more than six times an even node's load. Once one key carries more than a node's fair share, here about 3 percent, no hash function helps. That key lives in one partition. DynamoDB documents each partition at 3,000 read units and 1,000 write units a second, and a single item cannot be split, so that is the item's ceiling.

The fixes depend on the key. Hot reads: a small in-process cache near the callers with a one-second TTL absorbs almost all of them. Hot writes: split the key into, say, 16 suffixed copies on different partitions and sum them on read, only for keys detected as hot, since it multiplies read cost by 16. Add per-key rate limits, and alert on skew.

Secondary indexes have the same tension. A local index lives with each partition, so writes stay local, but a query by the indexed attribute scatters to every partition and waits for the slowest. If each partition is slow 1 percent of the time, a query across 100 partitions is slow about 63 percent of the time: the partitions' 99th percentile becomes the query's median. A global index is partitioned by the indexed attribute, so a query hits one index partition, but each write updates an index entry on another node, either asynchronously or transactionally.

## In the interview

A follow-up the lesson expects. Time-series writes keyed by timestamp all land on one node. Fix it.

[pause]

The sort order sends every new key to the last range. Salt with a small hash prefix and merge 16 scans per query, or key by sensor id then timestamp. The wrong answer is "split the hot range", which only creates a new last range.

And: one key gets 30 percent of reads. What breaks? Its partition and node saturate whatever the hash. Cache it close to the callers with a short TTL, and for hot writes split the key and aggregate on read. "Add more partitions" does nothing for the one node that was the problem.

## Recap

Four things to remember. Modulo N moves almost everything on a resize, 95 percent going from 20 nodes to 21; consistent hashing with many tokens, or fixed partitions, moves about one twenty-first, drawn evenly from every node. Virtual nodes are variance reduction: one token leaves the biggest node at three and a half times the mean, 256 bring it near even. Monotonic keys defeat range splits, so salt or lead with a natural dimension at design time. And hot keys are a separate problem from partitioning: cache hot reads, split hot writes, and alert on skew.

At your desk: the virtual-node table, the per-node rebalance table, the Redis slot migration trace, the growth plan arithmetic, and the hot-key table.

---
lesson: database-scaling
source: da24ae7259a69f47
---
## 1

An orders table is hash-sharded across 32 nodes by user ID. A query by merchant is served by scatter-gather, and each shard has a 1 percent chance of a 200 millisecond stall per query. Roughly what fraction of merchant queries take 200 milliseconds or more?

A, about 50 percent. B, about 27 percent. C, about 3 percent. D, about 1 percent.

[think]

The answer is B: about 27 percent.

The query waits for the slowest shard, so it stalls if any of the 32 does: one minus 0.99 to the 32nd, about 0.27. Tail amplification is the core cost of scatter-gather, and a reason to build a merchant-keyed copy for hot cross-shard patterns.

## 2

Orders are sharded by merchant over 32 shards. The largest merchant is 5 percent of orders, and a flash sale multiplies its orders tenfold. What happens to the busiest shard?

A, it takes about twice the average, as with any hash imbalance. B, it takes about 5 percent more load, since the merchant is 5 percent of orders. C, it takes about a third of all orders, 11 times the average shard. D, it stays near average, because hashing spreads each merchant.

[think]

The answer is C: it takes about a third of all orders, 11 times the average shard.

One merchant's orders all hash to one shard, so its tenfold surge lands there: in the computed example, the busiest shard took 1,057 of 2,906 orders a second, 11.6 times the average. Hashing spreads merchants, not one merchant's orders. Salting that merchant over 16 shards cut it to 2.65 times, at the price of a 16-way read for its dashboard.

## 3

A user updates their name, and the reload, served by a replica, shows the old one. Which fix keeps most reads on replicas and guarantees the user sees their write?

A, route every read to the primary, so that no read is ever stale. B, send the user's reads to a replica that is past their write's position. C, add more replicas, so each one has less lag to work through. D, add a cache in front of the replicas, with a short TTL on each key.

[think]

The answer is B: send the user's reads to a replica that is past their write's position.

Return the commit's log position, and serve that user's reads only from a replica whose replayed position has reached it, forwarding otherwise. Only the reads that need freshness wait. Routing everything to the primary forfeits read scaling, more replicas do not reduce lag, and a cache adds another stale copy.

## 4

With asynchronous replication, the primary acknowledges an order, then its host dies before the replica receives the WAL, and the replica is promoted. What happens?

A, the replica fetches the missing WAL from the dead primary's disk. B, the promotion waits until every acknowledged commit is present. C, the order is replayed from the client's retry automatically. D, the order is lost, although the client was told it committed.

[think]

The answer is D: the order is lost, although the client was told it committed.

Asynchronous commit acknowledges after the local flush only, so the promoted replica never saw the order. Synchronous commit with a synchronous standby makes the commit wait for the standby's flush, at the cost of about a cross-zone round trip per commit. Nothing recovers the WAL from a dead host automatically.

## 5

DynamoDB's global secondary indexes are updated asynchronously. What does that imply for a design that writes an item and immediately queries the index?

A, it may briefly miss the item, so read the base table by key. B, the write is rejected until the index update has finished. C, the index is locked against queries until it has caught up. D, the query always sees it, because the write blocks on the index.

[think]

The answer is A: it may briefly miss the item, so read the base table by key.

An index partitioned differently from the table is updated either in a distributed transaction or asynchronously. DynamoDB chose asynchronous, so the query may not see the item for a moment. Reading the base table by key is the consistent path, and nothing blocks or rejects the write.

## 6

You are choosing a sharding scheme for a system that starts on 4 nodes and might grow to 64. Which choice makes future growth cheapest?

A, the key's hash modulo N, re-hashing all keys whenever N changes. B, fixed logical partitions, say 1,024, mapped onto physical nodes. C, one shard per customer, created on demand as customers sign up. D, range sharding on a sequential primary key across the nodes.

[think]

The answer is B: fixed logical partitions, say 1,024, mapped onto physical nodes.

With fixed logical partitions, a key's partition never changes; growth reassigns whole partitions to nodes, and copies them. Modulo hashing remaps almost every key on each resize, sequential range keys concentrate writes on the newest range, and one shard per customer does not distribute the long tail.

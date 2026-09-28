---
slug: database-scaling
title: "Database scaling: replicas, pooling, shard keys, hot keys and cross-shard indexes"
description: The ordered steps before sharding with measured Postgres numbers, connection pooling sized by Little's law, replication lag traced through read-your-writes and an asynchronous failover, synchronous_commit levels, shard-key choice with arithmetic, cross-shard indexes, resharding, and a worked capacity plan ending in a node count.
minutes: 30
difficulty: hard
tags: [system-design, sharding, replication, shard-key, secondary-indexes, resharding, connection-pooling]
---
The stateless tier scaled to forty replicas in an afternoon. The database did not: one primary at 80% CPU, a read replica four seconds behind at peak, 800 connections requested against a limit of 500, and a product request for "all orders for this merchant" that touches every row. Every large system reaches this point, and the interesting decisions live here, because the database is where the state is and state cannot be scaled by copying a process.

This lesson is the sequence of moves that scales a database, in order, with the measurement that justifies each and the specific way each fails. It ends at sharding, the last resort and the one that changes every query you will ever write, and then works a capacity plan to a node count.

## The order of operations

| Step | Typical gain | Cost | Do it when |
|---|---|---|---|
| 1. Fix queries and indexes | 10–1,000× on specific queries | Engineering time | Always first: `EXPLAIN` the slow log |
| 2. Pool connections | Removes per-connection overhead, caps concurrency | A pooler to run | Connections pass a few hundred |
| 3. Cache reads | 5–100× fewer reads | Staleness | Read-heavy, hit ratio above 90% plausible |
| 4. Scale vertically | 2–8× | Money, one larger failure domain | CPU or memory bound and a bigger box exists |
| 5. Read replicas | Linear read scaling | Lag, read-your-writes | Reads dominate and tolerate lag |
| 6. Partition tables on one node | Faster scans and drops for time-series | Schema complexity | Tables past ~100 GB with time-based access |
| 7. Shard | Unbounded writes and storage | Every cross-shard query, transaction and index | Writes or data exceed one node |

Put numbers on "one node". On a 32-thread workstation, Postgres 17 served 53,000 primary-key lookups a second with 32 connections and committed 16,000 single-row transactions a second with 64 connections sharing each fsync ([Back-of-envelope estimation](/learn/system-design/building-blocks/back-of-envelope-estimation) explains group commit). With a cache in front, one well-provisioned primary covers tens of millions of daily users. What pushes past it is usually write rate or a dataset whose restore time is unacceptable, not read rate, which replicas solve. [Indexes](/learn/databases/relational-fundamentals/indexes) covers step 1.

## Connection pooling, measured

Postgres forks a process per connection, each costing memory for its caches and work areas, and it scales with cores, not connections. Measured with `pgbench -S` (primary-key reads):

| Connections | Throughput | Average latency |
|---|---|---|
| 1 | 7,700/s | 0.13 ms |
| 8 | 43,700/s | 0.18 ms |
| 32 | 53,100/s | 0.60 ms |
| 64 | 65,800/s | 0.97 ms |
| 90 | 69,300/s | 1.30 ms |

From 32 to 90 connections throughput rose 30% while latency doubled: past about one active connection per core, extra connections add queueing, not work. Size pools from Little's law, not from defaults. A fleet at 2,000 transactions a second averaging 5 ms holds $2{,}000 \times 0.005 = 10$ transactions in flight; HikariCP's sizing guidance, a pool of about twice the core count, gives the same order. Forty replicas with HikariCP's default of 10 connections each bring 400.

A pooler multiplexes many client connections onto few server connections. PgBouncer's modes decide how:

| Mode | Server connection held for | Client connections per server connection | What breaks |
|---|---|---|---|
| Session | The client's whole session | 1 | Nothing, and little is saved |
| Transaction | One transaction | Tens to hundreds | Session state: `SET`, advisory locks, `LISTEN`, temporary tables; protocol-level prepared statements before PgBouncer 1.21 |
| Statement | One statement | Most | Multi-statement transactions |

Transaction mode is the usual choice: 600 client connections from 60 pods become a server pool of 20–50 per database. Set a pool-acquire timeout so a slow database fails requests quickly rather than stacking threads. [Connection management](/learn/databases/storage-and-scale/connection-management) goes deeper.

## Read replicas and what lag does to users

A replica receives the primary's write-ahead log over a streaming connection (a `walsender` on the primary, a `walreceiver` and a replay process on the standby) and replays it. Every single-row insert in the measurements above generated roughly 300–400 bytes of WAL including index and commit records, so 2,000 such writes a second ship under 1 MB/s to each replica: bandwidth is rarely the problem, replay is. `pg_stat_replication` reports `write_lag`, `flush_lag` and `replay_lag` separately. Same-region lag is milliseconds when healthy and seconds to minutes under a bulk load, a long transaction or a replica query holding back replay.

```viz
{"type": "system", "scenario": "replication-leader-follower", "replicas": 2, "title": "Leader-follower replication and the lag window", "caption": "Writes go to the leader, which streams its log to followers. A read routed to a follower before the log applies returns the old value; the lag is the window in which the two answers differ."}
```

### Read-your-writes, traced

A user renames themselves from "Adelaide" to "Ada", and the page reloads from a replica 40 ms behind:

| t (ms) | Event | Primary LSN | Replica replayed LSN | Page shows |
|---|---|---|---|---|
| 0 | `UPDATE users SET name = 'Ada'`; `COMMIT` | 0/3A000120 | 0/3A000000 | – |
| 1 | The API returns the commit's LSN as a token | 0/3A000120 | 0/3A000000 | – |
| 2 | Reload without a token: served by the replica | | 0/3A000000 | "Adelaide": the edit vanished |
| 2 | Reload with the token: replica is behind it, so wait up to 20 ms, then forward to the primary | | 0/3A000000 | "Ada" |
| 40 | Replica replays the record | | 0/3A000120 | "Ada" on either path |

The mechanics are two functions and a comparison:

```sql
-- on the primary, after the write commits: return this to the client as a token
SELECT pg_current_wal_lsn();                                   -- e.g. 0/3A000120
-- on the replica, before serving that client's read
SELECT pg_last_wal_replay_lsn() >= '0/3A000120'::pg_lsn AS caught_up;
```

Cheaper and blunter alternatives: send a user's reads to the primary for a few seconds after they write (moves the most active users' reads back onto the primary), or return the new state from the write so the client never re-reads. [Consistency models](/learn/system-design/building-blocks/consistency-models) names the guarantee and its siblings.

### Failover and the lost write

Asynchronous replication acknowledges before the replica has the WAL, so a failover can lose acknowledged commits:

| t | Event | Primary flushed | Replica received |
|---|---|---|---|
| 0 | Order 9001 commits and the client is told "confirmed" | 0/5000 | 0/4F00 |
| 0.1 s | The primary's host fails | – | 0/4F00 |
| 30 s | Patroni promotes the replica | – | 0/4F00 |
| After | Order 9001 does not exist; the customer has an email saying it does | | |

`synchronous_commit` chooses what a commit waits for, per transaction if you like:

| Setting | Commit waits for | Survives a primary crash | Survives failover to a replica | Replica read sees it at once |
|---|---|---|---|---|
| `off` | Nothing; WAL flushed within 3 × `wal_writer_delay` (600 ms by default) | May lose the last ~0.6 s | No | No |
| `local` | Local flush | Yes | No | No |
| `remote_write` | Standby has written it to its OS | Yes | Unless the standby's OS crashes too | No |
| `on` with a synchronous standby | Standby has flushed it | Yes | Yes | No |
| `remote_apply` | Standby has replayed it | Yes | Yes | Yes |

Each step up adds a cross-AZ round trip (about 1 ms) to every commit. Orders deserve `on` with `synchronous_standby_names = 'ANY 1 (...)'`; view counters can take `off`. Split brain, where a partitioned old primary keeps accepting writes, is prevented by fencing it before promotion ([Failure detection and leases](/learn/system-design/distributed-systems/failure-detection-and-leases)).

## Partitioning on one node first

Before rows move to other machines, split big tables on the same machine. Postgres declarative partitioning (`PARTITION BY RANGE (created_at)`, one partition per month) gives each partition its own heap and indexes: queries with a time predicate scan only matching partitions, vacuum and index builds work on one month at a time, and retention becomes `DROP TABLE orders_2025_01`, a metadata operation, instead of a `DELETE` that rewrites and bloats a multi-terabyte table. It does not add write capacity or storage beyond one node; it buys operability, and it gives sharding a natural unit later.

## Sharding

Sharding partitions rows across nodes by a shard key; each shard is itself a replicated primary, so four shards are at least eight nodes.

| Strategy | Mapping | Range query on the key | Adding a shard | Fails when |
|---|---|---|---|---|
| Range | Key ranges per shard | One or few shards | Split a range | Keys increase (time, sequences): every insert hits the last range |
| Hash mod N | `hash(key) mod N` | Every shard | Remaps almost every key | N must change |
| Consistent hash or fixed logical partitions | Ring, or 1,024 partitions mapped to nodes | Every shard | Moves ~1/N of keys, or whole partitions | Hot keys still concentrate |
| Directory | A lookup table per key or tenant | Depends | Update the table, copy data | The directory is on every request's path |

```viz
{"type": "system", "scenario": "sharding-range", "title": "Range sharding and the hot tail", "caption": "Keys are assigned by range. Range scans stay on one shard, but monotonically increasing keys pile every insert onto the last range while the others sit idle."}
```

```viz
{"type": "system", "scenario": "sharding-hash", "title": "Hash sharding spreads writes uniformly", "caption": "The hash scrambles adjacent keys onto different shards, so an increasing key no longer creates a hot tail. A query for a range of keys must now ask every shard."}
```

### Choosing the shard key

Three tests: every hot query includes it (otherwise scatter-gather); it distributes writes (high cardinality, no dominant values); it co-locates rows that are joined or transacted together. For orders with 50 million users, 200,000 merchants and 2,000 orders/s at peak:

| Candidate | "My orders" | "Merchant's orders" | Write distribution | Verdict |
|---|---|---|---|---|
| `user_id` | One shard | Every shard | Uniform over 50M values | Good; the merchant view needs a second path |
| `merchant_id` | Every shard | One shard | The top merchant's 5% is 100 writes/s normally, 10× in a flash sale, on one shard | Hot-shard risk |
| `order_id` (random) | Every shard | Every shard | Perfect | Only point lookups are cheap |
| `created_at` | Every shard | Every shard | All writes on the newest shard | Right for archives, wrong for writes |

`user_id` plus an explicit second access path for merchants (below) is the design; no key serves every pattern, and saying so is the senior move.

**Hot keys.** A flash sale, a celebrity or a tenant that is 30% of the business still lands on one shard. Salt only the hot values (`merchant_42#0` … `#15`, spreading writes over 16 shards at the price of a 16-way read), fed by a hot-key detector, or move the tenant to its own shard under a directory scheme. [Wide-column stores](/learn/databases/nosql-and-specialised/wide-column-stores) covers the same problem as partition sizing.

### Hot keys, quantified

"The top merchant is 5% of orders" understates the problem, because shards hold several large tenants at once. Computed for 2,000 orders a second from 200,000 merchants whose order shares follow a Zipf curve fitted so the largest is 5% (the top 10 then hold 16% and the top 100 hold 30%), placed by `hash(merchant_id) mod 32`:

| Scenario | Busiest shard ÷ average | Busiest shard's orders/s |
|---|---|---|
| Normal day, no salting | 2.41 | 150 (average 62) |
| Normal day, top merchant salted 16 ways | 2.31 | 145 |
| Normal day, top 10 merchants salted 16 ways | 1.31 | 82 |
| Flash sale (top merchant ×10), no salting | 11.6 | 1,057 of 2,906: over a third of all orders |
| Flash sale, top merchant salted 16 ways | 2.65 | 241 |

Two readings. On a normal day the hot shard is not one tenant but several large ones that hashed together, so salting only the largest barely helps; salting the top 10 does. In the flash sale one merchant dominates, and 16 salts cut the busiest shard from 11.6× to 2.65× (16 salts over 32 shards still collide). Keyed by `user_id` instead (simulated with 5 million buyers whose activity is heavy-tailed, lognormal with σ = 2), the busiest of 32 shards ran 4% above average, because the largest buyer was 0.06% of orders. Salting has a read-side price: the merchant's dashboard now reads 16 shards. Keep the salted set small, driven by a detector that samples top keys per shard every minute, and record which keys are salted in a table the router reads.

## Secondary indexes across shards

Orders are sharded by `user_id` and the dashboard asks `WHERE merchant_id = ?`.

**Local indexes, scatter-gather.** Each shard indexes its own rows; the query goes to all shards and the router merges. With 32 shards each stalling 1% of the time, a query stalls if any shard does: $1 - 0.99^{32} = 27\%$. Throughput divides by the fan-out: 32 shards each doing 5,000 queries/s serve 5,000 scatter-gather queries/s, not 160,000. Fine for a dashboard at 50 queries a second, fatal on a hot path.

**Global indexes.** The index is itself partitioned by `merchant_id`, so a query reads one index partition and then the rows it points to. A write now touches the row's shard and an index partition elsewhere: either a distributed transaction or an asynchronous update that lags. DynamoDB's global secondary indexes are asynchronous, so "write then immediately query the GSI" may miss the item.

**A derived copy.** A `merchant_orders` table keyed by `(merchant_id, created_at)` in its own store, fed by change data capture: one partition read, sorted, a few milliseconds, lagging by tens to hundreds of milliseconds.

A sharded system serves one access pattern natively; each other one is a scatter-gather, an asynchronous copy or a distributed transaction, chosen per query. Joins across different keys are avoided by denormalising; transactions are kept single-shard by the key choice, with sagas for the rest ([Distributed transactions](/learn/system-design/distributed-systems/distributed-transactions)).

### Uniqueness across shards

Users are sharded by `user_id`, and email must be unique. A unique index on each shard enforces nothing across shards, so uniqueness gets its own table, `user_emails (email PRIMARY KEY, user_id, state, reserved_at)`, sharded by `hash(email)`, where the primary key is the lock. Sign-up, with two people racing for the same address:

| Step | Alice (user 71) | Bob (user 94) | `user_emails` row for `a@x.io` |
|---|---|---|---|
| 1 | `INSERT ... ('a@x.io', 71, 'reserved') ON CONFLICT DO NOTHING`: 1 row | | reserved by 71 |
| 2 | | Same insert for 94: 0 rows, so "address taken" | reserved by 71 |
| 3 | Insert user 71 on shard(71) | | reserved by 71 |
| 4 | `UPDATE ... SET state = 'active'` | | active, 71 |

Order the steps so every crash leaves something a sweeper can finish. A crash after step 1 leaves a reservation with no user: a job deletes reservations older than 15 minutes whose user row does not exist. A crash after step 3 leaves a user whose reservation still says `reserved`: the same job finds the user and marks it active. Changing an address reserves the new one first and releases the old one last, so no crash leaves a user with no address or two users with one. DynamoDB users write the uniqueness item and the user item in one `TransactWriteItems` call instead; the design is the same with the sweeper replaced by a transaction.

## IDs that know their shard

An order ID arrives in a webhook, a support ticket or a URL, with no user ID beside it. If the ID carries its partition, the router needs no directory lookup. Instagram described its scheme in 2012: 41 bits of milliseconds since a custom epoch (69.7 years of range), 13 bits of logical shard (8,192), and 10 bits of per-shard sequence (1,024 IDs per millisecond per shard). Put the owning user's logical partition in every ID that user creates:

```python
EPOCH_MS = 1_704_067_200_000            # custom epoch: 2024-01-01T00:00:00Z

def make_id(now_ms, logical_shard, seq):
    assert 0 <= logical_shard < 8192 and 0 <= seq < 1024
    return ((now_ms - EPOCH_MS) << 23) | (logical_shard << 10) | seq

def logical_shard_of(order_id):
    return (order_id >> 10) & 0x1FFF      # the 13 bits above the sequence

def created_ms(order_id):
    return (order_id >> 23) + EPOCH_MS

user_id = 48_213_907
logical = user_id % 8192                 # every row this user owns lives in this partition
order_id = make_id(1_767_225_600_123, logical, 7)
print(order_id, logical_shard_of(order_id), created_ms(order_id))
# 529811060543081479 3987 1767225600123
```

The ID sorts by creation time, fits a signed 64-bit column, and names logical partition 3987, which a small, cached map turns into a physical shard. Resharding moves logical partitions, so IDs never change. The one-time decision is the bit budget: 13 bits caps you at 8,192 partitions, and 10 bits of sequence caps each partition at about a million IDs a second, which is plenty; running out of the 41-bit time range in 70 years is the next team's problem.

## Resharding

From 8 shards to 16 with the application running:

1. **Choose the scheme for this day.** With `hash mod 8`, going to 16 moves half of every shard's rows by rehashing each key. With 1,024 fixed logical partitions over 8 nodes, it moves 512 whole partitions and no key changes its partition. Vitess, Cassandra and Kafka use variants of the second.
2. **Record the change-stream position, then snapshot.** Recording it after the copy starts loses the updates in between.
3. **Replay the stream until lag is under 100 ms**, then compare checksums per range and shadow-read for a day.
4. **Flip the router per range**, able to flip back in seconds; delete moved rows a week later.

Prefer stream replay to dual writes: a write that succeeds on one side and fails on the other leaves them divergent with no record of it.
How evenly a ring spreads keys depends on the number of virtual nodes per server. Simulated for 10 servers with randomly placed tokens, 500 rings per row:

| Virtual nodes per server | Largest server's share ÷ average, median ring | Same, 95th percentile ring | Smallest ÷ average, median |
|---|---|---|---|
| 1 | 2.84 | 4.67 | 0.07 |
| 16 | 1.41 | 1.66 | 0.65 |
| 64 | 1.19 | 1.33 | 0.82 |
| 256 | 1.10 | 1.16 | 0.91 |

With one token per server, the unluckiest server holds nearly three times its share while another holds almost none. Random tokens need hundreds per server to come within 10%, which is why Cassandra defaulted to 256 `num_tokens` for years; Cassandra 4.0 lowered the default to 16 and pairs it with an allocation algorithm that places tokens to balance load for the keyspace's replication factor rather than at random. More tokens also cost something: repair and streaming work per token range, and more ranges to reason about when a node is added.

```viz
{"type": "system", "scenario": "consistent-hashing", "nodes": 4, "keys": 12, "title": "Adding a shard moves one Nth of the keys", "caption": "Keys and shards share a hash ring. When a fifth shard joins, only the keys between it and its predecessor move; with modulo hashing almost all of them would."}
```

## A worked capacity plan

An order service: 60 million orders a day (700/s average, 2,000/s peak); each order transaction writes five rows (order, three items, an inventory decrement); 40,000 reads/s at peak with an 80% cache hit ratio; 90 days online, older orders in the warehouse.

| Question | Arithmetic | Answer |
|---|---|---|
| Does the write rate need sharding? | 2,000 transactions/s against a measured 16,000 single-row commits/s on one node; ~1.5 KB of WAL per order is 3 MB/s | No: one primary takes the writes |
| Storage | 5 rows × ~200 B + 60% for indexes ≈ 1.6 KB × 60M/day × 90 days | 8.6 TB online |
| Does storage need sharding? | Restoring 8.6 TB at ~500 MB/s takes about 5 hours; vacuum and index builds on multi-TB tables take hours | Yes, for operability: target ≈1 TB per shard, so 8 shards |
| Database reads | 40,000 × 20% misses ÷ 8 shards | 1,000/s per shard: trivial |
| Concurrent transactions | $2{,}000 \times 5\,ms + 8{,}000 \times 1\,ms$ | ~18 in flight fleet-wide, ~3 per shard: server pools of 10 per shard behind PgBouncer |
| Durability | Orders must survive failover | `synchronous_commit = on` to one standby in another AZ: +~1 ms per commit |
| Growth | 256 logical partitions, 32 per shard | Doubling moves whole partitions |

**Bill of materials:** 8 shards × (primary, synchronous standby, asynchronous replica for reads and backups) = 24 Postgres nodes with ~2 TB of disk each; PgBouncer on each app node or a small pool tier; a CDC pipeline feeding `merchant_orders` and the warehouse.

## Under the hood: how real systems shard and replicate

- **Postgres** streams WAL physically, byte for byte, so replicas are whole-cluster copies. Queries on a standby can conflict with replay (a vacuum on the primary removes rows a standby query still needs); the standby delays replay up to `max_standby_streaming_delay` (30 s by default) and then cancels the query. `hot_standby_feedback = on` avoids the cancellation by telling the primary not to vacuum those rows, trading it for bloat on the primary.
- **DynamoDB** hashes the partition key onto partitions, each serving up to 3,000 read units and 1,000 write units a second and about 10 GB. Partitions split automatically on size and heat, and adaptive capacity shifts throughput to hot partitions, but a single partition-key value can still be throttled. Global secondary indexes update asynchronously; under provisioned capacity a GSI short of write capacity throttles writes to the base table.
- **Vitess** shards MySQL behind a proxy (`vtgate`) that maps a column to a keyspace ID through a *vindex*; shards own keyspace-ID ranges, and resharding is a VReplication workflow (copy, stream, verify, switch traffic) exactly like the steps above.
- **Citus** distributes Postgres tables by a column and co-locates tables sharing it, so joins on that column stay shard-local.

## Failure modes

| Failure | Symptom | Diagnosis | Fix |
|---|---|---|---|
| Hot shard | One shard at 100% CPU, the rest idle; every scatter-gather slows | Per-shard QPS; a sampled top-keys report shows one tenant or key | Salt hot values, isolate the tenant, revisit the key |
| Lag surfacing stale data | Edits vanish and reappear after a bulk job starts | `replay_lag` climbs past a second | LSN tokens, primary pinning for writers, throttle bulk jobs on lag |
| Lost writes on failover | Confirmed orders missing after promotion | Asynchronous replication; replica behind at failover | Synchronous standby for critical data; reconcile with upstream systems |
| Connection exhaustion | "too many clients" errors while CPU is idle | Pools × replicas exceed `max_connections` | PgBouncer in transaction mode; pools sized by $\lambda W$ |
| Standby query cancellations | Analytics on the replica fail with "canceling statement due to conflict with recovery" | Replay conflicts past `max_standby_streaming_delay` | A dedicated delayed replica, `hot_standby_feedback` with bloat monitoring |
| Unbounded scatter-gather | Shard QPS far above application QPS | A new endpoint without the shard key | A global index or derived copy; a fan-out budget in the router |
| Backfill gap in resharding | Rows updated during the copy are stale on the new shard | Stream position recorded after the snapshot began | Record the position first; replay idempotently; checksum before cutover |
| Large tenants colliding | One shard at 2–3× the others with no single dominant key | Per-shard top-tenant report shows several large tenants on one shard | Salt the top tens of tenants, or move them to dedicated shards through a directory |
| Orphaned uniqueness reservations | "Email already taken" for addresses nobody can log in with | `user_emails` rows in `reserved` state older than minutes with no user row | A sweeper that completes or deletes stale reservations; reserve-first, release-last ordering |
| Uneven ring | One node fills its disk while others are half empty | Token ownership per node; few or randomly placed virtual nodes | More virtual nodes, or allocated rather than random tokens; move logical partitions |

## Interviewer follow-ups

**"Orders are sharded by user_id. How does the merchant dashboard get the last 100 orders?"** Model answer: not scatter-gather on a hot path: 32 queries per request, a merge sort, and a 27% chance of hitting a 1% stall. A `merchant_orders` table keyed by `(merchant_id, created_at)`, fed by CDC, answers with one partition read, lagging by tens to hundreds of milliseconds, which a dashboard tolerates; the one read that must be fresh (the order the merchant was just notified of) goes to its home shard by order ID. Common wrong answer: "add an index on merchant_id", which is a local index on every shard.

**"What is your replica lag alert threshold?"** Model answer: healthy same-region lag is milliseconds; alert at one second, because users notice read-your-writes failures around there and lag past a second usually keeps growing (replay slower than the primary writes), and alert on its rate of change to catch a bulk job starting. Above ten seconds, an asynchronous failover would lose ten seconds of commits. Common wrong answer: "lag doesn't matter, it's eventually consistent".

**"40 replicas, 20 connections each, `max_connections` is 500. Now what?"** Model answer: 800 wanted; Little's law says about 10 are needed at 2,000 transactions/s and 5 ms. PgBouncer in transaction mode with a server pool of 50, client pools of about 5 per replica, and an acquire timeout. Measured, Postgres throughput rose 30% from 32 to 90 connections while latency doubled, so more connections would have bought queueing. Common wrong answer: raising `max_connections`.

**"Why not shard by merchant_id, since merchants pay?"** Model answer: write skew: the top merchant's flash sale concentrates its whole order rate on one shard exactly when it matters. User-keyed sharding spreads the sale over every shard. If merchant isolation is a contractual requirement, a directory scheme gives the largest merchants dedicated shards and packs the long tail. Common wrong answer: agreeing, because the dashboard query becomes single-shard.

**"When would you move to Cassandra or DynamoDB, and what would you lose?"** Model answer: when resharding becomes the team's main job or multi-region active-active writes are required. I would lose ad-hoc queries, joins and cross-partition transactions and gain linear scaling and simpler operations for the access patterns I enumerated; the risk is next quarter's query, so I would keep a relational or analytical copy for the ones nobody predicted ([Choosing a database](/learn/databases/nosql-and-specialised/choosing-a-database)). Common wrong answer: "when we reach a billion rows", which Postgres handles.

**"Users are sharded by user_id. How do you keep email addresses unique?"** Model answer: a separate `user_emails` table sharded by the email, whose primary key is the lock: reserve the address with an insert that fails on conflict, create the user on its own shard, then mark the reservation active, with a sweeper that finishes or deletes reservations stuck after a crash. Login by email reads that table first, which it needs anyway to find the user's shard. Common wrong answer: "a unique index on email", which each shard enforces only for its own rows.

**"A support agent pastes an order ID. How does the system find the shard?"** Model answer: the ID carries it. Order IDs embed the owning user's logical partition next to a millisecond timestamp and a sequence, so the router extracts 13 bits and looks up the partition's current physical shard in a small cached map; resharding changes the map, never the IDs. Common wrong answer: "scatter-gather the lookup across every shard", or a global directory from order ID to shard that every read must consult.

## What mid-level engineers get wrong

- Answering "shard it" before fixing queries, pooling, caching and trying a bigger primary.
- Routing reads to replicas without deciding which reads need read-your-writes.
- Default connection pools on every pod, then raising `max_connections`.
- Asynchronous replication for data that must survive failover, discovered at the first failover.
- Sharding by a time-ordered key and putting every insert on one shard.
- Shipping an endpoint without the shard key and scatter-gathering on a hot path.
- `hash mod N`, then discovering that growing N moves nearly every row.
- Salting only the single largest tenant, when the hot shard is several large tenants that hashed together.
- Enforcing uniqueness with a per-shard unique index on a column that is not the shard key.

## Senior signals

- You walk the ordered list with the measurement that triggers each step.
- You size pools from Little's law and know that past one connection per core Postgres trades latency for nothing.
- You treat lag as a measured quantity with an alert, implement read-your-writes with LSN tokens, and choose `synchronous_commit` per kind of data.
- You evaluate shard keys against hot queries, write skew and co-location, and build the second access path explicitly.
- You quantify scatter-gather's tail and throughput cost and choose among scatter-gather, async copy and distributed transaction per query.
- You design the partitioning scheme for the resharding you will do in two years, and you can turn requirements into a node count.
- You put the partition in the ID, give uniqueness constraints on non-key columns their own table, and quantify skew from the tenant distribution before choosing what to salt.

## Check yourself

```quiz
- q: >-
    An orders table is hash-sharded across 32 nodes by user_id. A merchant query is served by scatter-gather, and each shard has a 1% chance of a 200 ms stall per query. Roughly what fraction of merchant queries take 200 ms or more?
  options: ["About 50%", "About 27%", "About 3%", "About 1%"]
  answer: 1
  explanation: >-
    The query waits for the slowest shard, so it stalls if any of the 32 does: 1 - 0.99^32 ≈ 0.27. Tail amplification is the core cost of scatter-gather and a reason to build a merchant-keyed copy for hot cross-shard patterns.
- q: >-
    Orders are sharded by merchant over 32 shards. The largest merchant is 5% of orders, and a flash sale multiplies its orders tenfold. What happens to the busiest shard?
  options: ["It takes about twice the average, as with any hash imbalance", "It takes about 5% more load, since the merchant is 5% of orders", "It takes about a third of all orders, 11x the average shard", "It stays near average, because hashing spreads each merchant"]
  answer: 2
  explanation: >-
    One merchant's orders all hash to one shard, so its tenfold surge lands there: in the computed example the busiest shard took 1,057 of 2,906 orders a second, 11.6x the average. Hashing spreads merchants, not one merchant's orders. Salting that merchant over 16 shards cut it to 2.65x, at the price of a 16-way read for its dashboard.
- q: >-
    A user updates their name and the reload, served by a replica, shows the old one. Which fix keeps most reads on replicas and guarantees the user sees their write?
  options: ["Route every read to the primary so that no read is ever stale", "Send the user's reads to a replica past their write's position", "Add more replicas so that each one has less lag to work through", "Add a cache in front of the replicas with a short TTL on each key"]
  answer: 1
  explanation: >-
    Return the commit's LSN and serve that user's reads only from a replica whose replayed LSN has reached it, forwarding otherwise. Only the reads that need freshness wait. Routing everything to the primary forfeits read scaling; more replicas do not reduce lag; a cache adds another stale copy.
- q: >-
    With asynchronous replication, the primary acknowledges an order, then its host dies before the replica receives the WAL, and the replica is promoted. What happens?
  options: ["The replica fetches the missing WAL from the dead primary's disk", "The promotion waits until every acknowledged commit is present", "The order is replayed from the client's retry automatically", "The order is lost although the client was told it committed"]
  answer: 3
  explanation: >-
    Asynchronous commit acknowledges after the local flush only, so the promoted replica never saw the order. synchronous_commit = on with a synchronous standby makes the commit wait for the standby's flush, at the cost of about a cross-AZ round trip per commit. Nothing recovers the WAL from a dead host automatically.
- q: >-
    DynamoDB's global secondary indexes are updated asynchronously. What does that imply for a design that writes an item and immediately queries the GSI?
  options: ["It may briefly miss the item; read the base table by key", "The write is rejected until the index update has finished", "The GSI is locked against queries until it has caught up", "The query always sees it, because the write blocks on the index"]
  answer: 0
  explanation: >-
    An index partitioned differently from the table is updated either in a distributed transaction or asynchronously; DynamoDB chose asynchronous, so the query may not see the item for a moment. Reading the base table by key is the consistent path. Nothing blocks or rejects the write.
- q: >-
    You are choosing a sharding scheme for a system that starts on 4 nodes and might grow to 64. Which choice makes future growth cheapest?
  options: ["hash(key) mod N, and re-hash all keys whenever N changes", "Fixed logical partitions (say 1,024) mapped onto physical nodes", "One shard per customer, created on demand as customers sign up", "Range sharding on a sequential primary key across the nodes"]
  answer: 1
  explanation: >-
    With fixed logical partitions a key's partition never changes; growth reassigns whole partitions to nodes and copies them. Modulo hashing remaps almost every key on each resize, sequential range keys concentrate writes on the newest range, and one shard per customer does not distribute the long tail.
```

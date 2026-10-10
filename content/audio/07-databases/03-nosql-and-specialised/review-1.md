---
review: nosql-and-specialised
source: 382d287d7525ba84
---
## Introduction

Twelve questions from the nosql-and-specialised module. Answer out loud before the answer comes.

Two from each lesson, in order: Redis, document stores, wide-column stores, search engines, graph, time-series and vector databases, and choosing a database. Each one has four options, A to D, then a few seconds for you to commit to one.

## Question 1

A service's 99th percentile latency to Redis jumps from 0.3 milliseconds to 40 milliseconds every night at two in the morning. CPU on the Redis host is low. What is the most likely cause?

A, a scheduled job running one command whose cost grows with the data, such as keys or set members. B, the client connection pool being exhausted by nightly batch traffic. C, a snapshot filling the disk, so each write waits for space. D, the backup job saturating the network between the clients and Redis.

[think]

The answer is A: a scheduled job running one command whose cost grows with the data.

Redis executes commands one at a time on a single thread, so one slow command blocks the event loop and delays everyone behind it. And one busy core barely registers as host CPU. The slow log names the command. Pool exhaustion would show up as client-side timeouts, not a server-side stall that lines up with a job.

## Question 2

A nightly report reads every product key once. The next morning, the hit rate for hot product pages has collapsed. Which change fixes this with the least effort?

A, switch the eviction policy from all-keys LRU to all-keys LFU. B, point the report at Postgres directly, so it bypasses the cache. C, switch the eviction policy from all-keys LRU to volatile TTL. D, increase the memory limit, so the report's keys fit alongside the hot ones.

[think]

The answer is A: switch from LRU to LFU.

Under LRU, every key the scan touched becomes more recent than the hot keys, so the hot keys are evicted. LFU's logarithmic counter moves a cold key from 5 to 6 on one touch, while hot keys sit at 18 or more, so they survive. Moving the report also works, but it is a bigger change. More memory only delays the effect, and volatile TTL evicts by expiry, not by use.

## Question 3

A product document embeds an array of reviews. It worked for a year. Now product pages are slow, and one insert failed with a size error. What is the root cause?

A, an unbounded one-to-many was embedded, and the document grew toward 16 megabytes. B, the product collection has outgrown one shard and needs sharding. C, the reviews array needed a multikey index to keep appends fast. D, review writes should have used majority write concern to avoid failed inserts.

[think]

The answer is A: an unbounded one-to-many was embedded and grew toward 16 megabytes.

Reviews per product have no upper bound, and that is the rule for referencing from the many side instead of embedding. Each append creates a new version of the whole growing document, and each read loads all of it, until the 16 megabyte limit stops inserts. A multikey index would add cost, and neither sharding nor write concern changes document size.

## Question 4

Two MongoDB transactions update the same inventory document. What happens to the second one to write?

A, it escalates to a collection lock, so that the two transactions run in turn. B, it blocks until the first transaction commits, and then applies its write. C, it fails at once with a write conflict, so the whole transaction retries. D, it overwrites the first silently, since the last committer always wins.

[think]

The answer is C: it fails at once with a write conflict, and the whole transaction retries.

The storage engine is optimistic: a write to a record that holds another transaction's uncommitted change fails with a transient write conflict, and the transaction helper reruns the whole callback. Postgres, by contrast, makes the second writer wait on the row lock. Retries rerun application code, which is why contended transactions are expensive here.

## Question 5

A table stores sensor readings with a primary key of device ID and timestamp. After six months, reads for busy devices time out and compaction falls behind. What is the fix?

A, raise the replication factor, so each partition has more readers. B, add a secondary index on the timestamp, so time-range reads skip old rows. C, add a time bucket, such as the day, to the partition key to bound it. D, switch reads to quorum, so slow replicas stop holding reads back.

[think]

The answer is C: add a time bucket, such as the day, to the partition key.

A partition keyed only by device grows forever. At one reading a second it passes 100 megabytes within weeks and reaches about a gigabyte a year, and every read, compaction and repair of it degrades. Bucketing by day bounds it at about 86 thousand rows. Consistency level and replication factor do not change partition size.

## Question 6

A team lowers the tombstone garbage collection grace period from ten days to one hour to reclaim disk faster, and runs repair weekly. What is the likely consequence?

A, compaction stalls, because tombstones under an hour old are locked. B, deleted rows come back, because repair revives copies that missed the delete. C, nothing bad; tombstones are purged sooner, so reads become faster. D, quorum writes start failing until the next weekly repair finishes.

[think]

The answer is B: deleted rows come back.

A tombstone must survive until every replica has been repaired. With a one-hour grace period and weekly repair, a replica that missed the delete keeps the row. Once compaction purges the tombstone elsewhere, repair treats the old copy as live data and streams it back. The rule: repair must complete more often than the grace period.

## Question 7

Users report that searching for "Running", with a capital R, finds nothing, although many documents contain "running". The field uses the English analyzer, and the application sends a term query. What is wrong?

A, BM25 gave those documents a score of zero, so they were filtered out. B, a term query skips analysis, but the index holds only the stemmed word "run". C, the index has not refreshed yet, so those documents are still invisible. D, the English stop-word filter removed "running" from the index entirely.

[think]

The answer is B: a term query skips analysis, and the index holds only "run".

Only the terms the analyzer emitted exist in the index: lowercasing and stemming turned "running" into "run". A term query does no analysis, so it looks for the literal token with its capital R. A match query analyses the query text the same way as the documents. Stop words are words like "the" and "of", and refresh lag lasts about a second, not indefinitely.

## Question 8

A team updates Postgres and then calls Elasticsearch in the same request handler. Occasionally, search shows an outdated title forever, although the database is correct. What is the likely mechanism?

A, the refresh interval is too long, so the new title never surfaces. B, two updates reached the index out of order, so the older one won. C, an analyzer change left the old title's terms in older segments. D, Elasticsearch drops some writes under load without reporting them.

[think]

The answer is B: two updates reached the index out of order, and the older one won.

Dual writes have no ordering guarantee between the two systems, so two concurrent updates can reach the index in the opposite order from the database. Refresh delays visibility by about a second, not forever. Change data capture applies committed changes in commit order, and external versioning makes the index reject a stale version, even if it arrives late.

## Question 9

A team wants a graph database for a feature that shows each user's friends, plus friend-of-friend suggestions ranked by mutual friends. What is the best response?

A, adopt a graph database, since friendships are a graph at any depth. B, use a vector database to find users with similar friend lists. C, stay relational, because a composite index serves two hops in milliseconds. D, use a document store, and embed each user's friends in their record.

[think]

The answer is C: stay relational.

Two fixed hops over a primary-key index on user and friend measured about 1 millisecond for 2,500 two-hop rows, on a graph of 5 million edges, transactional, and with no second system. Index-free adjacency pays off as traversals get deeper and branchier, and a supernode would hurt either store equally.

## Question 10

After someone adds a customer ID label to a request-latency metric, the Prometheus server's memory triples and it starts crashing. Why?

A, Prometheus stores integer label values uncompressed, unlike strings. B, each label combination is its own series, so the number of series multiplies. C, latency samples now take more bytes, because each one carries an ID. D, each sample is now scraped once per customer, so volume multiplies.

[think]

The answer is B: each label combination is its own series.

Every distinct combination of labels is a separate series, with its own index entries and its own in-memory chunk, so a high-cardinality label multiplies the series count by the number of customers. Series cardinality, not sample size or scrape volume, drives memory in a time-series database. Unbounded identifiers belong in logs or traces.

## Question 11

A design adds Elasticsearch, Redis and ClickHouse beside Postgres from day one, for an app with 5,000 users. What is the most important review comment?

A, every store adds sync, backup and on-call cost before it delivers any benefit. B, use OpenSearch instead of Elasticsearch, since its licence is safer. C, keep sessions only in Redis, since they are read on every request. D, make ClickHouse the primary store, since it answers queries fastest.

[think]

The answer is A: every store adds sync, backup and on-call cost before any benefit.

The polyglot tax, a sync path, a visible consistency window, backups and restores, an on-call surface, compliance, is paid immediately and continuously. The benefits arrive only when the default fails. Swapping one search engine for another leaves that tax untouched. At this size, Postgres full-text search, a well-indexed schema and replicas very likely cover every pattern.

## Question 12

A product manager says the feed can be eventually consistent. What should you ask before agreeing?

A, whether the feed data exceeds a terabyte, as only small data stays consistent. B, whether the feed is stored as JSON, as document stores are eventual. C, which vendor they prefer, since the vendor fixes the consistency model. D, what stale data users will see, for how long, and what acting on it does.

[think]

The answer is D: what stale data users see, for how long, and what acting on it does.

Eventual consistency without a bound and a named anomaly is not a requirement. The anomaly to name first is usually a user not seeing their own new post: read-your-writes for a user's own actions is usually required even when global staleness is fine, and it changes the design. Consistency is a property of how reads and writes are routed, not of the vendor or the storage format.

## Recap

Three ideas kept coming back. Each store has a shape it rewards and a shape it punishes: Redis punishes one slow command, documents punish unbounded embedding, wide-column partitions punish growth without a bucket, and metrics punish high-cardinality labels. Deletes, ordering and consistency are where the surprises live: tombstones that resurrect rows, dual writes that land out of order, and staleness nobody bounded. And the default answer is often to stay with Postgres until a requirement, stated with numbers, says otherwise, because every extra store charges its tax from day one.

---
lesson: document-stores
source: 8aac44de557b8a34
---
## 1

A product document embeds an array of reviews. It worked for a year. Now product pages are slow, and one insert failed with a size error. What is the root cause?

A, an unbounded one-to-many was embedded, and the document grew toward 16 megabytes. B, the product collection has outgrown one shard and needs sharding. C, the reviews array needed a multikey index to keep appends fast. D, review writes should have used majority write concern to avoid failed inserts.

[think]

The answer is A: an unbounded one-to-many was embedded and grew toward 16 megabytes.

Reviews per product have no upper bound, and that is the rule for referencing from the many side instead of embedding. Each append creates a new version of the whole growing document, and each read loads all of it, until the 16 megabyte limit stops inserts. A multikey index would add cost, and neither sharding nor write concern changes document size.

## 2

A MongoDB query finds documents whose status is open and whose created time is after t, sorts them by priority descending, and takes 20. It is slow, and explain shows a sort stage. The range on created matches about 10 percent of open documents. Which compound index fixes it?

A, created, then status, then priority descending. B, status, then priority descending, then created. C, priority descending, then status, then created. D, status, then created, then priority descending.

[think]

The answer is B: status, then priority descending, then created.

The rule is equality, sort, range. The equality field comes first, then the sort field, so the index delivers documents in order, then the range field, checked inside each index key until 20 match, which is about 200 keys at 10 percent. Putting created before priority still needs a blocking sort of every match. Only when the range is very selective does range before sort win.

## 3

Two MongoDB transactions update the same inventory document. What happens to the second one to write?

A, it escalates to a collection lock, so that the two transactions run in turn. B, it blocks until the first transaction commits, and then applies its write. C, it fails at once with a write conflict, so the whole transaction retries. D, it overwrites the first silently, since the last committer always wins.

[think]

The answer is C: it fails at once with a write conflict, and the whole transaction retries.

WiredTiger is optimistic: a write to a record that holds another transaction's uncommitted change fails with a write conflict labelled as a transient transaction error, and the transaction helper reruns the whole callback. Postgres, by contrast, makes the second writer wait on the row lock. Retries rerun application code, which is why contended transactions are expensive here.

## 4

A team sets MongoDB's write concern to w 1 to reduce latency. After a primary failover, some acknowledged orders are missing, and BSON files appear in a rollback directory. Why?

A, the oplog is truncated during every election, dropping new entries. B, secondaries reject writes that only one member has acknowledged. C, w 1 acknowledges before replication, so the new primary never had those writes. D, the failover restarted the TTL monitor, which deleted recent orders.

[think]

The answer is C: w 1 acknowledges before replication, so the new primary never had them.

With w 1, a write is acknowledged once the primary applies it. A secondary without it can win the election, and when the old primary rejoins, it rolls back its divergent entries into rollback files. Majority write concern waits for a majority, and elections only choose members holding every majority-committed write.

## 5

A Postgres products table has a jsonb column of attributes that is queried only with the containment operator. Which GIN index is the better default, and why?

A, the default jsonb ops, because indexing keys and values separately is more selective. B, the default jsonb ops, because it also supports key-existence queries. C, a B-tree on the column, because GIN cannot answer containment queries. D, jsonb path ops, because it hashes each path and value into one item.

[think]

The answer is D: jsonb path ops, which hashes each path and value into one item.

Path ops stores one hash per path-and-value pair, so containment intersects short lists. Measured on a million rows, it was 18 megabytes and 1.4 milliseconds, against 25 megabytes and 13 milliseconds for the default, whose separate key items, a key present in every row, make long lists. The default is needed only for key-existence and similar operators, and a plain B-tree on the whole value cannot serve containment.

## 6

A Postgres row holds a 100 kilobyte jsonb document. The application updates one small field inside it with jsonb set on every page view. What is the main cost?

A, each update takes a table lock, since jsonb values cannot be locked by row. B, each update is cheap, but vacuum can never reclaim the older jsonb values. C, each update writes about 100 kilobytes of WAL, since the whole value is rewritten. D, each update writes only the changed key, but it invalidates the GIN index.

[think]

The answer is C: about 100 kilobytes of WAL per update, since the whole value is rewritten.

Postgres stores a jsonb value as one datum, so changing one key writes a new copy of the whole value. Measured, that was 113 kilobytes of WAL for one small change, against 130 bytes for updating a separate text column on the same row. Row locks work normally, and vacuum reclaims old versions. The fix is to keep frequently changing fields in their own columns.

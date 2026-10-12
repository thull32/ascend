---
lesson: the-relational-model
source: ca6d4dc2b9b83a7d
---
## 1

An order lines table has the columns order ID, product SKU, product name and quantity, and its primary key is order ID plus product SKU. Which normal form does it violate, and what is the anomaly?

A, none; every column depends on the full composite key. B, third normal form; quantity depends transitively on product name, through the SKU. C, second normal form; product name depends on the product SKU, which is only part of the key. D, first normal form; product name repeats on every line that sells it.

[think]

The answer is C: second normal form, because product name depends on the SKU, only part of the key.

Product name is determined by the SKU alone, a partial dependency on the composite key, which is the second normal form case. Renaming a product means updating every line that ever sold it, and one missed row leaves the table contradicting itself. The value is atomic, so first normal form holds, and quantity has no dependency on product name.

## 2

A bookings table has room, slot and tutor. Each tutor determines a room, and a room plus a slot determines the tutor. You decompose it into one table of tutor and room, and another of tutor and slot. What have you lost?

A, losslessness; joining the two tables back creates spurious rows. B, nothing; a Boyce-Codd decomposition preserves every dependency. C, the key; neither new table has a candidate key at all. D, the rule that a room and a slot determine the tutor, which is now unenforceable in one table.

[think]

The answer is D: the rule that room and slot determine the tutor can no longer be enforced in one table.

The split is lossless, because tutor is a key of the tutor and room table, so the join reproduces the original rows exactly. But the room-and-slot dependency now spans two tables, so no single unique constraint can stop two tutors who share a room from taking the same slot. That is why Boyce-Codd normal form is not always the right target: third normal form keeps every dependency enforceable.

## 3

An orders table of 300 million rows has a customer ID column that references users, and there is no other index on that column. What does deleting user number 5 do?

A, it cascades by default and removes the customer's orders. B, it scans orders to look for referencing rows before it can finish. C, it fails at once, because rows with foreign keys cannot be deleted. D, it is fast, because Postgres indexes foreign key columns itself.

[think]

The answer is B: it scans orders to look for referencing rows before it can finish.

Postgres indexes primary keys and unique constraints, but not the referencing side of a foreign key. So the delete's check on the orders table becomes a sequential scan, run while holding the lock on the user row. On the 2 million row lab table that took 42 milliseconds, against 0.3 with an index. And the default action is no action, which only raises an error if a referencing row exists.

## 4

Copying 2 million rows into a table with a foreign key took 28.8 seconds. Without the foreign key it took 0.67 seconds. What explains the difference?

A, a row-level trigger probes the parent key, and locks it, for every row. B, the foreign key forces a full-page log image for every row. C, rows with foreign keys are stored wider, so fewer fit on a page. D, the foreign key makes Postgres rebuild the parent index for every batch.

[think]

The answer is A: a row-level trigger probes and locks the parent key for every row.

Referential integrity is enforced by system triggers. Each inserted row runs a primary-key lookup on the parent, taking a key-share lock, about 14 microseconds per row in the lab. Row width and page layout are identical in both tables, and the parent index is only read, never rebuilt. So bulk loads validate once with a set-based query, or add the constraint after the load, which Postgres checks with a single outer join instead of one trigger call per row.

## 5

An orders table stores the unit price in cents on each order line, although the products table has a price column. A reviewer calls it a third normal form violation. What is the right response?

A, move it into a materialised view that is refreshed from products daily. B, keep it, and sync it with a trigger whenever the product's price changes. C, remove it, because the current price can always be joined from products. D, keep it, because the price at purchase is a fact about the line, not a copy.

[think]

The answer is D: keep it, because the price at purchase is a fact about the line, not a copy.

The purchase price is an attribute of the order line, and it must not change when the product's current price changes. Joining to products, or syncing with a trigger, would silently rewrite past invoices. Telling historical facts apart from redundant copies of current values is the core normalisation judgement.

## 6

Why is a random version 4 UUID primary key worse than a bigint sequence, or a version 7 UUID, for a table taking 5,000 inserts a second?

A, Postgres cannot build a B-tree on a UUID, so each lookup must scan the heap. B, random keys hit a random leaf on every insert, so pages split and cache poorly. C, its 16 bytes make every index comparison twice as slow as a bigint. D, random 122-bit values start to collide at thousands of inserts a second.

[think]

The answer is B: random keys hit a random leaf on every insert, so pages split and cache poorly.

Ordered keys append to the rightmost leaf, which stays in cache and fills to 90 percent. Random keys touch any leaf, so the whole index is the working set, pages split in the middle and settle near 70 percent full, and each first touch after a checkpoint logs a full-page image. A version 7 UUID is also 16 bytes but time-ordered, which shows that width is not the main cost, and collisions are negligible at any realistic rate.

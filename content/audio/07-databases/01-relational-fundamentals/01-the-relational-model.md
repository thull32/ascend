---
lesson: the-relational-model
source: df97148e1894fc1b
fit: great
desk:
  - "The page-layout arithmetic from pageinspect, byte by byte"
  - "The closure trace table and the tutor bookings decomposition"
  - "The four-table join plan and the denormalisation table"
  - "Exercise: implement closure and find BCNF violations"
---
## Introduction

A customer changes their email address. Your orders table stores the customer's email on every order row, because that was convenient when the checkout page was written. 40 thousand rows carry the old address. A support agent updates the customer record, and next month's invoice still goes to the dead mailbox. Nothing crashed. No test failed. The database did exactly what the schema allowed.

That is an update anomaly, and the relational model exists to make it impossible by construction. Keys, functional dependencies and normal forms are all one idea: put each fact in exactly one place, so the database enforces your invariants instead of your code hoping to.

Three things, then. What a row and a key actually cost in Postgres. The one algorithm underneath every normal form. And when a senior engineer breaks the rules on purpose.

## What a relation is

A relation is a set of rows over a fixed set of named, typed columns. The word "set" has three consequences that matter in production.

First, no duplicate rows. SQL tables are actually bags, which allow duplicates, and a table without a primary key is a bag by design. That is almost always a mistake, because you cannot update or delete exactly one of two identical rows without reaching for the row's physical address.

Second, no inherent order. A select with no order by returns rows in whatever order the executor found them. That changes after a vacuum frees space, after the plan switches from a sequential scan to an index scan, or when parallel workers interleave. Code that relies on insertion order breaks in production on a Tuesday.

Third, every cell is atomic with respect to how you query it. A column holding "red, green, blue" is legal, but you cannot index, join or constrain the individual colours.

SQL adds one thing the model does not have: null, and with it three-valued logic. Null equals null is not true; it is unknown. And here is the trap that bites people. A not in against a subquery that returns a single null returns no rows at all. On the lab schema, a not in query looking for users without orders returned zero, while the equivalent not exists returned the one user who really has none. Each comparison against the null is unknown, so the whole predicate can never be true. Write not exists.

## What a row and a key cost

Every Postgres table is a file of 8 kilobyte pages. Each row carries a 23 byte header, padded to 24, holding the transactions that created and deleted it, and each row also needs a 4 byte pointer in the page's header area. So the fixed overhead is 28 bytes per row before any data. The lab orders row has 36 bytes of data, is aligned to 64 bytes on the page, and exactly 120 rows fit in a page.

Two modelling consequences. A thin junction table of two big integers spends 28 of every 44 bytes on overhead, so splitting a table into many thin tables is not free. And column order changes size, because an 8 byte column after a 4 byte one gets padded. The same four columns took 56 bytes in one order and 48 in another. On a billion-row table, putting the fixed-width 8 byte columns first saves gigabytes.

Now keys. A candidate key is a minimal set of columns that identifies exactly one row. Pick one as the primary key and declare the others unique. The usual choice is a surrogate key, an identifier with no meaning that never changes, rather than a natural key like email. Email means something, and that is exactly why it is dangerous as a primary key. Users change emails, companies get re-domained, and every foreign key would have to cascade the change. Natural keys become unique constraints; surrogates carry identity.

The surrogate's type is a physical decision. A big integer sequence is 8 bytes and always inserts at the right edge of the index. A random UUID, version 4, inserts into a random leaf. Measured on a million rows, that index ended up 71 percent full instead of 90, and after a checkpoint, 100 thousand random inserts wrote 43 megabytes of write-ahead log against 15 for time-ordered keys. UUID version 7 puts a millisecond timestamp in its leading bits, so it stays globally unique but inserts almost as locally as a sequence. The idea is older than version 7: Twitter's Snowflake IDs and Instagram's sharded IDs also put time in the high bits.

## Foreign keys and what they cost

A foreign key is a promise that a value in one table exists as a key in another. Postgres keeps that promise with system triggers. On every insert into orders, a trigger probes the users primary key and takes a light lock on that user row so it cannot be deleted before you commit.

Here is the price. Copying 2 million orders into a table without a foreign key took two thirds of a second. Into an identical table with one, it took almost 29 seconds. That is about 14 microseconds a row, a 43 times slowdown for a bulk load. For one row in a web request, it is noise. For a nightly import of 50 million rows, it is minutes versus hours, which is why bulk loaders load into a staging table and validate once with a single set-based query.

The delete side hides a worse trap. Before I say it: when you delete a user, how does Postgres find their orders?

[pause]

It runs a lookup on orders by customer, and Postgres does not index the referencing column for you. It indexes primary keys and unique constraints, nothing else. Without that index, deleting one user took 42 milliseconds, a sequential scan of 2 million orders. With it, 0.3 milliseconds. On a 300 million row table that does not fit in memory, every user deletion becomes a multi-second scan while holding a lock, and a privacy batch deleting 10 thousand users becomes a day-long job. Create the index in the same migration as the constraint.

And the on-delete action is a domain decision, not a default to accept. Cascade when the child is meaningless without the parent, like order lines. Set null when the child has value of its own. This app learned that the hard way: deleting a user cascaded to their comments, and through the reply link, to other people's replies. The migration switched it to set null, and those comments now show as "deleted user".

## Dependencies and closure

A functional dependency says: whenever two rows agree on X, they agree on Y. Normalisation means making every dependency follow from a key.

Take the opening table: order, customer, customer email, product code, product name, quantity, keyed on order plus product. Order determines customer. Customer determines email. Product determines product name. Only quantity depends on the whole key. The other three produce three concrete failures. An update anomaly: Ana changes her email and every one of her rows must change. An insert anomaly: you cannot record a new blender until someone orders one. A delete anomaly: Raj's only order is deleted, and with it the only record of his email.

Every normal-form question reduces to one computation, the closure of a set of columns: everything they determine. It is a loop. Start with your set. For each dependency whose left side you already have, add its right side. Repeat until nothing changes. If the result is every column, your set is a superkey.

Try it on order alone. Order gives you customer. Customer gives you email. Then you are stuck, because nothing else applies without the product. So order is not a superkey, and order determining customer is a violation. Add the product, and the loop reaches every column. The closure is cheap enough to run by hand on a whiteboard, which is exactly what an interviewer asking "is this in BCNF?" wants to see.

## The normal forms

First normal form: atomic values, no repeating groups. A phone numbers column holding two numbers separated by a semicolon violates it; give phones their own table. A JSON settings blob you never filter on is fine. One you filter on is a schema hiding in a string.

Second normal form: no non-key column depends on only part of a composite key. Product name depending on product code alone is the classic case. Move it to products.

Third normal form: no transitive dependencies. Order determines customer, which determines email. Move email to users.

Boyce-Codd normal form, BCNF, is stricter: every left side of a dependency must be a superkey. The example is tutor bookings, with room, slot and tutor. Each tutor teaches in one room, and each room holds one tutor per slot. It is in third normal form, because room belongs to a candidate key, but not BCNF, because tutor alone determines room. Move a tutor and you update every booking.

So decompose: one table of tutor and room, one of tutor and slot. The split is lossless; joining them back gives exactly the original rows. But it is not dependency-preserving. The rule that a room holds one tutor per slot now spans two tables, and no single unique constraint can stop two tutors sharing a room from booking the same slot. That is the real trade. Third normal form can always preserve dependencies; BCNF cannot.

One more judgement. The order line stores the unit price, even though products has a price. That looks like a violation, and it is not. The price at the moment of purchase is a fact about the line. Prices change; invoices must not. Telling a copy of a current value from a historical fact is the most common normalisation judgement in real systems.

## Paying for normalisation, and breaking it

Every decomposition turns a read into a join. The last ten order lines for one customer, with names and products, is a four-table join. On the lab schema it took 0.2 milliseconds and 70 buffer hits. The surprise: planning took 13 times longer than execution. For a hot query, a prepared statement matters more than the join. The real costs are elsewhere: ORM-generated query patterns, big aggregations, and joins across shards.

Denormalising reintroduces redundancy for read speed, and it is only correct when you own the mechanism that keeps the copies consistent. A derived total updated in the same transaction: no staleness. A materialised view refreshed on a schedule: stale up to the interval, and silently stale if the job dies. An attribute copied across a service boundary by events: seconds, unbounded when the consumer lags, and that is the opening email bug.

The rule: normalise until a measured query hurts, then denormalise that query's data and write down what keeps the copy correct. And lean on constraints. Not null, check, unique, foreign keys with an explicit on-delete, and exclusion constraints for no overlapping bookings. The database enforces them on every path that writes, including a script run at 2 in the morning. A constraint costs microseconds. The incident it prevents costs a data repair.

## In the interview

A follow-up the lesson expects. Why not always normalise to BCNF?

[pause]

Because BCNF decomposition can lose a dependency. In the tutor example, the rule that a room holds one tutor per slot ends up across two tables and needs a cross-table check. Third normal form keeps it enforceable with a single unique constraint. The wrong answer is "joins are slow", which is false at 0.2 milliseconds and misses the point.

And another: UUID or big integer for primary keys? Big integer when one database issues the IDs: 8 bytes, right-edge inserts, a dense index. UUID version 7 when IDs come from many places, because its time prefix keeps inserts local. Avoid version 4 on high-insert tables. Width is a minor factor; randomness is the cost.

## Recap

Four things to remember. Put each fact in one place, and know which anomalies follow when you do not. Closure is the whole machinery: compute what a left side determines, and if it is not everything, you have a violation. BCNF can lose a dependency and third normal form cannot, so choose by which rule must stay enforceable in one constraint. And price your schema: 28 bytes per row, about 14 microseconds per foreign-key check, and a sequential scan per parent delete unless you index the referencing column yourself.

At your desk: the page-layout arithmetic, the closure trace and the tutor decomposition, the join plan, and the closure exercise.

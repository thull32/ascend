---
lesson: data-and-migrations
source: 7cb38b7f7360f463
---
## 1

Ascend stores lesson progress keyed by a slug string, instead of a foreign key to a lessons table. What is the main cost of this choice?

A, every content edit now requires a schema migration before it can deploy. B, progress is lost whenever the lesson files are renumbered or reordered on disk. C, nothing stops a slug from naming a lesson that was renamed or deleted. D, lookups by a string slug are much slower than lookups by an integer key.

[think]

The answer is C: nothing stops a slug from naming a lesson that was renamed or deleted.

Reordering is safe, because identity is the slug in the front matter, and content edits need no migration; those are the benefits. The price is integrity: only the service checks slugs, so a rename leaves orphaned rows unless a data migration ships with it, and nothing enforces that the two ship together.

## 2

Two browser tabs mark the binary search lesson completed at the same instant. What happens with Ascend's upsert, and what would happen with a select, then an insert?

A, upsert: two rows appear; select then insert: exactly one row appears, as expected. B, upsert: both succeed; select then insert: one can hit the key and return 500. C, both approaches behave identically, because Postgres serialises concurrent writes. D, upsert: both fail on the conflict; select then insert: both succeed, as expected.

[think]

The answer is B: with the upsert both succeed, while with select then insert, one can hit the key and return 500.

An insert with an on-conflict update resolves the conflict inside one statement, so one request inserts and the other updates. In the read-then-write version, both selects can see no row, both insert, and the loser violates the primary key. Postgres does not serialise the two sequences for you.

## 3

An early AI budget check read today's usage, compared it with the limit in Rust, and then ran an atomic increment. Why could 30 concurrent requests exceed a limit of 10, and what fixed it?

A, Postgres drops some concurrent upserts, so a unique index on the user and day fixed it. B, the limit was cached in each process, so reading it from the environment fixed it. C, the increment was not atomic, so wrapping it in a transaction with a retry loop fixed it. D, all of them read the same under-limit count; one conditional upsert that returns the new row fixed it.

[think]

The answer is D: all of them read the same under-limit count, and one conditional upsert fixed it.

Each statement was atomic, but the check and the act were separate, so all 30 could pass the check before any increment landed. Folding the condition into the upsert made the database decide and increment in one step, and a concurrent test asserting exactly 10 successes proves it; today's budget holds get the same guarantee from a select for update. A transaction alone at read committed, without the lock, would not have helped.

## 4

A learner whose account is set to Los Angeles time, seven hours behind UTC in summer, studies on Monday at 8 in the evening, and on Tuesday at 9 in the morning, local time. What streak does Ascend show on Tuesday at 10 in the morning?

A, zero, because the Monday session was recorded after UTC midnight. B, 1, because both sessions fall on the same UTC day, Tuesday. C, 2, because each insert computes the day in the learner's own zone. D, it depends on the time zone of the server that ran the insert.

[think]

The answer is C: 2, because each insert computes the day in the learner's own zone.

Since a fix, the insert takes the database's current time in the learner's stored zone, falling back to UTC. So 3 in the morning UTC on Tuesday is stored as Monday, and 4 in the afternoon UTC as Tuesday: two consecutive local days. Before the fix, it stored the UTC date, both sessions landed on the UTC Tuesday, and the streak was 1. The server's zone never mattered, because the day comes from the database's clock and the learner's stored zone.

## 5

Alice deletes her account. Bob had replied to one of Alice's comments. What happens to the two comments?

A, Alice's comment is deleted, and Bob's reply becomes a top-level comment on the lesson. B, the deletion fails with a foreign key violation, until Alice deletes her comments. C, both stay; Alice's loses its author link, and is shown as written by a deleted user. D, both are deleted, because Alice's comment cascades from users, and Bob's from its parent.

[think]

The answer is C: both stay, and Alice's is shown as written by a deleted user.

Since migration 7, a comment's user reference is set to null on delete, so Alice's comment survives without an author, and Bob's reply keeps its parent. Before that migration, both foreign keys cascaded, so an account deletion would have removed Bob's words too. The account deletion endpoint and the set-null change shipped together for exactly that reason.

## 6

Release N plus 1 renames a column in its migration, and updates the code to use the new name. Railway rolls it out with a health-gated deploy. What breaks?

A, only the down migration breaks, and production never runs down migrations. B, the old code, still serving during the switch, queries a column that is gone. C, nothing, because each migration runs inside its own transaction. D, the new deployment cannot start, because the old one still holds a table lock.

[think]

The answer is B: the old code, still serving during the switch, queries a column that is gone.

The migration commits before the new code takes traffic, while the old code is still serving queries that name the old column, so they fail in that window. The transaction makes the migration atomic, not compatible. Expand and contract avoids it: add the new column and write to both, switch reads in the next release, and drop the old column in the one after.

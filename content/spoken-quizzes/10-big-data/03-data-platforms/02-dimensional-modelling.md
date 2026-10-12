---
lesson: dimensional-modelling
source: c8d9f9c1bbf5dc88
---
## 1

An analyst joins an invoice-line fact, one row per invoice line, to an invoice fact, one row per invoice, and sums the invoice-level tax. Tax comes out about 2.3 times too high. Why?

A, surrogate keys are missing, so invoices join twice. B, tax is non-additive, so it can never be summed. C, the join repeats each invoice's tax once per line. D, the tables need a snowflake schema to join correctly.

[think]

The answer is C: the join repeats each invoice's tax once per line.

Joining a coarser-grain table to a finer one repeats the coarse row for every fine row. With about 2.3 lines per invoice, invoice-level tax is summed 2.3 times. Tax is additive; the problem is a grain mismatch. Aggregate the lines to invoice grain first, or allocate the tax to lines.

## 2

Customer 42 moved from France to Germany on 15 March, and paid on 2 March and on 20 March. With a Type 2 dimension keyed at load time, how are the two payments reported?

A, both under Germany, the current version at query time. B, under whichever version is current when the report runs. C, 2 March under France and 20 March under Germany, permanently. D, both under France, the version that existed when the customer signed up.

[think]

The answer is C: 2 March under France and 20 March under Germany, permanently.

Each fact is keyed at load to the version whose effective range contains its payment date: the France version for 2 March, and the Germany version for 20 March. The analyst joins on the surrogate key with no date logic, so the answer never changes. Joining to the current version instead would move both payments to Germany, and change again after the next move.

## 3

A daily snapshot table stores active subscribers per country per day. What does summing active subscribers over March, for France, return?

A, the number of new subscribers France gained in March. B, an error, since snapshot measures cannot be aggregated. C, the number of active subscribers in France in March. D, about 31 times a typical day's count, which means nothing.

[think]

The answer is D: about 31 times a typical day's count, which means nothing.

The measure is semi-additive. Snapshot counts can be summed across countries on the same day, but not across days, so the query silently adds each subscriber once per day. For a month, take the value on the last day, an average, or distinct subscribers from a lower-grain table.

## 4

Why do columnar warehouses usually favour star schemas over snowflake schemas?

A, snowflake schemas cannot be queried efficiently with SQL. B, repeated values compress well, and fewer joins mean fewer bugs. C, star schemas use less storage, even in row-oriented databases. D, snowflake schemas cannot represent slowly changing dimensions.

[think]

The answer is B: repeated values compress well, and fewer joins mean fewer bugs.

Dictionary encoding makes the repeated values in a wide, denormalised dimension nearly free, so normalising them saves little, while adding joins that make queries harder and more error-prone. The argument is about columnar storage and usability, not about what SQL can do.

## 5

On 20 March, the source reveals that a customer's move, loaded as effective from 15 March, really happened on 10 March. What must change?

A, nothing: Type 2 dimensions never modify historical rows. B, the two versions' dates, and the fact partitions for 10 to 14 March, re-keyed. C, insert a third version starting 10 March, and leave the facts alone. D, only the dimension: shift the two versions' effective dates.

[think]

The answer is B: the two versions' dates, and the fact partitions for 10 to 14 March, re-keyed.

Facts dated 10 to 14 March were keyed to the old version at load time, so correcting the dimension's dates alone leaves those facts pointing at the wrong version. The fix is two date updates on the dimension, and an idempotent rerun of the affected fact partitions. Inserting a third version would create an overlapping range, and double matches.

## 6

A Type 2 customer dimension tracks every column, including the last login time. It now has more rows than the payments fact table. What is the right fix?

A, track only the attributes reports group by, and move last login out. B, add a surrogate key per login, so versions stay distinct. C, switch the whole dimension to Type 1, to stop new versions. D, partition the dimension by login date, to keep scans small.

[think]

The answer is A: track only the attributes reports group by, and move last login out.

Each tracked change creates a version, so a frequently changing attribute creates a version per login. Version only the attributes that reports group by, and keep last login as Type 1, in a mini-dimension or on the fact. Switching everything to Type 1 would lose the country and plan history.

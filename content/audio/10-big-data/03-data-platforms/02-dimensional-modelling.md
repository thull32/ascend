---
lesson: dimensional-modelling
source: 7d7bcabd085289e1
fit: great
desk:
  - "The star schema diagram and the three fact-table shapes"
  - "The balance snapshot and the star versus snowflake rows"
  - "The Type 2 dimension traced through three changes, the range join and the two-step merge SQL"
  - "The star, snowflake and one-big-table comparison"
  - "Exercises: maintain a Type 2 dimension, and key facts to the version valid at event time"
---
## Introduction

Three analysts are asked for last quarter's revenue by subscription plan and country. They query a replica of the production database: 60 normalised tables designed for the billing service. Each writes a different 12-table join. One double-counts invoices that have two line items. One uses the customer's current country instead of their country at the time of payment. The three answers differ by 4 percent. Worse, last quarter's number changes every time someone reruns the report, because customers keep moving and the join picks up their new country.

Operational schemas are designed to make writes correct. Analytical schemas must make reads correct, and easy for people who did not design them. Dimensional modelling, codified by Ralph Kimball in the 1990s and still the default shape of analytical marts, does this with a few rules: declare the grain, separate measurements from context, and model change over time explicitly. That last one, slowly changing dimensions, is the one most teams get wrong.

## Grain first

The grain of a table is what one row represents, in business terms: one row per playback session, one row per invoice line, one row per subscription per day. Declare it before you choose a single column.

Nearly every double-counting bug is a grain bug. Join a table at invoice-line grain to a table at invoice grain, sum an invoice-level amount like tax, and you multiply it by the number of lines. With about 2.3 lines per invoice, tax comes out 2.3 times too high. Tax is perfectly additive; the grain is wrong. Aggregate lines up to invoice grain first, or allocate the tax to lines.

Choose the lowest grain the source supports. You can always aggregate a fine-grained fact up. You can never split an aggregate back down, and the next question, revenue by device, will need exactly the dimension the aggregate threw away.

## Facts, dimensions and measures

A fact table records measurements of a business process at the declared grain: numeric measures, plus keys to dimensions. It is long and narrow: billions of rows, a few dozen columns. A dimension holds the context you filter and group by, customer, title, device, date, plan. It is short and wide, deliberately denormalised, so genre and maturity rating are columns on the title dimension, not three more joins.

Fact tables come in three shapes. Transaction facts: one row per event, inserted once, never updated, like payments. Periodic snapshots: one row per entity per period, like one row per subscription per day. And accumulating snapshots: one row per process instance, filled in as milestones complete, like an order row with ordered, shipped and delivered times. That last one is the only fact table updated in place, so it needs a merge rather than a partition overwrite.

Measures come in three kinds. Additive ones, watch seconds and revenue, sum across everything. Non-additive ones, rates and percentages, never sum: store the components and divide at query time. Averaging a stored rebuffer rate weights a ten-second session the same as a three-hour one.

And semi-additive ones, which trip everyone. Two accounts over three days. Account A holds 100, 100, then 120. Account B holds 50, 40, then 40. Sum the balance over those three days and you get 450. What is wrong with that?

[pause]

No account ever held 450. The query added each balance once per day. Summing across accounts on one day is fine; summing across days is not. The defensible answers are the end-of-period total, 160, or the average daily total, 150. The same bug shows up as "total subscribers in March" coming out 31 times a typical day's count.

## Star versus snowflake

A star keeps each dimension as one denormalised table. A snowflake normalises further: titles point to a genre table, which points to a genre family table, so the word "Drama" is stored once instead of on every drama title.

"Watch seconds by genre family" in the star is one join and one group-by. In the snowflake it is three joins, each a chance to pick the wrong key, or to drop rows with an inner join on a missing genre. And what does the snowflake save? The repeated string. In a row store, that is real bytes. In a columnar file, the column is dictionary-encoded as two distinct values plus a small code per row, and run-length encoded when sorted. The repetition costs bits, not bytes. That is why columnar warehouses favour the star.

The engine likes it too. Dimensions are small, so the planner broadcasts them: a 20 thousand row title dimension, about 4 megabytes, is copied to every executor, and the fact joins with a local hash lookup and no shuffle. A 250 million row customer dimension is not broadcast; that join is the one worth pre-computing. Dynamic partition pruning turns a filter on the date dimension, one quarter, into a list of fact partitions, so the scan reads 91 daily partitions instead of 1,095.

Dimensions use surrogate keys, integers the warehouse assigns, rather than the source's ids, because one customer will have several historical versions, each needing its own key. And dimensions shared across marts with the same keys and meaning are conformed: the same customer and date dimensions serve playback, billing and support. Conformed dimensions are the warehouse's organisational contract. Without them, every team's "country" is subtly different.

## Slowly changing dimensions

When an attribute changes, you choose a type. Type 0 never changes it, like original sign-up country. Type 1 overwrites in place, so last year's revenue silently moves to the new country; that is what the analysts in the opening were doing by accident. Type 3 adds a previous-value column, useless at the third change. Type 2 is the one to know in depth: close the current row and insert a new version with effective dates.

Trace customer 42. Signs up in France on the basic plan: version 1001, effective from February 2023, open-ended. Moves to Germany on 15 March 2024: close 1001 on that date, insert 1873. Upgrades to premium in June: close 1873, insert 2410. Moves back to France in September: close 2410, insert 3055. Moving back does not reopen 1001. It is a new version.

Two conventions matter. The effective-to date is exclusive, so a fact on the change day matches exactly one version, the new one. Inclusive at both ends, and a fact on the change day matches two versions and is counted twice. And open-ended rows use a far-future date like the year 9999 rather than null, so range predicates stay simple.

Now the payoff. Facts are keyed at load time to the version whose range contains the event date. A payment on 2 March gets 1001, France and basic. A payment on 20 March gets 1873, Germany. Revenue for 2024 by country: France 26, Germany 26. The analyst joins on the surrogate key alone, with no date logic, and gets those numbers every time. Join to the current version instead, and all four payments report as France, 52, and as premium, 52, and after the next move, different numbers again.

Maintaining Type 2 is a two-step merge in one transaction. First, close current rows whose tracked attributes changed. Second, insert a new current version for every customer with no current row, which now covers both changed and brand-new customers. Rerun it with the same staging data and it finds no differences and inserts nothing: idempotent.

Then decide what to track. Version last login time, and you get a row per login and a dimension bigger than the fact. Track only what reports group by, and move volatile attributes to a mini-dimension or onto the fact. And the effective time: the load date lags reality by up to a day; the source's change timestamp, which CDC gives you, is accurate.

## Late arrivals and size

Two different things arrive late. A late dimension row: a payment for customer 77 arrives a day before their profile. Do not drop the fact or leave its key null. Insert an inferred member, a placeholder version with unknown attributes, key the fact to it, and when the profile arrives, overwrite the placeholder in place. The fact needs no rewrite.

A late change is worse. On 20 March the source reveals customer 42 actually moved on 10 March, not 15. Two versions now have the wrong dates, and every fact from 10 to 14 March was keyed to the France version. The fix is two date updates on the dimension, and a rerun of those five fact partitions, which is only cheap because the fact load is an idempotent partition overwrite.

Size it. Assume 200 million playback sessions a day, about 100 bytes a row uncompressed, roughly 40 on disk in Parquet. That is 8 gigabytes a day, 2.9 terabytes a year, about 9 for three years. Partition by date, so a week reads 56 gigabytes, not 9 terabytes. Sort within the partition by customer key, so per-customer queries skip row groups.

Many teams also publish one big table for dashboards, the fact with its popular attributes pre-joined. No joins to get wrong, and column pruning makes unused columns free. The costs are rewriting history when an attribute changes, and ten copies of "country" that drift. The compromise that works: the star is the source of truth, the wide tables are generated from it, and nobody edits them by hand.

## In the interview

A follow-up from the lesson. Revenue by country for last year has to be stable forever, but customers move. Design it.

[pause]

A Type 2 customer dimension with effective ranges, effective-to exclusive, and facts keyed at load time to the version valid on the payment date. The analyst joins on the surrogate key only. The wrong answer is to store country on the fact row, which works for one attribute and collapses when the third is requested.

And: a daily snapshot has 250 million rows per day. How do you answer "active subscribers on 1 March" and "in March"? The first is a filter on one partition and a count. The second must be defined, end of period, average, or distinct across the month from the transaction fact, because the measure is semi-additive. Summing over the month is the wrong answer.

## Recap

Four things to remember. Declare the grain in one sentence before any column, and read double counting as a grain mismatch. Classify measures: never sum a semi-additive measure across time, and store components, not ratios. Default to a star with conformed dimensions in a columnar warehouse, and generate wide tables from it. And maintain Type 2 with exclusive effective ranges, keying facts to the right version at load time, so history never rewrites itself.

At your desk: the schema diagram, the balance and star versus snowflake rows, the Type 2 trace with its SQL, the comparison table, and the two exercises.

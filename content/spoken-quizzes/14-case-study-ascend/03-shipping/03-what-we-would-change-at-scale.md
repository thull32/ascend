---
lesson: what-we-would-change-at-scale
source: cc731bec6fd4e430
---
## 1

A learner has 1,500 output tokens left today, and sends a coach turn whose maximum is 4,000 output tokens. What does Ascend's budget reservation do?

A, holds nothing now, and charges what the call used when it ends. B, holds 1,500 tokens, and lowers the call's maximum to 1,500. C, refuses, because the call's maximum is larger than what is left. D, holds 4,000 tokens, letting the day end 2,500 over its limit.

[think]

The answer is B: it holds 1,500 tokens, and lowers the call's maximum to 1,500.

The call may start if at least a quarter of its maximum, kept between 256 and 4,000, remains: here, 1,000 tokens. 1,500 do remain, so it holds the smaller of the maximum and what is left, and lowers the request's maximum to match, so the reply cannot outspend the day. Holding the full 4,000 was the old overshoot, and charging only afterwards was the check-then-charge design that holds replaced. With 900 tokens left, it would refuse, rather than start a reply it would have to cut off.

## 2

Ascend adds a second replica, with no other change. What happens to rate limiting and to the AI budgets?

A, the budgets double, because each replica reads its own copy of the usage table. B, nothing changes at all, because every bucket already lives in Postgres. C, every limit doubles, because each replica keeps its own in-memory buckets. D, only the loose per-IP general bucket doubles; the security limits and the budgets hold.

[think]

The answer is D: only the loose per-IP general bucket doubles, while the security limits and the budgets hold.

The security-relevant buckets are now GCRA rows in Postgres, checked by one conditional upsert, and a test proves that two instances share them. The general bucket of 1,200 a minute stays in each process's memory on purpose, so it does multiply. Budgets live in the usage table and are held under its row lock, so they are shared too. Every limit doubling was true before the shared limiter.

## 3

Which table is projected to grow fastest at 10,000 daily active users, and why?

A, sessions, because each login adds a row that stays until it finally expires. B, AI usage, because it gains a row for every model request a learner makes. C, submissions, as every run stores its code and results, failures included. D, messages, because each AI reply is long, and every turn adds two rows.

[think]

The answer is C: submissions, as every run stores its code and results, failures included.

Runs are far more frequent than coach turns, and each one stores up to 64 kibibytes of code, plus results for every test. The usage table has one row per user per day, and expired sessions are swept hourly. The fix is deciding what each submission row is for, and keeping only those.

## 4

You need to delete submissions older than 30 days: about 4.5 million rows a month at 10,000 daily active users. Why partition the table by month, instead of running a nightly delete?

A, dropping a partition avoids the dead tuples, the vacuum and the write-ahead log of a delete. B, Postgres does not allow a delete on tables past a few million rows. C, partitioning makes new inserts faster, and the nightly delete job slows them down. D, partitioned tables compress old rows better than one large table can.

[think]

The answer is A: dropping a partition avoids the dead tuples, the vacuum and the write-ahead log of a delete.

Postgres implements a delete by marking row versions dead, which vacuum must later clean, and it writes to the log for every row. Dropping a partition is a metadata operation. Ascend's retention job deletes in batches of 5,000 today, which bounds each statement, but not the dead tuples. Compression and insert speed are not the reason, and delete works on tables of any size, only expensively.

## 5

Ascend's shared limiter keeps its state in Postgres, and answers 503 when Postgres is unreachable. Why is failing closed acceptable here, when it would not be for a limiter backed by Redis?

A, the requests it guards need Postgres anyway, so refusing them costs no extra availability. B, Postgres never becomes unreachable, since the platform restarts it within seconds. C, failing open would leak the rate limits table, because it is an unlogged table. D, a 503 tells browsers to retry at once, so learners never notice the refusal.

[think]

The answer is A: the requests it guards need Postgres anyway, so refusing them costs no extra availability.

Sign-up, login, model calls and grading all read or write the database, so when it is down they fail regardless, and refusing them early adds no outage. A Redis limiter in front of requests that do not need Redis would turn a cache outage into a site outage, which is why the review had proposed degrading to local shares. Unlogged only means the table skips the write-ahead log, and is emptied after a crash.

## 6

The first review priced verifying every run at about 90 busy virtual CPUs at peak, and recommended verifying only submissions for credit. Why could ADR 5 grade every signed-in run instead?

A, Railway bills grading CPU separately, so it no longer counts toward capacity. B, the server skips the hidden tests, which were most of the grading work. C, a WebAssembly run costs about a tenth of the CPU second the estimate assumed. D, browsers now send only failing runs, so the server grades far fewer of them.

[think]

The answer is C: a WebAssembly run costs about a tenth of the CPU second the estimate assumed.

The estimate assumed about one CPU second per run in a container sandbox. A WebAssembly instance starts in about 0.09 seconds for Python and 0.02 for JavaScript, so 87 runs a second at peak needs roughly 9 to 17 cores: a few replicas. The method, pricing both options, stayed the same; the unit price changed. Hidden tests are graded like the others, and every signed-in run is sent, not only failures.

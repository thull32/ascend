---
lesson: mapreduce
source: 70e5247b388d7899
fit: great
desk:
  - "The word-count trace through map, combine, partition and shuffle, with the failed mapper"
  - "The sort buffer, spill and merge mechanics, and the counters that expose them"
  - "The salting code for a skewed distinct count, and the join-strategy table"
  - "Exercise: simulate a word count with a combiner and partitioner"
---
## Introduction

You have 10 terabytes of playback logs and one question: how many times was each title played yesterday? On one machine the answer is a hash map and a loop, and the loop is the problem. A good disk streams about 200 megabytes a second, so just reading 10 terabytes takes 50 thousand seconds, roughly 14 hours, before you have counted anything.

Spread the files over a thousand machines and each one reads 10 gigabytes in under a minute. The arithmetic is easy. The engineering is not. Someone has to decide which machine reads which bytes. Someone has to get every partial count for Stranger Things onto the same machine so they can be added. And in a fleet of a thousand cheap servers, something fails during most long jobs.

MapReduce, described by Google in 2004 and cloned as Hadoop soon after, answered all three with one constraint: you write two pure functions, and the framework owns everything else. Spark and SQL engines have since replaced it, but every one of them still runs the same three phases underneath. Learn where MapReduce spends its time and you can predict why a Spark plan or a BigQuery query is slow.

Four ideas, then. What the shuffle is and how to count its cost. The combiner, and the algebra it demands. Recovery by re-running tasks. And skew, the one reducer that does all the work.

## The model and how a job runs

A job is two functions. Map is called once per input record, on its own, and emits zero, one or many key-value pairs. Reduce is called once per distinct key, with every value any mapper emitted for that key.

Between them sits the framework's contract, the shuffle. Every pair with the same key reaches the same reduce call, and the keys arrive at each reducer in sorted order.

For the play count, map reads a log line and emits the title with the number one. Reduce sums the ones. That is the whole program. Notice what it does not contain: no file paths per machine, no sockets, no retry logic, no locks. Because map looks at one record and reduce looks at one key, the framework is free to run them anywhere, in any order, as many times as it likes. That freedom is what buys fault tolerance.

One trap from day one. The values reach reduce as a one-pass iterator, and Hadoop reuses the same value object on every step to avoid allocation. Store the object instead of a copy of its contents, and every element you kept turns into the last one. It is the first bug most engineers write in a raw MapReduce job.

The input is cut into splits, normally one per file-system block of 128 megabytes. Ten terabytes becomes about 80 thousand map tasks. A master schedules each one, preferring a worker that already holds a copy of that block on its own disk. Moving a one-kilobyte program to 128 megabytes of data is cheaper than the reverse.

Each map task writes its output into an in-memory sort buffer, 100 megabytes by default, and spills it to the mapper's local disk when it is 80 percent full. Each pair is assigned a reducer by the partitioner: a hash of the key, modulo the number of reducers. Spills are sorted by reducer and then by key, and at the end they are merged into one file per map task, divided into one sorted segment per reducer.

Then the shuffle. Each reducer fetches its segment from every map task over HTTP. With M map tasks and R reducers, that is M times R fetches. Each reducer merge-sorts its segments, walks the merged stream calling reduce once per key, and writes one output file.

Here is the smallest picture that shows it. Three map tasks, each reading one short line: "the cat sat", "the dog sat", "the cat ran". Two reducers. The partitioner happens to send cat, dog and sat to reducer zero, and ran and the to reducer one. Nine pairs cross the network in six fetches, three maps times two reducers. Reducer zero computes cat 2, dog 1, sat 2. Reducer one computes ran 1, the 3. Two output files, and nothing is sorted across them.

Now kill the worker running the second map task, after reducer zero has fetched its segment but before reducer one has. The master notices the missed heartbeats, re-runs that map task on another worker, and tells reducer one where to fetch from. Reducer zero does nothing, because the master tracks every map and reducer pair, and its copy is already merged. Nothing is counted twice: a reducer never fetches the same attempt twice, and the re-run produces identical bytes.

## Counting the shuffle

The shuffle is the expensive part of every distributed job, so learn to estimate it before you run anything. Take the title count on one terabyte of play events at 200 bytes each. That is 5 billion events, about 10 thousand distinct titles, and about 8 thousand map tasks. A serialised pair costs about 16 bytes on the wire.

Without help, all 5 billion pairs cross the network: about 80 gigabytes. Now add a combiner, which is a reducer that runs on each mapper's output before it is written. A mapper that saw Stranger Things 40 thousand times ships one pair saying 40 thousand. At most, that is 8 thousand mappers times 10 thousand titles, 80 million pairs, about 1.3 gigabytes. For aggregations over a small key space, a combiner routinely shrinks the shuffle by one to two orders of magnitude.

So here is a question. The job computes average watch time per title, and someone registers the reducer, which returns the mean of its inputs, as the combiner. Is that safe?

[pause]

No. The job gets faster and some averages come out wrong. A combiner is only legal when the function is associative and commutative, because the framework may apply it zero, one or several times to arbitrary subsets of values: once per spill, again at merge time, or never if the buffer never spilled. Sum, max, min and count qualify. Average does not: the average of partial averages is wrong unless every partition has the same count.

The fix is to change what flows through the shuffle. Emit a sum and a count, combine them by adding both, and divide only in the final reduce. Carry the algebra, not the answer. You will meet that trick again in Spark's partial sums, in an OLAP engine's partial aggregates, and in streaming window aggregates.

The number of reducers is a real tuning decision too. With the combiner and 200 reducers, the shuffle is 8 thousand times 200, 1.6 million fetches, averaging about 800 bytes each. The job spends its shuffle on per-request overhead, not bytes. Raise it to 2 thousand reducers and you have 16 million fetches of 80 bytes. Drop it to 5 and each reducer merges 8 thousand segments in a single process that becomes the bottleneck. Aim for reducer inputs of hundreds of megabytes to a few gigabytes each, and let the total shuffle size divided by that target set the count.

## Recovery by re-execution

At a thousand machines, failure is a scheduling event, not an emergency. The master pings workers. When one misses its heartbeats, every map task it ran is re-run elsewhere, including the completed ones, because their output lived on that dead machine's local disk. A failed reduce task is re-run too, but completed reduce output is already in the replicated file system and survives.

Task output goes to a temporary attempt directory and is committed by an atomic rename. If two copies of the same task finish, the rename makes exactly one visible. The master itself is not replicated: in the original design a master crash aborted the job. Under YARN the master is restarted once, two attempts in total, and recovers completed tasks from its history log.

All of this rests on determinism. If map reads the clock, uses an unseeded random number, or writes to an external database, re-running it produces different or duplicated effects. The committed files are exactly-once. Anything else a task writes is at-least-once. The classic symptom: downstream rows are 1 to 2 percent higher than the job's own counter, because retries and speculation performed the same database write twice.

Speculation is the answer to stragglers. One machine with a failing disk runs its task five times slower, and the whole job waits. So MapReduce launches backup copies of the last few running tasks and takes whichever finishes first. In Google's paper, a one-terabyte sort took 891 seconds with backups and 1,283 without, 44 percent longer. Speculation is safe only because of the atomic rename, and dangerous for any task with side effects.

## Skew

Hash partitioning spreads keys evenly, not records. Suppose you want unique viewers per title instead of plays. Reduce must see every user id for a title, so no combiner can collapse them. If one hit title is 5 percent of the 5 billion events, its reducer receives 250 million records while the average reducer among 200 gets 25 million. That one task runs ten times longer, and the job takes as long as its slowest task.

Before anything clever, look at the hot key. It is usually a null, an empty string, or a placeholder like a title id of minus one, not a real hit. Filter or route those separately.

For a genuinely hot key, salt it. Split the title into 16 sub-keys, count distinct users in each, then add the 16 counts in a second job. The detail that matters: the salt must be a hash of the user id, not a random number. That way each user lands in exactly one bucket, the 16 sets are disjoint, and their sizes can be added. Salt randomly and the same user appears in several buckets and is counted several times. The totals look plausible and are wrong.

Even salted, one bucket can hold about 16 million ids, roughly a gigabyte of Java objects. When that is too big, use secondary sort: put the user id into the key, group on title and salt only, and count distinct ids by comparing each one with the previous as the sorted stream goes past. Memory drops to two ids.

## Joins, and why it was replaced

Most real batch jobs join, and MapReduce had the strategies every later engine kept. A reduce-side join shuffles both sides in full by the join key. A broadcast join ships a small table, say a 50-megabyte titles table, to every mapper as a hash map, so the large side never crosses the network. A map-side merge join needs both inputs pre-bucketed and sorted on the join key, and shuffles nothing. And a Bloom filter of the small side's keys, about 10 bits per key for 1 percent false positives, lets you drop most non-matching rows before the shuffle. Choosing among them is still the most consequential decision in most batch plans.

MapReduce was replaced for reasons that follow from its design. Every job writes its output to the replicated file system, so a five-stage Hive query materialises four intermediate datasets, each written three times. There is only map then reduce, so multi-step logic becomes many jobs, each paying a second or two of container and JVM start-up per task. Nothing stays in memory between iterations. Every job pays for a sort. And it is batch-only, minutes of latency.

What survived matters more: the shuffle, the partitioner, partial aggregation, the broadcast-versus-repartition choice, deterministic tasks with an atomic commit, and speculative execution. They are all still in Spark and every cloud warehouse.

## In the interview

A follow-up the lesson expects: how would you compute the ten most-played titles?

[pause]

Count per title with a combiner and many reducers. Then have each reducer keep its own top ten in a bounded heap, and merge them in a single reducer that sees at most ten times R candidates. The wrong answer is one reducer sorting every count, which funnels the whole job through one task.

And the trickier one: does MapReduce give exactly-once?

[pause]

For its own output files, yes, through the atomic commit of one attempt per task. For anything a task does externally, no, because retries and speculation run tasks more than once. The wrong answer is "tasks run exactly once", which is precisely what re-execution does not promise.

## Recap

Four things to remember. Estimate a job by its shuffle: pairs emitted, bytes after the combiner, M times R fetches, and the size of each reducer's input. A combiner needs an associative and commutative function, so shuffle a sum and a count, never an average. Recovery is re-execution, which makes determinism a correctness requirement and makes side effects inside tasks a bug. And skew is one reducer with ten times the median: check for placeholder keys first, then salt by a function of the record when the second stage has to stay correct.

At your desk: the word-count trace with the failed mapper, the sort buffer and spill mechanics, the salting code and join table, and the word-count exercise.

---
lesson: logarithms-and-exponentials
source: 1c2fda5cd8c9cf90
fit: partial
desk:
  - "The halving table for 1000 and the floor and ceiling of log base 2"
  - "Deriving the log rules and change of base from the exponent rules"
  - "The B-tree height table and the powers-of-two table"
  - "The backoff-with-jitter trace and the EMA trace"
  - "Reading logs off code, including the harmonic-series loop"
  - "Exercises: integer log base 2, next power of two, backoff schedule"
---
## Introduction

A colleague says the new index lookup is order log n, so it does not matter how big the table gets. A product manager asks how many users a 32-bit ID space supports. An interviewer asks whether trying every subset of 40 items is feasible. And an on-call engineer asks why a dependency was hit by 1,000 retries in the same millisecond.

All four questions have the same shape. How fast does something grow when you keep doubling, and how many times can you halve before you reach one? That shape is the logarithm, and its mirror image is the exponential.

Four ideas, then. What a logarithm counts, and why its base stops mattering. When log n is genuinely free and when it is not. The powers of two that let you size systems in your head. And the doubling you actually want: backoff, moving averages and decay.

## What a logarithm counts

Log base 2 of n answers one question: how many times do you double 1 to reach n? Or, the same thing backwards, how many times can you halve n before you get down to 1?

Try it with 1000, halving and rounding down the way code does. 500, 250, 125, 62, 31, 15, 7, 3, 1. Nine halvings. So the floor of log base 2 of 1000 is 9, because 2 to the 9 is 512, which is at most 1000, and 2 to the 10 is 1024, which is past it. Doubling up from 1 gives you the ceiling instead: ten doublings to pass 1000. Floor and ceiling differ exactly when n is not a power of two.

That halving loop is the whole definition. Every algorithm that halves its problem each step runs for exactly that many steps. Binary search on 8 sorted elements: eight candidates, then four, then two, then one. Three halvings, which is log base 2 of 8, and then one comparison to check the last candidate.

Every log rule is an exponent rule read backwards. Multiplying powers adds exponents, so the log of a product is the sum of the logs. Raising to a power multiplies the exponent, so the log of a to the k is k times the log of a. And change of base says a log in one base is a log in another base divided by a constant.

That constant is why Big-O never names a base. Log base 2 and log base 10 differ by a factor of about 3.32, for every n, and Big-O drops constant factors. So log base 2, the natural log and log base 10 are all one class. Two more consequences you use daily. The log of n cubed is 3 log n, so it is still order log n. And the log of n factorial is about n log n, which is the lower bound for comparison sorting: n factorial orderings to tell apart, one bit of information per comparison.

The derivations are short and worth doing once on paper. For listening, hold the one sentence: a log rule is an exponent rule read backwards.

## Why log n is free, and when it is not

Here is the most important set of numbers in the lesson. Going from a thousand items to a trillion, a billion-fold increase, moves log base 2 of n from 10 to 40. Anything that fits in a 64-bit integer has a log of at most 64. So an order log n operation costs a few dozen steps, whatever n is.

Compare n squared. At a billion items it is 10 to the 18 operations, which is thirty years at a billion operations a second. And n log n sits close to linear: sorting a million items is about 20 million comparisons.

A rule of thumb for interviews follows. A core does somewhere between a hundred million and a billion simple operations a second. So n log n at ten million finishes in about a second, while n squared at a hundred thousand takes tens of seconds. If an interviewer says n can be a hundred thousand, n squared will not pass.

Now the trap. Free has a precise meaning once you attach nanoseconds. Picture two binary searches. The first is over 1,000 sorted integers, 4 kilobytes, sitting in the fastest cache. Ten comparisons at about a nanosecond each: roughly 10 nanoseconds. A hash lookup whose bucket is not in cache costs one or two memory misses, 100 to 200 nanoseconds, and loses ten-fold.

The second search is over a billion integers, 4 gigabytes. Thirty probes. Before I tell you: which one wins now, the binary search or the hash table?

[pause]

The hash table, by about thirteen times. The first 26 or so probes each land on a fresh cache line, because the remaining range is bigger than any cache until the very end. That is about 26 memory misses at 100 nanoseconds, roughly 2.6 microseconds, against the hash table's 200 nanoseconds.

So here is the rule. Order log n is free when each step is a register or cache operation, and dear when each step is a dependent memory access, a disk read or a network hop. The step count is tiny; what matters is the cost of each step.

## The base matters when you count disk reads

That rule is the whole reason B-trees exist. A B-tree node is one disk page, and a lookup reads one page per level, so the height of the tree is the number of reads. The height is the log of n in base f, where f is the fan-out, the number of children per node.

A 16 kilobyte page holding 16-byte entries, an 8-byte key and an 8-byte child pointer, gives a fan-out of about 1,000. For a billion keys, a binary tree on disk needs 30 levels: 30 reads. A B-tree with fan-out 1,000 needs 3. Change of base is what turned 30 into 3: about 29.9 divided by about 10.

Returns then diminish. Fan-out 4,096 still needs three levels for a billion keys, because the height rounds up and the ceiling swallows the fractional saving. And real lookups are cheaper still: the root plus its 1,000 children is about 16 megabytes, which stays in memory, so a billion-row index lookup is typically one physical read. Never thirty.

## The powers of two to know

Most capacity estimates are a power of two dressed up. A handful to carry. 2 to the 10 is 1,024, a kibibyte. 2 to the 16 is 65,536, the number of ports. 2 to the 20 is about a million. 2 to the 32 is about 4.3 billion: the IPv4 address space, a 32-bit hash, a 32-bit ID. 2 to the 53 is the largest range where every integer is exact in a 64-bit float, and so in a JavaScript number. And 2 to the 64 is about 1.8 times 10 to the 19.

Two conversions make them usable without a calculator. First, 2 to the 10 is roughly 10 to the 3, so 2 to the 30 is roughly a billion. But the error compounds at 2.4 percent per step, which is why a one terabyte drive shows as 931 gibibytes. Second, split the exponent: 2 to the 27 is 2 to the 20 times 2 to the 7, a million times 128, about 134 million.

Now a worked question. Each event gets a random 32-bit ID, at 50 thousand events a second. Is that enough? At that rate you generate 4.3 billion IDs in about a day, so the space is exhausted in a day. Worse, as the probability lesson derives, the first collision is more likely than not after only about 77 thousand IDs, a couple of seconds in. Use 64 bits, or 128.

## Exponentials, the hostile twin

If log n is the friendly function, 2 to the n is its hostile twin: each extra item doubles the work. It counts every subset of n items, every bit string of length n.

Exponentials start slowly and then explode. 2 to the 20 is a million. 2 to the 30 is a billion, about a second of work. 2 to the 40 is a trillion, about eighteen minutes. 2 to the 50 is thirteen days. Each extra 10 in the exponent multiplies the time by a thousand. So enumerating all subsets of 40 items is no, while 25 items is routine.

Factorials are worse still. 12 factorial is about 480 million, roughly the last feasible value for brute force. 20 factorial barely fits in an unsigned 64-bit integer, and 21 factorial does not. When a problem says try every ordering and n can be 15, the interviewer expects you to notice that 15 factorial is over a trillion, and to find structure that prunes the search.

## Doubling you want

Not every exponential is a cost. The same doubling is what makes dynamic arrays cheap and retry storms survivable.

A dynamic array that doubles copies its contents at sizes 1, 2, 4, and so on up to n, and that sum is less than 2n, because a geometric series is dominated by its last term. That is why append is amortised constant time. Growing by a fixed 100 slots instead is quadratic. The principle to keep: the total of a halving or doubling series is a constant times its largest term.

Retry backoff. Exponential backoff sleeps a base times 2 to the attempt number, capped. Full jitter replaces that with a random sleep anywhere from zero up to the window. Why does jitter matter? Picture 1,000 clients that all fail at the same instant. Without jitter, they retry together at 100 milliseconds, 300, 700, and 1.5 seconds: four spikes of 1,000 requests, which is the thundering herd that keeps a recovering dependency down. With full jitter, the first round is spread over 100 milliseconds, about 10 per millisecond, and the fifth over 1.6 seconds, about 0.6 per millisecond. The number of retries is the same. Only the timing is spread. Pair it with a retry budget, say retries capped at 10 percent of the request rate: backoff bounds the wait, the budget bounds the load.

Exponential moving averages. Each update takes alpha times the new sample plus one minus alpha times the old average. Unroll it and every older sample's weight shrinks by a factor of one minus alpha per step. So choosing alpha is choosing a half-life, and for small alpha the half-life is about 0.693 divided by alpha. An alpha of 0.2 has a half-life of about 3 samples. TCP's smoothed round trip time uses one eighth, about 5 samples. An alpha of 0.01 has a half-life of 69 samples, which at one sample a second is a dashboard that reacts more than a minute late.

The same curve describes cache staleness. If each key's backing row changes on average once every 10 minutes, half the cache is stale after about 6.9 minutes. With a one-minute TTL, about 5 percent of reads are stale on average; with five minutes, about 21 percent. "A few minutes feels fine" is not a substitute for the exponential.

## In the interview

Here is a follow-up the lesson expects. You said order log n is basically free. When is it not?

[pause]

When each step is a dependent memory access. Over 4 gigabytes of integers, binary search is about 26 cache misses, 2.6 microseconds, against one or two misses for a hash lookup. Over 4 kilobytes it is 10 nanoseconds and wins. The wrong answer is that 30 is a small number, which ignores that each of the 30 can cost 100 nanoseconds.

And a design one: specify the retry policy for a client of a flaky downstream. Exponential base with a cap, full jitter, a maximum attempt count, a deadline on the total wait, a retry budget capping retries at a fraction of live traffic, and only for idempotent calls. The wrong answer is retry three times with a one-second sleep, which synchronises every client and triples the load on a failing dependency.

## Recap

Four things to remember. A logarithm counts halvings, and its base is only a constant factor, which is why Big-O ignores it and why a B-tree's large fan-out turns 30 page reads into 3. Order log n is free when each step is cheap and expensive when each step is a memory miss, a disk read or a network hop. 2 to the 10 is about a thousand, 2 to the 32 about four billion, and 32-bit random IDs collide within seconds at 50 thousand a second. And a doubling series totals a constant times its last term, which is why doubling arrays are cheap, while jitter spreads retries and alpha sets a half-life.

At your desk: the halving table and the log rule derivations, the B-tree and powers-of-two tables, the backoff and moving-average traces, reading logs off code, and the three exercises.

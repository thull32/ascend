---
lesson: senior-signals-in-coding-rounds
source: 3b89749369e54ed8
---
## 1

Two candidates write identical, correct LRU caches. One clarifies what get should do, tests the update case, and raises concurrency without being asked. The other does all three only after the interviewer asks. How do the write-ups typically differ?

A, identical, since the final code is the same. B, senior-consistent, against the level below. C, both below the bar, since hints were given. D, the second rated higher for responsiveness.

[think]

The answer is B: senior-consistent, against the level below.

Notes are timestamped, and record who started each behaviour. The same correct actions, done only after prompts, describe someone who does the work when directed, which is close to the definition of the level below. Prompts to clarify or test are not core-idea hints, so neither candidate fails the bar on that basis.

## 2

At many large companies, what role does the coding round typically play in the level decision?

A, no effect on level; it is only pass or fail. B, it matters for level only for new graduates. C, a bar check that can still pull the level down. D, it alone decides level, and the other rounds confirm it.

[think]

The answer is C: a bar check that can still pull the level down.

Level is usually driven more by the system design and behavioural rounds, so coding is mostly a bar check. But a write-up like, hire at the level below, is a common reason a split senior decision resolves downward. Practical multi-part rounds often assess senior signals such as structure and extensibility directly.

## 3

The interviewer asks how to make the LRU cache thread-safe. Which answer is strongest?

A, no lock is needed, because dictionary operations are atomic. B, add one lock around get and put, and nothing more. C, use a concurrent hash map in place of the dictionary. D, one lock serialises even the gets, so stripe the cache if it is contended.

[think]

The answer is D: one lock serialises even the gets; stripe if contended.

Get reorders the list, so reads mutate shared state and need the lock. One lock serialises everything, and striping by key hash cuts contention, at the price of LRU order within each stripe rather than globally. A concurrent map leaves the linked-list races untouched, and single dictionary operations being atomic says nothing about the multi-step pointer updates.

## 4

Measured on CPython 3.14, an LRU cache built on OrderedDict ran at 101 nanoseconds per operation, against 133 for a hand-built map and list, with similar memory. What is the honest production argument for OrderedDict?

A, it is thread-safe, so no lock is ever required. B, far less code to get wrong, at similar speed. C, it is several times faster than the hand-built list. D, it uses a fraction of the memory per entry.

[think]

The answer is B: far less code to get wrong, at similar speed.

The measured gap is about 25 percent, and memory per entry was 137 bytes against 148, so the case is roughly forty fewer lines of pointer code, not speed or memory. OrderedDict is not a lock-free concurrent structure, so the thread-safety question remains. Calibrated claims like this separate production awareness from name-dropping.

## 5

Which of these is gold-plating that counts against you in a 45-minute LRU round?

A, a guard in put for a capacity of zero. B, a one-line comment stating the invariant. C, a pluggable eviction-policy interface. D, a helper that removes duplicated unlinks.

[think]

The answer is C: a pluggable eviction-policy interface.

Unrequested generality costs the minutes that testing and follow-ups need, and signals a habit of over-building. Naming the extension point in one sentence gets the credit without the cost. Helpers that remove duplication, invariant comments and boundary guards are signs of good judgement.

## 6

In an AI-assisted round, the assistant produces an LRU cache that passes the example. What is the senior move before you accept it?

A, test update-then-evict yourself, and be able to explain each part. B, ask the assistant whether its code is correct. C, accept it, since it already passes the example. D, rewrite it by hand to show you did not need it.

[think]

The answer is A: test update-then-evict, and explain each part.

Assisted rounds grade direction and verification: run your own chosen cases, such as updating an existing key and then forcing an eviction, and be able to justify every line you accept. Passing the example is the case least likely to catch the common bug, asking the assistant to grade itself verifies nothing, and a rewrite wastes the time the format gives you.

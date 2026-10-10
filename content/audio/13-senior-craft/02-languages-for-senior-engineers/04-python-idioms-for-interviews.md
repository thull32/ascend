---
lesson: python-idioms-for-interviews
source: 9748d8a6278588ae
fit: partial
desk:
  - "The cost table of the built-ins, with every measured timing"
  - "How the containers are built: list growth steps, the compact dict, deque blocks, the heap array"
  - "The comprehension and everyday-toolkit snippets"
  - "The top-k heap trace and the Dijkstra code with lazy deletion"
  - "The bisect trace and the counting and floor-lookup one-liners"
  - "The itertools snippets, and the traps block with its measured outputs"
  - "The choosing-a-structure and interview-idiom tables"
  - "Exercises: top k words, count values in ranges with bisect, longest login streaks"
---
## Introduction

Two candidates get the same question: return the k most frequent words, ties broken alphabetically. The first writes a dictionary-increment loop, builds a list of tuples, writes a comparator, sorts and slices. Eighteen lines, twelve minutes, and one off-by-one in the tie-break. The second writes three lines with Counter and a heap, then spends the nine minutes saved on the follow-up the interviewer actually cares about: what if the words arrive as a stream too large for memory?

Python is the densest mainstream interview language, but only if the standard library is in your fingers. The same density hides costs. Popping from the front of a list, checking membership in a list, and inserting into a sorted list all look constant-time, and all are linear. A senior interviewer will ask for the complexity of every line you wrote.

So: the cost model with measured numbers, how the containers are built, the modules that carry most solutions, and the traps that turn a correct idea into a failing run.

## The cost model

Start with the three hidden linear operations, because they are the ones that fail hidden tests.

First, popping from the front of a list. Draining 100 thousand items that way cost 2.1 microseconds a pop. A deque's pop-left cost 25 nanoseconds. Picture a BFS whose queue is a list: with a wide frontier, every pop shifts every remaining element, and the whole search goes quadratic.

Second, "x in list". At 100 thousand items, one probe took 251 microseconds. The same check against a set took 18 nanoseconds. Keep a set beside the list.

Third, insort, the sorted insert from bisect. The search is logarithmic, but the insert shifts. At 10 thousand items, an insert took 0.3 microseconds; at 200 thousand, 3.9. The shift is a fast memory move, which is why small lists look fine, but n inserts are quadratic.

The cheap ones are worth knowing too. Sorting a million random floats took 139 milliseconds, and 17 if they were already sorted, because Timsort is linear on sorted runs. Getting the top 10 of a million with nlargest took 5 milliseconds, against 136 for sorting everything and slicing.

Two constant factors complete the model. Speed: realistic interview loop bodies run roughly 5 to 10 million iterations a second. A grid BFS with a deque ran about 4.5 million nodes a second. So a quadratic algorithm at n of 10 thousand, which is 100 million iterations, takes tens of seconds, while n log n at a million is fine. Memory: every integer is a heap object, so a list of a million distinct integers measured 40 megabytes, against 4 for a Java int array. And built-ins written in C, like sum, sorted, join, Counter's loop, heapq and bisect, are the fast path. "Push the loop into C" is the first optimisation.

## How the containers are built

An integer is a 16-byte header plus its digits, 28 bytes for the number one, and integers grow instead of overflowing. The values from minus 5 to 256 are preallocated singletons, which matters later.

A list is an array of 8-byte pointers plus spare capacity, growing by about an eighth plus a constant. That keeps append amortised constant while wasting little memory. And it is why popping from the front must move every remaining pointer down one slot.

A dict, since 3.6, is a compact layout: a small sparse index array pointing into a dense array of hash, key and value entries, kept in insertion order. A lookup hashes the key, probes the index array, and compares the stored hash before calling the key's equality method. A dict of a million integer pairs measured 74 megabytes, about 74 bytes an entry. Insertion order became a language guarantee in 3.7, because the compact layout gave it for free.

A deque is a doubly linked list of blocks, each holding 64 pointers. Appends and pops at either end touch one block, so they are constant time, but indexing into the middle walks blocks.

And heapq is not a class at all. It is functions over a plain list that keep each parent no larger than its children. A push appends and sifts up, stopping early, so random pushes are cheap: 43 nanoseconds. A pop moves the last element to the root and sifts it all the way down: 179 nanoseconds.

## The modules that carry most solutions

Counter counts in one call, and two Counters compare equal for an anagram check in linear time. Reading a missing key returns zero without inserting it.

Here is the trap that costs frequency questions. Count the words in "the cat is the is dog" and ask for the two most common. "The" and "is" both appear twice. Which comes first, and is that what the question wants?

[pause]

Counter returned "the" first, then "is". Most common keys on the count alone, and ties come out in first-encountered order, not alphabetically. An alphabetical tie-break wants "is" first. The fix is an explicit key: negative count, then the word, with nsmallest or sorted. That silent mismatch passes the examples and fails the hidden tests.

defaultdict creates a missing value on first access, which makes grouping anagrams and building adjacency lists one-liners. Its gotcha is the reverse of Counter's: reading a missing key inserts it. Check a node with no edges while iterating over the graph, and Python raises "dictionary changed size during iteration". Use get for reads.

heapq is a min-heap. Python 3.14 made the max-heap functions public, but interview environments often run older versions, so negating keys stays the portable idiom; say which you are using. When you push tuples and two priorities tie, Python compares the next element, and if that is a dict, you get a type error, only on some inputs. Insert a counter between priority and payload. That also keeps equal priorities first in, first out.

The top-k pattern keeps a heap of size k whose root is the weakest survivor, so it is the only value a newcomer has to beat. Each element costs log k. Dijkstra uses the same module with lazy deletion: instead of decreasing a key, push a new entry and skip stale ones when they are popped.

bisect left returns the first index whose value is at least x; bisect right, the first whose value is greater. Everything follows from that. The count of a value is right minus left. The largest value at or below x is at bisect right minus one, and minus one means there is none. Since 3.10, bisect takes a key and works on a range, so binary search on the answer becomes one line over a monotone predicate.

From itertools: accumulate for prefix sums, with an initial zero to avoid an off-by-one; pairwise for consecutive differences; and groupby, which groups consecutive equal keys only, so sort first. And functools cache turns top-down dynamic programming into a decorator, with one hard limit: the recursion limit of 1,000 frames. A recursion 990 deep succeeded, and one 1,000 deep failed. Raising the limit risks crashing on the C stack, so convert to bottom-up iteration instead.

## Traps that cost interviews

Mutable default arguments. A function whose default accumulator is an empty list creates that list once, at definition time. Call it with 1, then with 2, and both calls return the same list holding 1 and 2. Default to None instead.

Multiplying a list of rows creates two references to one row, so setting one cell sets it in both rows. Build the grid with a comprehension, a fresh list per row.

Late binding. Build three lambdas in a loop that each return i, and calling them gives 2, 2, 2. Closures capture the variable, not its value. A default argument binds the value at creation.

Division. Minus 7 floor-divided by 2 is minus 4 in Python, because it floors, and minus 7 mod 2 is 1. C, Java, Go and JavaScript truncate.

And "is" for numbers. Only minus 5 to 256 are cached singletons, so an integer computed at run time above 256 is a new object, and "is" says false. Two equal literals in one script may share a constant and say true, which confuses people who test it. Always use double equals for numbers.

One trap runs the other way. Building a string with plus-equals in a loop should be quadratic, since strings are immutable, but CPython resizes the string in place when nothing else references it: 100 thousand appends took 1.5 milliseconds. Keep one extra reference alive in the loop, and the same loop took 481 milliseconds, because every append now copies. Other implementations do not promise the optimisation, so build a list, join it, and say why.

## Memory and the GIL

CPython frees most objects the instant their reference count reaches zero. Cycles never reach zero, so a separate cycle collector runs periodically to find unreachable groups.

The global interpreter lock means one thread executes Python bytecode at a time in the default build. Threads help with I/O, not with CPU-bound work; for that, use multiprocessing, native extensions, or the free-threaded build, which 3.13 introduced and 3.14 made officially supported but not the default.

## In the interview

A follow-up the lesson expects. What changes if this code runs on the free-threaded build?

[pause]

Threads can run bytecode in parallel, so CPU-bound thread pools can scale. But compound operations on shared lists and dicts still need locks, and single-thread speed is somewhat lower. The common wrong answer is "nothing, the GIL makes everything thread-safe", which was never true of compound operations.

And the one you will certainly get: what is the complexity of each line you wrote? Go line by line and name the hidden ones. Membership in a list is linear. Popping the front is linear. Sorted is n log n, but linear on sorted input. A heap pop is log n. Insort is linear. The wrong answer is "it's all constant, they're built-ins".

Be ready for "what changes in Java?" too: 32-bit overflow on sums and products, truncating division, and no built-in Counter.

## Recap

Five things to remember. Three built-ins look constant and are linear: popping the front of a list, membership in a list, and insort. Budget roughly 5 to 10 million loop bodies a second and about 40 bytes per integer. Counter's most common breaks ties by first appearance, so key on negative count and then the word. Push a counter into heap tuples so ties never reach the payload. And the classic traps are mutable defaults, late-binding lambdas, floor division, "is" above 256, recursion past 1,000 frames, and string building with a live alias.

At your desk: the cost table, the container internals, the top-k trace and Dijkstra code, the bisect trace, the traps block, the structure tables, and the three exercises.

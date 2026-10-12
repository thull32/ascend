---
lesson: python-idioms-for-interviews
source: 26c806afe0cfb44f
---
## 1

A breadth-first search over 200,000 nodes uses a Python list as its queue, popping from position zero. Draining 100,000 items that way measured 2.1 microseconds per pop, against 25 nanoseconds for a deque's pop left. What is the real cost, and the fix?

A, order V log V, because the list is re-sorted on each pop; use heapq. B, order E squared, because visited checks scan the list; use a set. C, order V plus E, because popping from the front is amortised constant time, like append. D, order V squared plus E, because each pop from the front shifts the rest; use a deque.

[think]

The answer is D: order V squared plus E, because each pop from the front shifts the rest; use a deque.

A Python list is a contiguous array of pointers, so removing the first element moves every remaining pointer; with a wide frontier, that is quadratic. A deque stores blocks of 64 pointers, and pops from either end in constant time. Only pops from the end of a list are cheap, and nothing re-sorts the list.

## 2

In Python, Counter over the words "the cat is the is dog", asked for its two most common, returned "the" with 2, then "is" with 2. The problem wants ties broken alphabetically. Why is it wrong, and what fixes it?

A, most common sorts ties in reverse alphabetical order. B, Counter hashes strings, so its order is random. C, ties keep first-seen order; sort by negative count, then by word. D, most common drops ties; call it with a larger k.

[think]

The answer is C: ties keep first-seen order; sort by negative count, then by word.

Most common ranks on the count alone, so equal counts come out in the order the words were first counted, which dictionary insertion order preserves. A key of negative count, then word, with heapq's n smallest or with sorted, gives count descending and word ascending. The order is deterministic, not random, and nothing is dropped.

## 3

You insert 200,000 random values into a Python list with bisect's insort. It measured 3.9 microseconds per insert, against 0.3 microseconds at 10,000 items. What explains the growth?

A, garbage collection runs more often as the list grows larger. B, bisect falls back to a linear scan once the list is large. C, the list re-sorts itself after each insert to stay ordered. D, the search is order log n, but each insert shifts order n pointers.

[think]

The answer is D: the search is order log n, but each insert shifts order n pointers.

Insort finds the position by binary search, then the list insert moves every later pointer one slot, so the cost per insert grows with n, and the total is quadratic. The shift is a fast memory move, which is why small lists look fine. The search stays logarithmic, and nothing re-sorts.

## 4

In one Python script, assigning 257 to a and 257 to b, then asking "a is b", prints True. But asking whether the integer parsed from the string "257" is 257 gives False. Why?

A, the is operator compares values for literals, and identities for computed integers. B, equal literals in one code object share a constant; integers above 256 made at run time are new objects. C, Python caches every integer below 1,000, but only for values created from literals. D, the int function always returns a copy, while assignment always shares the cached object.

[think]

The answer is B: equal literals in one code object share a constant, while integers above 256 made at run time are new objects.

The compiler stores one constant for equal literals in a code object, so both names refer to it. Only minus 5 to 256 are preallocated singletons; an integer computed at run time outside that range is a fresh object. The is operator always compares identity, which is why double equals is the only safe equality for numbers.

## 5

A Python string-building loop took 1.5 milliseconds for 100,000 appends. After a refactor that keeps a reference to the partial string on each iteration, it took 481 milliseconds. What happened?

A, the extra reference stops CPython resizing the string in place. B, strings over 64 kilobytes switch to a slower internal representation. C, the interpreter disabled its specialising bytecode for the loop. D, the refactor added a garbage collection pass on every iteration.

[think]

The answer is A: the extra reference stops CPython resizing the string in place.

CPython optimises plus-equals on a string by resizing it in place when nothing else refers to it. A second reference forces a full copy every time, which makes the loop quadratic. Joining a list of pieces does not depend on that implementation detail, which is why it is the idiom to use, and to name.

## 6

A memoised recursive dynamic programming solution, using functools cache, works for n of 500 and fails for n of 50,000. What is the most likely cause?

A, a recursion error, because the default limit is 1,000 frames. B, the cache evicts entries, so the recursion recomputes them. C, a race, because functools cache is not thread-safe under load. D, integer overflow, because the values exceed 64 bits at that size.

[think]

The answer is A: a recursion error, because the default limit is 1,000 frames.

Each recursive call is a Python frame, and the default limit is 1,000. Measured on Python 3.14, a recursion 990 deep worked and one 1,000 deep failed. Raising the limit risks crashing on the C stack, so convert to a bottom-up loop. A cache with no maximum size never evicts, and Python integers do not overflow.

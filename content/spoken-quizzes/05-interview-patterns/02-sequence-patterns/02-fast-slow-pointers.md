---
lesson: fast-slow-pointers
source: a86b878438d59a92
---
## 1

Both pointers are inside a cycle of length c, and fast is d steps behind slow, measured forward along the cycle. After how many more iterations do they meet?

A, exactly d iterations, one per step of gap. B, exactly c iterations, one full lap later. C, exactly c minus d iterations, the rest of a lap. D, it depends on where the cycle entry is.

[think]

The answer is A: exactly d iterations.

Each iteration, fast gains exactly one step on slow, so the forward gap from fast to slow shrinks from d to zero in d iterations, and a gap falling by one cannot skip zero. The entry position decides when they enter the cycle, not how fast the gap closes.

## 2

At the meeting point, slow has walked a plus b steps, where a is the tail's length and b is the distance past the cycle entry. Why do a pointer from the head and a pointer from the meeting point, both moving one step at a time, meet at the entry?

A, because slow has completed exactly one lap when they meet. B, because the meeting point is always the node before the entry. C, because a plus b is a multiple of c, the cycle length, so a equals some multiple of c minus b. D, because a always equals b when fast is twice as fast.

[think]

The answer is C: a plus b is a whole number of laps.

Fast walked twice a plus b, and the extra a plus b is whole laps. After a steps, the head pointer is on the entry. The other pointer started b past the entry and has also moved a steps, which is whole laps minus b, so it lands on the entry too. A equals b only in a special case, and slow may meet fast before or after completing a lap.

## 3

On the four-node list 1, 2, 3, 4, the usual guard, while fast and fast's next exist, leaves slow on node 3. Palindrome List needs slow on node 2 before splitting, with both pointers starting at the head. Which change does that?

A, check slow's next and fast's next before each move. B, keep the usual guard, with slow starting one node ahead. C, keep the usual guard, then advance slow once more. D, check fast's next and fast's next's next before each move.

[think]

The answer is D: check fast's next and fast's next's next.

With that guard the loop runs once, slow to 2 and fast to 3, then stops because two steps past 3 is null. That leaves slow on the first middle, so slow's next begins the second half. Starting slow ahead or advancing it afterwards lands on node 4, and checking slow's next and fast's next ends up dereferencing a null fast. Five-node lists give node 3 under both standard guards, which is why tracing an odd length hides the difference.

## 4

In Find the Duplicate Number, the array is read as a list where each index i points to the value stored at i, starting from index 0. Why is the cycle entry the duplicated value?

A, because index 0 lies inside the cycle and points to it. B, because phase one always meets exactly at the duplicate. C, because the entry has two incoming edges, from two different indices. D, because the entry holds the largest value in the array.

[think]

The answer is C: the entry has two incoming edges, from two indices.

Two indices pointing at the same next index means two positions store the same value, and the entry is the node reached both from the tail and from inside the cycle. Index 0 is never a target when the values run from 1 to n, so it is a head outside the cycle. The phase-one meeting point is generally somewhere else in the cycle.

## 5

You measure Floyd against a visited set on a cyclic list of a million nodes: first with the nodes allocated in list order, then with the same nodes linked in shuffled order. What does the lesson's measurement say dominates?

A, memory layout: each next pointer is a dependent load that misses the cache. B, the number of iterations, which rises in shuffled order. C, garbage collection, triggered by the shuffled allocation order. D, the hashing cost of the set, which grows with the shuffle.

[think]

The answer is A: memory layout, because each hop is a dependent load that misses the cache.

Both algorithms do the same iterations in either layout, yet Floyd slowed about ten times in CPython and fifty times in Node when the nodes were shuffled. Each hop depends on the previous load, and far-apart nodes miss the cache. Floyd still beat the set in both layouts, because it neither hashes nor allocates.

## 6

An interviewer asks for the node where two singly linked lists intersect, using constant extra space. Which approach fits?

A, fast and slow pointers on the first list, then on the second. B, a visited set of the first list's nodes, then a walk along the second. C, two pointers at the same speed, each of which switches to the other list's head when it reaches the end. D, linking the first list's tail to the second list, then running Floyd on the joined list.

[think]

The answer is C: two same-speed pointers that switch heads.

Switching heads makes both pointers travel the same total distance, so they arrive at the intersection together, or at the end together if there is none. Linking the tail and running Floyd also works, but it mutates the input, and you must undo it. The visited set uses linear space, and fast and slow pointers on one list answer a question about that list only.

---
review: arrays-strings
source: 73b5be5d468e4b03
---
## Introduction

Twelve questions from the arrays-strings module. Answer out loud before the answer comes.

They run through the module in order: dynamic arrays, strings, two-dimensional grids, prefix sums, and in-place techniques. Each has four options, A to D, then a few seconds for you to commit to one.

## Question 1

A dynamic array grows by adding a fixed 100 slots whenever it is full. What is the total cost of appending n elements, for large n?

A, order n log n, because the number of resizes grows logarithmically. B, order 100 n, because each resize copies at most 100 elements. C, order n squared, because n over 100 resizes each copy up to n elements. D, order n, because each append is still constant time amortised.

[think]

The answer is C: order n squared, because n over 100 resizes each copy up to n elements.

With additive growth there are about n over 100 resizes, and the k-th one copies about 100 times k elements, so the total is roughly n squared over 200. Geometric growth is what makes the number of resizes logarithmic and the total copying linear. And a resize copies every existing element, not only the 100 new slots.

## Question 2

A Go caller has a slice s of length 4 and passes the first two elements of it, as a sub-slice, to a function. The function appends one element and returns nothing. Afterwards the caller finds that s at index 2 has changed. Why?

A, the append exceeded capacity, so the new array replaced the caller's one too. B, the garbage collector moved the backing array while both slices pointed at it. C, slices are passed by reference, so append always mutates the caller's slice. D, the append had spare capacity, so it wrote into the shared backing array.

[think]

The answer is D: the append had spare capacity, so it wrote into the shared backing array.

A slice header is a pointer, a length and a capacity, and it is passed by value. If the capacity exceeds the length, append writes into the existing backing array, which the caller's slice also points at. When the capacity is exhausted, append allocates a new array that only the callee's copy of the header sees. That is why the bug is intermittent.

## Question 3

Inside a function, appending to a string with plus-equals in a loop runs in linear time on CPython 3.12. Which change makes the same loop quadratic?

A, keeping a second reference to the string alive across the iteration. B, storing the pieces as bytes objects rather than str objects. C, appending a piece that is longer than the accumulated string. D, running the loop more than 1,000 times, past the realloc threshold.

[think]

The answer is A: keeping a second reference to the string alive.

The in-place resize needs a reference count of exactly one after the stack's reference is dropped. An alias, a container holding the string, a cached hash, interning, or storing into a global instead of a local all fall back to allocate and copy. Piece length and iteration count do not change the path, and bytes objects are a different type with their own copy behaviour.

## Question 4

A 1,000-character ASCII string occupies 1,041 bytes in CPython 3.14. About how large is it after one emoji is appended?

A, 1,045 bytes, because only the emoji needs a 4-byte cell. B, 4,060 bytes, because every code point is now stored in 4 bytes. C, 1,057 bytes, because only the header grows to 56 bytes. D, 2,058 bytes, because the string switches to UTF-16 storage.

[think]

The answer is B: 4,060 bytes, because every code point is now stored in 4 bytes.

Python picks one width for the whole string from its widest character. An emoji outside the basic multilingual plane forces 4 bytes for all 1,001 code points, plus the 56-byte header and a terminator cell. An accented Latin letter would only have grown the header, to 1,057, and a character like the euro sign would have doubled the cells, to 2,058.

## Question 5

Two user records have names that print identically, but they fail to match on login. What is the most likely cause?

A, one was stored as UTF-8 and the other as UTF-16 before being decoded. B, the column's collation sorts by code point, which breaks equality checks. C, they use different normalisation forms, NFC and NFD, of an accented letter. D, one string is interned, so equality compares object identity instead.

[think]

The answer is C: they use different normalisation forms of an accented letter.

NFC and NFD encode the same visible text as different code point sequences: a single accented e, against a plain e followed by a combining accent. So equality and hashing differ. Normalise at the boundary before comparing. The storage encoding does not affect equality after decoding, and interning never changes what equality returns.

## Question 6

Summing a large row-major matrix with the column index in the outer loop and the row index in the inner loop is much slower than the reverse. Why?

A, the inner loop runs more iterations, so loop overhead dominates the total. B, each inner step jumps a whole row of elements, so each access hits a new cache line. C, strided access mispredicts the loop branch on almost every iteration. D, column sums need extra additions to combine each column's partial result.

[think]

The answer is B: each inner step jumps a whole row, so each access hits a new cache line.

The number of additions and iterations is identical either way. Row-major storage puts a row's elements side by side, so walking a row is sequential and prefetched, one new cache line per 16 integers. Walking a column is strided, and touches a new cache line, often a new page, per element. Measured on a 64 megabyte matrix: 3 milliseconds against 62.

## Question 7

A recursive flood fill passes on a 20 by 20 example and crashes on a 2,000 by 2,000 grid of open cells. What happened, and what is the fix?

A, the recursion went as deep as the number of cells; use an explicit stack or breadth-first search. B, the recursion revisited cells without a visited set; add one and it fits in the stack. C, the grid exceeded the cache, so the recursion timed out; tile the grid into blocks. D, the list of lists ran out of memory; switch to a flat array before recursing.

[think]

The answer is A: the recursion went as deep as the number of cells; use an explicit stack or breadth-first search.

On an open grid the search path can be as long as the number of cells, four million here, far past CPython's default limit of 1,000 frames and Node's stack of roughly ten thousand. A visited set is needed for correctness but does not bound the depth, and four million cells as a list of lists is only tens of megabytes. The iterative version keeps the same order with a stack on the heap.

## Question 8

Why can a prefix array not answer range maximum queries the way it answers range sums?

A, max is not associative, so prefix maxima cannot be combined. B, max has no inverse, so a prefix max cannot be subtracted away. C, range max needs the values sorted first, which loses their positions. D, max needs a comparison per element, which costs more than an addition.

[think]

The answer is B: max has no inverse, so a prefix max cannot be subtracted away.

Range sums work because subtraction undoes addition. Nothing removes the first part of the array's contribution from the maximum of a longer prefix, so the maximum of a prefix tells you nothing about the maximum of a later stretch of it. Max is associative, which is exactly why a sparse table or a segment tree can answer range maximum; a monotonic deque handles sliding windows.

## Question 9

A Java service stores a prefix array of request byte counts in an int array. Small ranges are correct, but week-long ranges come back negative. What happened?

A, integer division in the average step truncated toward negative infinity. B, the array was rebuilt concurrently and a reader saw a half-built prefix. C, the prefix array used the length-n convention and read index minus one. D, the running total passed the 32-bit limit and wrapped, so later prefixes are negative.

[think]

The answer is D: the running total passed the 32-bit limit and wrapped.

A prefix array holds sums, which grow without bound, so it needs a wider type than the values. A few gigabytes of traffic exceeds the signed 32-bit limit of about 2.1 billion, and Java wraps silently. Short ranges subtract two values that both wrapped by the same amount, which is why they still look right. Use long for the prefix cells.

## Question 10

In the Dutch national flag algorithm, after swapping a 2 at mid with the element at high, why is mid not advanced?

A, advancing would make the loop exceed linear time on inputs full of 2s. B, mid only advances on 1s, since 0s and 2s are always swapped. C, the element swapped in from high has not been examined yet. D, the swapped-in element is always a 1, which the next step skips.

[think]

The answer is C: the element swapped in from high has not been examined yet.

The region from mid to high is the unknown region. The swap brings an unexamined element, which may itself be a 0 or a 2, into position mid, and advancing would classify it without looking. Mid does advance on a 0, because the element swapped in from low is a known 1, or mid itself, so advancing is safe there.

## Question 11

Quicksort with a Lomuto partition is run on an array of one million identical values. What happens, and what fixes it?

A, it runs in n log n as usual, because equal keys never need to move. B, it loops forever, because the pointers never cross; add a strict comparison. C, it runs in order n squared, because every element lands on one side; use a three-way partition. D, it runs in order n squared because of the final pivot swap; use Hoare, which has no final swap.

[think]

The answer is C: it runs in order n squared, because every element lands on one side; use a three-way partition.

Every comparison says the element is not less than the pivot, so each partition splits n minus one against zero, and the recursion goes n deep. Hoare splits equal keys evenly, and a Dutch flag style three-way partition finishes an all-equal run in one pass, which is what production sorts like pdqsort do. Lomuto does terminate; it is slow, not stuck.

## Question 12

An interviewer asks you to reverse a Python string in place with constant extra space. What is the best response?

A, say it is impossible, since strings are immutable, and stop there. B, note that strings are immutable, then reverse a list copy with two pointers. C, use a reversed slice, since slicing reverses the string with constant extra space. D, reverse it recursively, swapping the first and last characters on each call.

[think]

The answer is B: note that strings are immutable, then reverse a list copy with two pointers.

The two-pointer technique is what is being tested. Stating the immutability constraint, and its consequence that a linear list buffer is unavoidable, shows you understand the runtime. A reversed slice allocates a new string and hides the algorithm, and recursion adds a linear stack on top of the copies.

## Recap

Three ideas kept returning. First, memory layout decides the constant: contiguous rows and arrays are prefetched, strided columns and pointer-boxed lists are not, and one emoji widens a whole Python string. Second, the cost of an operation is set by what it copies: additive growth, Java string concatenation and recursive slicing are all quadratic for the same reason. And third, in-place work rests on an invariant you can state, whether it is write never passing read, the unexamined region in the Dutch flag, or a prefix type wide enough to hold the sum.

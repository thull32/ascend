---
lesson: arrays-and-dynamic-arrays
source: b87b70bc9e68558c
---
## 1

A dynamic array grows by adding a fixed 100 slots whenever it is full. What is the total cost of appending n elements, for large n?

A, order n log n, because the number of resizes grows logarithmically. B, order 100 n, because each resize copies at most 100 elements. C, order n squared, because n over 100 resizes each copy up to n elements. D, order n, because each append is still constant time amortised.

[think]

The answer is C: order n squared, because n over 100 resizes each copy up to n elements.

With additive growth there are about n over 100 resizes, and the k-th one copies about 100 times k elements, so the total is roughly n squared over 200. Geometric growth is what makes the number of resizes logarithmic and the total copying linear. And a resize copies every existing element, not only the 100 new slots.

## 2

A CPython list has room for 8 elements and holds 8. You append a ninth. What does the list's resize set the new capacity to?

A, 18, since capacity doubles from 9 on every overflow. B, 24, since 9, plus 9 shifted right by 3, plus 6, is rounded up to a multiple of 8. C, 16, since 9, plus 9 shifted right by 3, plus 6, is 16, already a multiple of 4. D, 12, since 9 plus 3 is rounded up to the next multiple of 4.

[think]

The answer is C: 16, since 9, plus 9 shifted right by 3, plus 6, is 16, already a multiple of 4.

The rule is the new size, plus the new size shifted right by 3, plus 6, with the two low bits cleared: 9 plus 1 plus 6 is 16, and clearing the low bits leaves 16. Rounding goes down, not up, and the growth factor is about 1.125 for large lists, not 2. Measured on 3.14, the capacities run 4, 8, 16, 24, 32, 40, 52, 64.

## 3

Arrays and linked lists are both linear for a sequential scan. What is the strongest practical reason arrays outperform linked lists at it?

A, lists must be traversed recursively, which adds a stack frame per node. B, array indexing is constant time, while finding each next list node costs order n. C, contiguous elements share cache lines and get prefetched, while list nodes are scattered. D, arrays live on the stack, which is faster to read than the heap that holds the nodes.

[think]

The answer is C: contiguous elements share cache lines and get prefetched, while list nodes are scattered.

The asymptotic cost is identical; the constant factor is dominated by memory access. A 64-byte cache line holds 16 integers, and sequential access is prefetched, while each node dereference in a list is typically a cache miss of about 100 nanoseconds. Stepping to the next node is constant time, not order n, and a dynamic array lives on the heap, just as list nodes do.

## 4

In Python, why is iterating a list of a million integers much slower than iterating a NumPy 32-bit integer array of the same values?

A, the list stores pointers to boxed integer objects, while NumPy stores raw values contiguously. B, the list bounds-checks every access, while NumPy validates the whole range once up front. C, Python lists are linked lists internally, so each step follows a next pointer. D, lists grow by about 1.125 times, so their elements end up spread across several memory blocks.

[think]

The answer is A: the list stores pointers to boxed integer objects, while NumPy stores raw values contiguously.

A CPython list is a contiguous array of object pointers, and the integers live elsewhere on the heap, so each element costs a dereference and often a cache miss. NumPy stores unboxed values, so the scan is cache-friendly and can be vectorised. The list's pointer array itself is one block: a resize copies everything into a new block rather than fragmenting it.

## 5

In JavaScript, you create an empty array and then assign 1 to index 10. What has V8 most likely done?

A, switched it to dictionary mode, turning indexing into a hash lookup. B, thrown a range error, since index 10 is past the array's length. C, made it a holey array, whose accesses check for missing slots. D, allocated 11 packed integer slots, filling indexes 0 to 9 with zeros.

[think]

The answer is C: made it a holey array, whose accesses check for missing slots.

Writing past the end creates holes, since indexes 0 to 9 are missing. That moves the array to a holey elements kind permanently, so every access checks whether the slot exists. Dictionary mode happens only for very sparse arrays, such as writing index one million into an empty one. Building the array with push keeps it packed.

## 6

A Go caller has a slice s of length 4 and passes the first two elements of it, as a sub-slice, to a function. The function appends one element and returns nothing. Afterwards the caller finds that s at index 2 has changed. Why?

A, the append exceeded capacity, so the new array replaced the caller's one too. B, the garbage collector moved the backing array while both slices pointed at it. C, slices are passed by reference, so append always mutates the caller's slice. D, the append had spare capacity, so it wrote into the shared backing array.

[think]

The answer is D: the append had spare capacity, so it wrote into the shared backing array.

A slice header is a pointer, a length and a capacity, and it is passed by value. If the capacity exceeds the length, append writes into the existing backing array, which the caller's slice also points at. When the capacity is exhausted, append allocates a new array that only the callee's copy of the header sees. That is why the bug is intermittent.

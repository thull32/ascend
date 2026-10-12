---
lesson: space-complexity-and-memory-hierarchy
source: c8bf07c32b77eff7
---
## 1

A recursive function computes the depth of a binary tree with n nodes by recursing into both children. What is its auxiliary space complexity?

A, constant, because it allocates no data structures. B, log n always, since each call halves the tree. C, order of the height: log n if balanced, n if degenerate. D, order n, because there are n calls in total.

[think]

The answer is C: order of the height, log n if the tree is balanced and n if it is degenerate.

Only the frames on the current root-to-leaf path are live at once, so the stack holds at most one frame per level. The total number of calls is n, but they never coexist. "Constant" ignores the stack, and "log n always" assumes the tree is balanced, when a degenerate tree has height n.

## 2

Summing ten million integers took 2 milliseconds from an array, 7 from a linked list whose nodes were allocated one after another, and 890 from the same list after its nodes were scattered. What explains the gap between the two linked-list figures?

A, consecutive nodes let the prefetcher follow the chain, while scattered ones make every hop a main-memory miss. B, scattered nodes trigger a page fault on every access, costing microseconds each. C, scattered nodes are larger, because each carries an allocator header. D, the consecutive list is really an array, so the compiler vectorised the loop.

[think]

The answer is A: consecutive nodes let the prefetcher follow the chain, while scattered ones make every hop a main-memory miss.

Both lists do the same dependent loads. When the nodes are consecutive, the addresses advance predictably, and the prefetcher and shared cache lines hide most of the latency. When they are scattered, each hop waits about 100 nanoseconds for main memory, and nothing can overlap it. The node size is the same in both cases, the pages were resident, and a compiler cannot vectorise a pointer chase.

## 3

Which situation is a genuine reason to prefer a linked list over a dynamic array?

A, you want to minimise the memory used per element. B, you need fast iteration over all elements in order. C, you already hold the node, and need a constant-time move to the front. D, you frequently insert at the middle index of a long sequence.

[think]

The answer is C: you already hold the node, and need a constant-time move to the front.

With a reference to the node in hand, as in an LRU cache where a hash map hands you the node, unlinking and relinking are constant-time pointer operations, and no array can do that without shifting. Inserting at an index still needs a traversal first, which usually loses to the array's block memory move. Iteration and memory use both favour arrays.

## 4

A Python service stores 5 million small records as dicts and uses about 3 gigabytes. The record data itself would be about 200 megabytes as raw bytes. What best explains the gap?

A, 64-bit pointers double the size of every stored field. B, the garbage collector holds on to memory it has freed. C, per-object overhead: headers, boxing, and hash table slack. D, the Python runtime leaks memory in long-running services.

[think]

The answer is C: per-object overhead, meaning headers, boxing, and hash table slack.

Every value is a boxed object, and a small integer alone is 28 bytes. Every dict carries its own hash table with unused slots: a three-key dict measures 184 bytes before its values. Pointer width alone would at most double a field, not inflate the data 15 times. Typed arrays, classes with slots, or a columnar layout recover most of the gap, because this is a layout cost, not a leak.

## 5

A colleague speeds up a matrix routine 20 times by swapping the order of two nested loops. The complexity is unchanged. What happened?

A, the compiler removed one of the loops as dead code. B, the inner loop can now run in parallel across cores. C, the accesses now walk along rows, reusing each cache line. D, the new order performs fewer floating-point operations.

[think]

The answer is C: the accesses now walk along rows, reusing each cache line.

In row-major storage, neighbouring columns of a row sit next to each other in memory. Walking down a column touches a new cache line at every step; walking along a row uses each fetched line fully and lets the prefetcher keep up. Same operations, radically different memory traffic: on a 256 megabyte matrix, the measured difference was 23 times.

## 6

A recursive depth-first search over a user-supplied tree passes all its tests, then crashes in production on one input. Which fix addresses the cause, rather than moving it?

A, raise Python's recursion limit to 100 thousand, so deeper inputs succeed. B, replace the recursion with an explicit stack, so depth is bounded by the heap, not the call stack. C, run the search in a thread with a larger stack size. D, catch the recursion error and return a partial result.

[think]

The answer is B: replace the recursion with an explicit stack, so depth is bounded by the heap, not the call stack.

The crash is the call stack reaching its limit on a degenerate, path-shaped input, where the depth equals the tree's height. An explicit stack on the heap uses ordinary memory in proportion to the height, with no fixed ceiling. Raising the limit or the thread's stack size only moves the crash to a deeper input, and past a point the C stack overflows for real. Catching the error hides wrong results.

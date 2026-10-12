---
lesson: go-essentials
source: 3ecea25cc6e2670a
---
## 1

64 CPU-bound goroutines are running. A Go scheduler trace line shows GOMAXPROCS of 4, no idle Ps, 5 threads, a global run queue of 41, and local queues of 0, 0, 18 and 1. How many goroutines are waiting to run?

A, 64, because every goroutine is waiting on a P. B, 60: the 41 global, plus the 19 in local queues. C, 41, because only the global queue is counted. D, 19, because only the local queues hold work.

[think]

The answer is B: 60, the 41 global plus the 19 in local queues.

The run queue figure is the global queue, and the list is each P's local queue, so 41 plus 18 plus 1 makes 60 waiting, while 4 run on the 4 Ps: 64 in total. The fifth thread is a spare machine thread, not a fifth running goroutine.

## 2

On Go 1.27, with GOMAXPROCS set to one, one goroutine spins in an empty for loop, and main calls sleep for one millisecond. What happens?

A, main wakes after about 10 milliseconds, when the spinner is preempted. B, main never wakes, because the spinner never yields the only P. C, main wakes after 1 millisecond, because timers run on their own thread. D, the runtime detects the loop and kills the spinning goroutine.

[think]

The answer is A: main wakes after about 10 milliseconds, when the spinner is preempted.

Since Go 1.14, the system monitor asynchronously preempts a goroutine that has run for 10 milliseconds, so the sleeping goroutine gets the P back; it was measured waking after 11 milliseconds. Before 1.14, a loop with no function calls could starve it forever. Timers fire on a P, not on a separate thread, which is why the 1 millisecond sleep took 11.

## 3

With GOGC at 100, the garbage collector's trace shows the heap at 511 megabytes when the cycle started, 513 when it ended, 258 megabytes live, and a goal of 515. If the live heap stays the same, roughly what will the next goal be?

A, about 770 megabytes, three times the live heap. B, about 516 megabytes, twice the 258 that was live. C, about 258 megabytes, since only live data is kept. D, about 1,026 megabytes, twice the 513 at the end.

[think]

The answer is B: about 516 megabytes, twice the 258 that was live.

The pacer sets the goal to the live heap plus GOGC percent of it, plus stacks and globals, which are zero here. The third number is the live heap after marking. Doubling the heap at the end of the cycle confuses allocated with live, and three times live is the goal you would get with GOGC at 200.

## 4

A fan-out sends results on an unbuffered channel, and returns early when the context expires. After 1,000 calls, each with two slow backends, the goroutine count is 2,000 higher. Why?

A, each straggler blocks forever on a send nobody will receive. B, the runtime's deadlock detector is disabled inside a server. C, goroutines are pooled and reused, so the count never falls. D, the garbage collector has not yet run to reclaim the goroutines.

[think]

The answer is A: each straggler blocks forever on a send nobody will receive.

A goroutine blocked on a send is reachable from the channel's wait queue, and is never collected. Nothing will ever receive, so it lives until the process dies. Buffering the channel with one slot per sender left none behind. The deadlock detector only fires when every goroutine is blocked, and goroutines are not pooled.

## 5

On Go 1.27, a function makes a byte slice of variable length n, and the slice never leaves the function. How many heap allocations does it cost?

A, never any, because slices that do not escape live on the stack. B, always one, because any make with a variable size escapes. C, none when n is at most 32 bytes, one when it is larger. D, one per append, because the stack buffer cannot grow.

[think]

The answer is C: none when n is at most 32 bytes, one when it is larger.

Escape analysis says it does not escape, and recent compilers back small, non-escaping, variable-size makes with a 32 byte stack buffer, falling back to the heap at run time. Measured, it made no allocations for n of 32, and one for n of 33. The always-escapes rule is from older versions, and a large n cannot fit in a stack frame whose size is fixed at compile time.

## 6

In Go, a is a slice of ints with length 3 and capacity 4. b is a with 1 appended, and then c is a with 2 appended. What is element 3 of b?

A, 1, because each append copies a before writing. B, 0, because appends past the length are discarded. C, 2, because b and c share one backing array. D, it panics with index out of range.

[think]

The answer is C: 2, because b and c share one backing array.

Both appends fit in a's spare capacity, so they write the same slot of the same array, and the second overwrites the first. With a full slice, of capacity 3, the appends would reallocate and element 3 of b would be 1. So aliasing depends on a run-time number, which is why you should clone slices you did not allocate before appending to them.

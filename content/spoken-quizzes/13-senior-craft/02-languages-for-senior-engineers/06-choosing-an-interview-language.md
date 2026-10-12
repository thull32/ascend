---
lesson: choosing-an-interview-language
source: 8d6204bfec04957b
---
## 1

You have written Java daily for five years, but solved only a handful of problems in Python. Your onsite is in three weeks, and nothing mandates a language. What is the strongest choice?

A, whichever language the interviewer uses, so they can follow. B, Java, because fluency outweighs Python's brevity on this timeline. C, Python, because its shorter solutions leave more time for testing. D, Rust, because an unusual choice signals depth and stands out.

[think]

The answer is B: Java, because fluency outweighs Python's brevity on this timeline.

Brevity only pays when the idioms are automatic. Three weeks is not enough to make Python fluent, while the tree map, the priority queue and the array deque are already in your fingers. The interviewer's own language does not matter for general rounds, and an unfamiliar language adds risk rather than signal.

## 2

The same scheduler solution took about 150 milliseconds in Rust and 2.9 seconds in Python at a million items, but 8 milliseconds and 106 milliseconds at a hundred thousand. What should that imply for choosing an interview language?

A, neither result matters, since interviewers never run the code. B, at interview sizes both finish quickly, so fluency and line count matter more. C, Python is unusable, since a 2.9 second run fails any time limit. D, Rust is the right choice, since it is twenty times faster than Python.

[think]

The answer is B: at interview sizes both finish quickly, so fluency and line count matter more.

Interview inputs are usually sized so that a correct complexity passes in any mainstream language; at a hundred thousand, the slowest version took about a tenth of a second. Runtime matters when a platform uses one tight limit for every language, which is worth asking about, but the everyday cost is lines and pauses.

## 3

In the six-language benchmark, Go's solution ran about three times slower than Rust's, with the same algorithm. Which mechanism explains most of the gap?

A, Go cannot sort slices without first copying them into a new array. B, Go's garbage collector pauses the program for each heap operation. C, Go compiles without optimisation unless a release flag is passed. D, Go's container heap package takes values of any type, so each push boxes into an interface.

[think]

The answer is D: Go's heap package takes values of any type, so each push boxes into an interface.

Each push converts the item to an interface value, which allocates, and every comparison is an indirect call through the interface. Rust's binary heap stores pairs inline and compares with inlined code. Go's garbage collection pauses are under a millisecond, and Go optimises by default.

## 4

In JavaScript, you implement a breadth-first search with an array as the queue, calling shift to dequeue, on a grid of 1,000 by 1,000 cells. What is the risk?

A, none, because modern engines make shift constant time at every size. B, the array cannot hold a million elements, so pushes start to fail. C, shift is linear on large arrays, so draining the queue can go quadratic. D, breadth-first search needs a priority queue, so the visit order will be wrong.

[think]

The answer is C: shift is linear on large arrays, so draining the queue can go quadratic.

Measured in Node 24, shift cost 31 nanoseconds at 10,000 elements, but 2.1 microseconds at 100,000, and 4.8 microseconds at 200,000. So draining a large queue is quadratic. A head index into the array, or a ring buffer, keeps each dequeue constant time.

## 5

A Java candidate writes a heap comparator that subtracts the second array's first element from the first array's first element. Which input breaks it?

A, arrays with duplicate first elements, so the comparator returns zero. B, an empty heap, so the comparator runs on null references. C, the maximum integer compared with a negative number, so the subtraction overflows. D, more than 2 to the 16 elements, so the comparator's result is truncated.

[think]

The answer is C: the maximum integer compared with a negative number, so the subtraction overflows.

The maximum integer minus minus 5 overflows to a negative number, so the comparator reports the maximum as smaller; measured, peek returned 2,147,483,647 as the minimum. Integer compare avoids the arithmetic. Returning zero for equal keys is correct, and an empty heap never calls the comparator.

## 6

Your problem needs "the largest timestamp at most t", with inserts interleaved with queries, and you are using Python. What is the best response?

A, switch to Java mid-interview, to get the tree map's floor key. B, use heapq, whose smallest-first order answers floor queries directly. C, use a dictionary and scan every key on each query, since n is small. D, use bisect on a sorted list, and state that each insert costs order n.

[think]

The answer is D: use bisect on a sorted list, and state that each insert costs order n.

Python's standard library has no ordered map. Bisect with its linear insert named, plus a sentence that a balanced tree or the sorted containers library would make inserts logarithmic, shows you know the trade-off. A heap exposes only its minimum, so it cannot answer floor queries, and a silent linear scan hides the cost.

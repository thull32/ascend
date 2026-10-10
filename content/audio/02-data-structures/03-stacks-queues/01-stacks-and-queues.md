---
lesson: stacks-and-queues
source: ee7791e91795d391
fit: partial
desk:
  - "The drain-time table: Python pop at the front against deque, JavaScript shift against a head index"
  - "The ten-step ring buffer trace with head, count and tail, and the RingQueue code"
  - "The two-stack queue trace and its code"
  - "The table of what each language's queue is underneath, and the Go channel send path"
  - "The comparison and production failure tables"
  - "Exercises: a bounded ring-buffer queue, and a queue from two stacks"
---
## Introduction

A worker pulls jobs from the front of a list, and producers append to the back. In staging, with a hundred jobs, it runs fine. In production, with a backlog of two million, each pull takes milliseconds, and the worker falls further behind the harder it works. Nothing in the code looks quadratic. There is one "pop the first element" per job.

But removing the first element of an array shifts every remaining element one slot to the left. Draining two million jobs that way costs two million times two million, divided by two, element moves. That is 16 terabytes of memory traffic, for a queue.

Stacks and queues are trivial to specify and easy to build wrongly, because the natural array operations give you constant time at only one end. This is about getting constant time at both. Three ideas: why the naive array queue breaks and at what size, the ring buffer and its one famous ambiguity, and the queue made from two stacks, with the argument for why it is fast.

## Stacks: nothing to build

A stack is push, pop and peek, all at the same end. A dynamic array already gives you all three at its end in amortised constant time. Append is push, pop is pop, the last element is the top. There is nothing to build.

The only decision is what happens when you pop an empty stack. Python raises an error, JavaScript returns undefined, Rust returns None. In interview code, check for empty before you pop and decide explicitly, because pop-on-empty is the boundary case in every bracket-matching and expression problem.

You could build a stack as a linked list, pushing and popping at the head. Every operation is constant time with no resize pause, but you pay a pointer per element and a cache miss per access: roughly 100 nanoseconds from main memory, against about 1 nanosecond for the next slot of an array already in cache. A linked stack is right only when elements must not move, or when you cannot tolerate the occasional resize. Interpreters keep their value stacks contiguous for exactly the cache reason.

## Queues on arrays, measured

A queue adds at the back and removes from the front. Adding at the back of an array is cheap. Removing from the front is the problem: every remaining element moves.

The lesson measured it. Draining a queue of 100 thousand elements with Python's pop at the front took 212 milliseconds. With a deque, 1.3 milliseconds. At a million elements, the list version extrapolates to about 20 seconds.

JavaScript's shift is the real trap. At 10 thousand elements it looks fine, because V8 has a fast path that moves the array's start pointer instead of copying. But V8 refuses that fast path for large arrays, and the cliff sits near 16 thousand eight-byte slots. One shift costs about 40 nanoseconds at 15 thousand elements, and about 500 at 16 thousand. Draining a million elements with shift took about 29 seconds. With a simple head index, 2.3 milliseconds. A benchmark at ten thousand says constant time; production at a million takes half a minute. Treat shift and pop-at-the-front as linear.

There are two constant-time fixes on a plain array. The first is a head index: keep the position of the front, read from it and move it forward, without touching the array. The front is never reclaimed, so you compact now and then, copying the live part to a new array when the head passes half the length. That is correct, has no wrap-around arithmetic to get wrong, and is a fine interview answer. The second fix is what every production queue does: a ring buffer.

## The ring buffer

Picture a fixed array of slots bent into a circle, with two markers on it. Head is the next slot to read. Tail is the next slot to write. Both move forward by one, modulo the capacity, so when they reach the end they wrap back to slot zero and reuse the space earlier dequeues freed.

Here is the smallest example that shows the wrap. Capacity four. Enqueue 1, 2 and 3: they land in slots zero, one and two. Dequeue twice, and you get 1, then 2; head is now at slot two. Now enqueue 4, 5 and 6. Four goes into slot three, the last slot. Five wraps around into slot zero, and six goes into slot one.

Physically, the array now reads 5, 6, 3, 4. Logically, the queue is 3, 4, 5, 6, starting from head. Elements always come out in arrival order, even though they sit scrambled in memory.

Now look at the two markers in that full buffer. Head is at slot two. Tail has wrapped all the way round, and is also at slot two. Before I tell you the problem: what other state of the buffer has head equal to tail?

[pause]

The empty one. With only head and tail, "empty" and "full" are the same state. That is the classic ring buffer bug, and the lesson gives three standard resolutions.

Keep a count: empty when it is zero, full when it equals the capacity. Simplest; one extra integer. In fact you can store only head and count and derive tail from them, so the fields can never disagree.

Or leave one slot unused, so full means the slot after tail is head. That costs one slot, and it is what you use when the producer and the consumer are different threads, because each side then writes only its own index and nothing shared needs synchronising.

Or let both indices grow forever and take them modulo the capacity on access; tail minus head is the count. With a power-of-two capacity, that modulo becomes a single bit-mask instead of an integer division that costs tens of cycles, which is why so many ring buffers have power-of-two sizes.

One more detail for garbage-collected languages: clear the slot when you dequeue. A ring of 1,024 slots that never clears keeps up to 1,023 dead objects reachable.

## Growing a ring, and why bounded is a feature

If a bounded ring is not acceptable, grow it when full: allocate double the capacity and copy the elements in logical order, starting from head and following the wrap, into the new array from slot zero. Then reset head to zero.

The bug is copying the raw slots. Take the full buffer from before, physically 5, 6, 3, 4 with head at two, and copy it straight into an array of eight. The next dequeues return 3, then 4, then an empty slot, then 5. A gap in the middle of the ring. This bug passes every test that never wraps, so test growth from a wrapped state.

Growth is amortised constant time by the same doubling argument as dynamic arrays. But in systems code, a bounded ring is a feature, not a limitation. A fixed-size queue between a producer and a consumer is the simplest form of backpressure. When it is full, the producer must block, drop, or shed load, and each of those is a deliberate policy rather than an out-of-memory crash an hour later. Kernel network buffers, audio pipelines, the LMAX Disruptor and Go's buffered channels are all bounded rings.

A Go buffered channel is exactly this ring, with a lock and two wait lists around it. When the buffer is full, the sending goroutine parks. A full channel blocks the producer instead of growing. That parking is the backpressure.

And rings win on cache. A 1,024-slot ring of eight-byte references is 8 kilobytes, which fits in the fastest cache on any current core, and the producer and consumer walk it in order, so the hardware prefetcher stays ahead of them. A linked queue touches a new allocation per element. The Disruptor added one more idea: keep the producer's counter and the consumer's counter on separate cache lines, so the two cores do not keep invalidating each other's line. That is false sharing. Its paper reports about 26 million operations a second against about 5.3 million for Java's blocking array queue, with the padding as one ingredient alongside preallocation and no locks.

## A queue from two stacks

A classic interview question, with a real lesson about amortisation. Keep two stacks, an inbox and an outbox. Enqueue pushes onto the inbox. Dequeue pops from the outbox, but if the outbox is empty, it first moves every element from the inbox to the outbox, popping from one and pushing onto the other. That reversal puts them in first-in, first-out order.

Say it aloud. Enqueue 1, 2 and 3; they sit in the inbox with 3 on top. Dequeue: the outbox is empty, so move all three. Now the outbox has 1 on top, and you return it. Enqueue 4: it goes into the inbox and waits. The next two dequeues return 2 and 3 straight from the outbox, no moves at all. Only when the outbox runs dry does 4 get moved across.

That first dequeue cost three moves; the next two cost none. Here is the argument. Each element is pushed onto the inbox once, moved to the outbox once, and popped from the outbox once. Three constant-time operations over its lifetime. So n operations cost at most 3n, and the amortised cost per operation is constant.

The trap is when you transfer. Transfer only when the outbox is empty. If you transfer while it still holds elements, you would have to move them back to keep order, elements bounce on every call, and each operation becomes linear. Interleaving enqueues and dequeues is fine; transferring early is not.

## What your language's queue really is

Python's deque is a doubly linked list of blocks, each holding 64 slots. Both ends are constant time. But indexing into the middle walks block links, about one per 64 elements, so it is linear. C++'s deque keeps an array of chunk pointers instead, and indexes in constant time. Java's ArrayDeque and Rust's VecDeque are growable ring buffers. ArrayDeque rejects null, because null marks an empty slot, and it is the recommended stack and queue in Java; the old Stack class and LinkedList are both slower. JavaScript has no queue at all: write a head-index queue or a ring.

## FIFO is a policy

The queue discipline has production consequences. Under overload, a plain first-in, first-out request queue serves the oldest requests first, and by the time they are served, the client has often timed out and retried. The server spends its capacity on responses nobody will read.

Facebook's "Fail at Scale" describes two fixes used together. Adaptive LIFO: serve in arrival order normally, but switch to newest-first once a queue forms, since the newest request is the one most likely to still have a waiting client. And a variant of CoDel for timeouts: if the queue has not been empty at any point in the last 100 milliseconds, a request may wait at most 5 milliseconds before being dropped; otherwise it may wait 100. So when you design a queue, decide what happens when it is full, what happens to items that have waited too long, and whether newest-first would serve users better when you are behind.

## In the interview

A follow-up the lesson expects. Your job worker's latency grows linearly with the backlog. What do you check first?

[pause]

The dequeue operation's complexity: is it a pop at the front, or a shift, on an array? Then whether the queue is unbounded. Then whether the work per job depends on queue depth, such as a scan for duplicates. The common wrong answer is adding workers, which multiplies the quadratic work.

And another: make the ring buffer safe for one producer thread and one consumer thread without a lock. Each side owns one index. The producer writes the slot, then publishes tail; the consumer checks that head is not tail, reads the slot, then publishes head. Leave one slot unused so full and empty differ. The wrong answer is a shared count that both sides increment, which is a race.

## Recap

Four things to remember. Removing from the front of an array is linear, so a queue built on it is quadratic, and JavaScript's shift hides this until about 16 thousand elements. A ring buffer is an array plus head and tail that wrap; head equal to tail means both empty and full, so keep a count, leave a slot unused, or use unbounded indices, and grow by copying in logical order. The two-stack queue is amortised constant time because each element is pushed, moved and popped once, provided you transfer only when the outbox is empty. And a bounded queue is backpressure, a policy you choose, not a limit you suffer.

At your desk: the drain-time table, the ring buffer and two-stack traces with their code, the table of what each language's queue is underneath, and the two exercises.

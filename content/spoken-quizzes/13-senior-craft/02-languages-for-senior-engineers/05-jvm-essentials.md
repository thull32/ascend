---
lesson: jvm-essentials
source: b934bf9cd44cb6cb
---
## 1

A hot Java method ran at 3.7 microseconds per call after warm-up. A new implementation of an interface it calls is loaded, and the next call takes 441 microseconds. What happened?

A, C2's single-receiver assumption broke, so the code was deoptimised. B, a full garbage collection ran to unload the classes no longer used. C, the code cache filled up, so the JIT stopped compiling for a while. D, the new class was compiled by C2 before the method could continue.

[think]

The answer is A: C2's single-receiver assumption broke, so the code was deoptimised.

C2 had inlined the only receiver it had seen. Loading a second class invalidated that code, marking it "not entrant", so execution fell back to the interpreter until the method was recompiled for two receivers, at about 4.6 microseconds. Class loading does not trigger a full collection, and compilation happens in the background rather than blocking the call.

## 2

With a 1 gigabyte G1 heap and 1 megabyte regions, only 511 byte arrays of exactly one mebibyte fit before an out-of-memory error, but 1,022 arrays of one million bytes fit. Why?

A, G1 compresses arrays below one megabyte, doubling their capacity. B, the larger arrays trigger the default 200 millisecond pause goal sooner. C, each one-mebibyte array plus its header needs two humongous regions. D, arrays larger than one mebibyte are stored twice, for concurrent copying.

[think]

The answer is C: each one-mebibyte array plus its header needs two humongous regions.

Objects of half a region or more are humongous, and get whole contiguous regions. A one-mebibyte payload plus the 16 byte header is slightly more than one region, so each array takes two, and wastes almost half. Nothing is compressed or stored twice. Raising the region size, or allocating slightly smaller buffers, fixes it.

## 3

Generational ZGC kept every pause under 0.02 milliseconds. Yet with a 512 megabyte live set in a 700 megabyte heap, the log showed 33 allocation stalls. What does that mean?

A, ZGC fell back to a stop-the-world full collection on every stall. B, application threads waited, because reclamation fell behind allocation. C, the heap is fragmented, because ZGC does not compact the old generation. D, the stalls are collector pauses that ZGC does not report as pauses.

[think]

The answer is B: application threads waited, because reclamation fell behind allocation.

ZGC's pauses are tiny because marking and relocation are concurrent. But if the application allocates faster than the collector frees memory, the allocating thread must wait. The fix is headroom or less allocation, not a different pause setting. ZGC relocates, and so compacts, concurrently, and it did not fall back to full collections here.

## 4

A Java worker loops on a plain boolean field that another thread sets to false. Measured, it was still spinning three seconds later, but it stopped at once with the JIT disabled. What explains the difference?

A, the write stays in the other thread's cache until that thread terminates. B, compiled loops run too fast for the operating system to deliver the update. C, the interpreter flushes CPU caches on every bytecode, which compiled code skips. D, the JIT hoisted the read out of the loop, and no happens-before edge forbade it.

[think]

The answer is D: the JIT hoisted the read out of the loop, and no happens-before edge forbade it.

Without volatile, a lock, or another happens-before edge, C2 may read the field once and keep it in a register, so the loop never sees the write. The interpreter happens to re-read the field on each iteration. Hardware cache coherence would deliver the write; the problem is that the compiled code never loads it again. Declaring the field volatile fixed it.

## 5

A Java thread pool has a core size of 2, a maximum of 4, and a bounded array queue holding 2. Seven long tasks arrive at once. How does it respond?

A, four threads at once, two queued, then one rejection. B, four threads, three queued, since the maximum is reached first. C, two threads, two queued, two more threads, then one rejection. D, two threads, then five tasks queued, with no rejection.

[think]

The answer is C: two threads, two queued, two more threads, then one rejection.

The pool starts threads up to the core size, then queues, and only starts threads beyond the core when the queue refuses a task. At the maximum, with a full queue, it rejects. The JDK reported exactly this sequence. With an unbounded queue, the pool would never grow past two threads, which is the fixed-pool trap.

## 6

On JDK 21, 64 virtual threads each sleep 100 milliseconds inside a synchronized block, with 4 carrier threads. It took 1,615 milliseconds; with a reentrant lock instead, 101 milliseconds. Why?

A, synchronized uses a slower lock that adds 25 milliseconds to each acquisition. B, blocking inside synchronized pins the carrier, so only 4 run at once. C, the reentrant lock creates new carriers on demand, up to one per thread. D, virtual threads cannot sleep, so each call falls back to a platform thread.

[think]

The answer is B: blocking inside synchronized pins the carrier, so only 4 run at once.

On JDK 21, a virtual thread that blocks while holding a monitor cannot unmount, so it occupies its carrier, and the 64 sleeps run 4 at a time: 16 rounds of 100 milliseconds. With a reentrant lock, the sleeping threads unmount and all 64 overlap. JDK 24 removed this pinning for synchronized, and the carrier pool does not grow per thread.

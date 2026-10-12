---
lesson: atomics-and-lock-free
source: 937e8fe27e21d674
---
## 1

Sixteen threads increment one shared atomic counter with fetch-and-add. The measured total throughput is lower than with one thread. Why?

A, each increment needs the cache line exclusively, so the cores take turns. B, sequentially consistent ordering on the atomic forces a trip to main memory. C, fetch-and-add is implemented with a hidden mutex on x86 hardware. D, the compiler turns fetch-and-add into a retrying compare-and-swap loop under load.

[think]

The answer is A: each increment needs the cache line exclusively, so the cores take turns.

An atomic read-modify-write holds the cache line in the modified state, so every increment on another core first transfers the line. The cores pass it around single file, and each handoff costs tens of nanoseconds. Fetch-and-add is one locked instruction, not a mutex or a loop, and no ordering bypasses the cache. Padded per-thread counters removed the sharing and scaled 25 times higher.

## 2

A producer writes 42 into a data variable, then sets a ready flag to true, both with relaxed ordering. A consumer loads the flag with relaxed ordering and, if it is true, reads the data. What can the consumer see?

A, 42 or zero on x86, but always 42 on ARM. B, 42 or zero, on ARM or after compiler reordering. C, always 42, because each store is atomic. D, 42, or a torn mix of the old and new bytes.

[think]

The answer is B: 42 or zero, on ARM or after compiler reordering.

Relaxed gives atomicity, so no torn values, but no ordering between the two variables. The flag can become visible before the data on weakly ordered hardware such as ARM, or when the compiler reorders. On x86, relaxed and release stores compile to the same instruction, so it passes there by accident. A release store paired with an acquire load guarantees 42.

## 3

Thread 1 sets x to 1, then reads y. Thread 2 sets y to 1, then reads x. Both variables start at 0, with plain stores and loads on x86. How often did both threads read 0 in the lesson's run?

A, only after compiler reordering, never from the hardware. B, in most runs, until the stores were made sequentially consistent. C, only when both threads shared one physical core. D, never, because x86 stores are sequentially consistent.

[think]

The answer is B: in most runs, until the stores were made sequentially consistent.

x86 lets a later load pass an earlier store to a different address, because the store waits in the store buffer. With the threads released together, 95 percent of 2 million runs read 0 in both. Making the stores sequentially consistent, a locked exchange that drains the store buffer, brought it to zero. The threads ran on different cores.

## 4

In a Treiber stack, thread 1 reads the head, A, and its next node, B, then stalls. Meanwhile A and B are popped, B is freed, and A is pushed back. Thread 1's compare-and-swap, from A to B, succeeds. What went wrong, and what fixes it?

A, false sharing; pad the head onto its own cache line. B, the ABA problem; add a version tag, or defer reclamation. C, a data race; wrap the compare-and-swap in a mutex. D, starvation; replace the compare-and-swap with a fair lock.

[think]

The answer is B: the ABA problem, fixed by a version tag or deferred reclamation.

The compare-and-swap compared only the address, which matched although the structure had changed. A version counter changes on every update, so a recycled address no longer matches, and hazard pointers or epochs prevent A from being reused while thread 1 holds it. Every access is atomic, so it is not a data race, and padding does not change what the compare-and-swap compares.

## 5

A service uses epoch-based reclamation for a lock-free map, and its memory grows steadily while one worker thread is blocked on a slow downstream call. What is the likely cause?

A, the hazard pointer scan threshold is set too low for this workload. B, blocked threads double every node's reference count while they wait. C, the blocked thread is still pinned, so the global epoch cannot advance. D, epoch reclamation frees nodes only when the whole process is idle.

[think]

The answer is C: the blocked thread is still pinned, so the global epoch cannot advance.

Garbage retired in one epoch is freed only after the global epoch has moved on twice, and the epoch advances only when every pinned thread has observed the current one. A thread blocked while pinned freezes the epoch, so every retired node accumulates. Hazard pointers keep memory bounded in this situation, at the cost of a fence per protected load. Epochs use no reference counts.

## 6

Which statement about a lock-free counter built on a compare-and-swap loop is true?

A, some thread always makes progress, but one thread may retry forever. B, every thread finishes an increment in a bounded number of steps. C, it is correct on x86, but can lose updates on ARM hardware. D, it is always faster than a mutex, whatever the contention.

[think]

The answer is A: some thread always progresses, but one may retry forever.

A failed compare-and-swap means another thread's succeeded, so the system as a whole progresses, which is lock-free. But an unlucky thread can lose again and again, so it is not wait-free. Speed depends on contention: measured here, the loop at 16 threads was 8 times slower than fetch-and-add. Correctness does not depend on the architecture, because the compare-and-swap itself is atomic everywhere.

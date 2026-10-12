---
lesson: what-to-still-do-by-hand
source: d8680ffe1f6af5e7
---
## 1

What does the verification paradox imply for an engineer who delegates most coding to agents?

A, you can only reliably verify work you could have produced, so keep those skills. B, tests make understanding unnecessary, so invest in test coverage instead. C, verification can be delegated to a second agent, which catches the first one's errors. D, reviewing is always easier than writing, so review skill is the one to keep.

[think]

The answer is A: you can only reliably verify work you could have produced, so keep those skills.

Plausible but wrong code only looks wrong to someone who knows what right looks like, so the production skills must be maintained, even if you rarely use them to produce. A second agent often shares the same blind spots, reviewing subtle code is often harder than writing it, and tests only check what someone thought to test.

## 2

The agent's quota tests pass reliably, yet production allows 11 exports for a limit of 10. Why did the tests not catch it?

A, Python dictionaries are not thread-safe for reads, so the count was read wrongly. B, the tests are single-threaded, so nothing interleaves between the read and the write. C, the tests used a limit of 10, and the off-by-one only shows at a limit of 11. D, the limit was misconfigured in production, so the tests checked a different value.

[think]

The answer is B: the tests are single-threaded, so nothing interleaves between the read and the write.

Check-then-act on shared state is only wrong when another request interleaves between the read and the write. A single-threaded test never interleaves, so it passes forever. Reasoning about interleavings, or a test that scripts the interleaving through a seam, is required.

## 3

CPython has a global interpreter lock. Why does a single line that sets a dictionary entry to its current value plus one still race between two threads?

A, the lock makes single bytecodes atomic, and the read, add and store are separate bytecodes. B, the lock is released whenever a dictionary is modified, so writes always interleave. C, the lock only applies to the main thread, so worker threads run without it. D, the lock only protects built-in types written in C, and the dictionary is implemented in Python.

[think]

The answer is A: the lock makes single bytecodes atomic, and the read, add and store are separate bytecodes.

The statement compiles to a read, which is a call to get, an addition, and a store, as separate bytecode instructions. The interpreter can switch threads between any two of them: by default after a 5 millisecond holding interval, or immediately at any blocking call. The dictionary itself stays consistent; the invariant across the three steps does not. The lock applies to every thread, and the dictionary is implemented in C.

## 4

The quota count lives in Redis, and the code gets the count, compares it, then sets it. What is the correct fix?

A, make the read, check and write one atomic operation in the store. B, cache the count locally in each process, so fewer round trips can race. C, add a short sleep between the get and the set, so concurrent requests settle. D, retry the set when it fails, so a lost write is always reapplied.

[think]

The answer is A: make the read, check and write one atomic operation in the store.

The bug is that read, check and write are separate steps, and with an await between them, the window is a whole network round trip. Only an atomic operation, such as an increment and compare, a server-side script, or a conditional update performed by the store itself, or a lock spanning all three steps, removes the window. The set does not fail, so retries do nothing; sleeps change timing, and local caches add more copies of the state to disagree.

## 5

You want a regression test that proves the lost update is fixed, not a stress test that might pass by luck. What is the right design?

A, mock the dictionary so that get always returns the limit minus one. B, add a seam at the vulnerable point, and script the exact interleaving with events. C, run the two requests in separate processes, so the operating system schedules them. D, run the stress test 10,000 times in CI, and fail if any run over-consumes.

[think]

The answer is B: add a seam at the vulnerable point, and script the exact interleaving with events.

A seam, such as a pause hook or a controllable await, lets the test force the schedule that exposes the bug, deterministically, and the same test proves the fix, because the forced schedule can no longer over-consume. Repeated stress runs make the race less likely to slip through, but never prove it is absent. Mocking the read removes the interleaving that matters, and separate processes give control to the scheduler rather than the test.

## 6

Which heuristic best decides whether to delegate a task, or do it yourself?

A, delegate whatever the AI reports it can complete with high confidence. B, never delegate production code; use agents only for tests and scripts. C, ask: if the AI got this wrong, would I be able to tell? If not, do it myself. D, delegate anything that would take you more than ten minutes to write by hand.

[think]

The answer is C: if the AI got this wrong, would I be able to tell? If not, do it myself.

Safe delegation depends on your ability to verify. If you could not tell, do it yourself, or first learn enough that you could. Time-based rules ignore risk, blanket bans throw away real gains, and the tool's confidence is not a measure of its correctness.

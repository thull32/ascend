---
lesson: what-to-still-do-by-hand
source: 5e5ace4506879a04
fit: great
desk:
  - "The skills table: why each matters more with AI, its decay symptom and its maintenance rep"
  - "The two-thread trace table and the race-condition visualisation"
  - "The bytecode listing of the quota function"
  - "The reproduction script: scripted interleaving and stress test, run it yourself"
  - "The three fixes: the lock, the conditional update and Redis increment"
  - "The eight self-audit questions, answered on paper"
---
## Introduction

If an agent writes most of the code, which of your skills justify a senior salary? Not typing. The ones that let you check the agent's work, decide what it should be doing, and take over when it gets stuck. Those are exactly the skills that decay fastest when the agent does everything, because they are built and maintained by the work you are now delegating.

So this is about choosing, deliberately, what to keep doing yourself. Not out of nostalgia, and not everything. The goal is to delegate as much as possible while keeping the abilities that make delegation safe.

At the centre is one bug: a check-then-act race in a quota, which an agent writes fluently, tests green, and ships. You will trace it, see why Python's interpreter lock does not save you, reproduce it on purpose, and fix it in three different stores. Finding it takes one question that no test suite asks for you.

## The verification paradox

Here is the idea the whole lesson rests on. You can reliably verify work only at roughly the level at which you could have produced it. A reviewer who could not write a correct pagination query will approve the wrong one, because the wrong one looks fine. A reviewer who has never debugged a race will not see one in a clean-looking diff. Generation became cheap; verification did not, and it draws on exactly the skills that producing the work used to exercise.

Reviewing is also often harder than writing. The author of a line knows why it is there; the reviewer reconstructs that from the outside. When the author is a model, there is nobody to ask who actually knows, only a model that will produce a plausible explanation on demand, from the same process that produced the bug.

The evidence: in METR's randomised trial from July 2025, experienced maintainers working in repositories they knew well were about 19 percent slower with AI tools, while estimating afterwards that they had been roughly 20 percent faster. The authors warn against generalising, and a February 2026 follow-up with later tools estimated a speed-up instead, while calling its own data unreliable. But the gap between felt and measured speed is the point. Your sense of how well the tool is going is not a measurement.

The decline is gradual, which is what makes it dangerous. Each skipped exercise is harmless. After a year of skipping them, you are a relay between a ticket and a model, and you cannot tell when the model is wrong. Nobody notices until an incident, or an interview without an assistant.

## The skills everything else depends on

The lesson lists ten skills that matter more with AI, not less. Reading and tracing code precisely, because it is the core of verification. Complexity and estimation, because fluent code hides a quadratic loop and generated estimates slip units. Debugging from first principles, because when the agent loops, someone has to form hypotheses. Concurrency reasoning, because those bugs are non-local and tests pass by luck. Data modelling and interface design, the hardest decisions to reverse, where models propose the average schema. Security reasoning, because models produce common patterns and attacks target uncommon ones. Writing, because the spec is now your main output. Git and shell fluency, the undo button for agent mistakes. Unassisted problem solving, because solo rounds still exist. And judgement about what to build, because the model builds whatever you ask, including the wrong thing.

Each has a decay symptom you can notice in yourself. You approve diffs you could not explain. You learn about complexity from production latency. You re-prompt instead of reading the stack trace. You approve a 300-line agent diff in four minutes and cannot describe what it changed. And each has a small maintenance rep, which comes at the end.

## A race the tests cannot catch

You ask an agent for a per-user export quota: at most 10 exports per user per day. It writes clean code. Read the user's count. If it is at or over the limit, refuse. Otherwise, store the count plus one, and allow. Its test: consume 10 times, all allowed; the eleventh is refused. It passes every time, and it will keep passing, because it runs on one thread and nothing can happen between the read and the write.

In production, requests run on a pool of worker threads. Picture two threads, A and B, and the shared count. The user has used 9 exports and fires two requests at once. Thread A reads 9. Is 9 at the limit? No, so it passes the check. Then the scheduler switches. Thread B reads 9, passes the check, writes 10, and its export runs. Thread A resumes and writes 9 plus 1, which is 10, and its export runs too.

[pause]

Both exports ran. The quota allowed 11, and the stored count says 10, so nothing downstream can even tell. A's write was computed from a value that stopped being true the moment B wrote. This is the lost update, the same anomaly as two database transactions that both read a balance and both write balance minus withdrawal.

Now a common belief: CPython has a global interpreter lock, so Python code cannot race. The lock makes each bytecode instruction atomic. It does nothing for a sequence of them. Disassemble the function and about a dozen instructions separate the call that reads from the store that writes. The interpreter can hand the lock to another thread after a 5-millisecond switch interval, and any blocking call, a socket read, a database query, a sleep, releases it immediately.

So in pure Python, the window is small, and a switch lands in it only occasionally: the bug appears once in thousands of concurrent pairs. That is worse than always, because it passes load tests and fails on the busiest day. Move the count to Redis, with an awaited get followed by an awaited set, a very common generated pattern, and the window becomes a full network round trip, roughly 0.2 to 1 millisecond inside a data centre, during which every other request for the same user runs. A rare race becomes a routine one. And free-threaded Python builds remove even the instruction-level atomicity.

## Reproduce it, then fix it at the store

An intermittent bug you cannot reproduce is a bug you cannot prove fixed. The lesson's script does it two ways. The first scripts the interleaving with events, so the schedule is exact: thread A reads, signals B, and waits; B consumes and signals back; then A finishes. Both are allowed, the count reads 10, every single time. The second invites a switch at the vulnerable point and counts: four threads, a limit of 10, and in one run, 39 exports were allowed.

The important design choice is the seam: a pause hook between the read and the check, which costs nothing in production and lets a test choose the schedule. Without a seam, you are left with stress tests that pass on a quiet CI machine, which is where the agent's green test left you. In async code, the same seam is an await point the test controls.

The fix always has the same shape: make read, check and write one atomic step, at the store that holds the truth.

In process, hold a lock across all three, and the stress test allows exactly 10, every time. Notice what the lock protects. Not the dictionary, which was never corrupted, but the invariant that used stays at or below the limit, across a multi-step operation.

Across processes, push the check into the database: one update that increments the count only where it is still under 10, and then look at whether a row was updated. One row means allowed; zero means the quota is exhausted. Row-level locking makes the condition and the increment one step, so two concurrent statements on the same row serialise.

In Redis, increment is atomic, so increment first and compare the value it returns. The count may overshoot the limit by the number of rejected requests, which is fine for a quota and wrong for a stock counter. When the exact number matters, use a Lua script, which Redis runs without interleaving other commands. And set the expiry in the same atomic block, or a crash between the two locks the user out forever. What is never right is get, compare, set, however many retries you wrap around it.

So how do you find this by hand? One question, asked of every piece of shared mutable state in a diff: what if another thread or request runs between this read and this write? It takes seconds. No test suite asks it, the agent did not ask it, and the only way to keep asking it is to keep the habit.

## Reps, and when not to do it by hand

Two to three hours a week, about 5 percent of a working week, is cheap insurance. Weekly: one solo timed problem, one AI-written diff traced by hand with one normal and one edge input, and the first 15 minutes of one bug debugged without AI. Monthly: one small task entirely by hand, one design doc first draft without assistance, one solo mock interview compared with your assisted scores. And on every change you accept, state its complexity and one way it could fail before you approve it.

But do not become a purist. Typing boilerplate is not skill maintenance; it is waste. Delegate scaffolding and configuration you can validate, codemods with the script reviewed rather than the output, test scaffolding as long as you own the expected values, and first drafts of routine docs.

Here is the heuristic that sorts every task: if the AI got this wrong, would I be able to tell? If yes, delegate and verify. If no, do it yourself, or learn enough first that the answer becomes yes. Do by hand what builds or preserves judgement; delegate what only consumes time.

## In the interview

A follow-up the lesson expects: your quota code passed a load test at 500 requests a second. Why did it still fail in production?

[pause]

A load test only shows the race if a thread switch or an await lands in the window between read and write, and with pure Python that window is a few microseconds wide, so the failure rate is tiny until traffic on one key spikes. The fix is to make the check atomic at the store, and the test is a scripted interleaving that forces the schedule, not a bigger load test. The wrong answer is "the load test was not big enough", which asks for more of the test that cannot prove absence.

And: which parts of your job should not be delegated to an agent? The parts whose errors you could not detect, which are also the parts that build judgement: schema and interface design, threat models, the hypothesis step in debugging, and the decision about what to build. Everything mechanical and verifiable gets delegated. The wrong answer is a list based on importance, like "production code", which bans safe delegation and permits unsafe delegation.

## Recap

Four things to remember. The verification paradox: you can only reliably verify work you could have produced, so the production skills need scheduled reps even when you rarely produce. Ask of every shared state in a diff what runs between this read and this write; single-threaded tests cannot answer it, and neither can the interpreter lock. Reproduce races with a scripted interleaving through a seam, and fix them with an atomic step at the store, never with sleeps or retries. And delegate by verifiability: if it were wrong, would you be able to tell?

At your desk: the skills table, the two-thread trace and the bytecode listing, the reproduction script to run yourself, the three fixes, and the self-audit questions on paper.

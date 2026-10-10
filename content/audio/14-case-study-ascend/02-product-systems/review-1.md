---
review: product-systems
source: 3018e4bbdc35c359
---
## Introduction

Twelve questions from the product-systems module. Answer out loud before the answer comes.

They run in the order of the lessons: three on the AI coach, three on mock interviews, three on running code in the browser, and three on the visualisation engine. Each has four options, A to D, then a few seconds for you to commit to one.

## Question 1

A learner closes the tab two seconds into a 30-second coach reply. What happens on the server?

A, the partial reply is discarded, but its tokens are still recorded from the first event of the stream. B, the request is queued and replayed automatically when the learner opens the page again. C, Axum drops the response body, which cancels the call to the provider, so nothing is stored or billed. D, the background task keeps reading, ignores the failed sends, and stores and bills the reply.

[think]

The answer is D: the background task keeps reading, ignores the failed sends, and stores and bills the reply.

The provider's stream is owned by a tracked background task, not by the response. When the browser goes, sending into the channel fails, and the pump ignores that, so the task drains the stream, settles the budget hold with the real usage and stores the reply. Option C is what happens when a handler returns the provider's stream directly, the naive design this code avoids.

## Question 2

Before the AI hardening work, two requests from one user arrived together when the usage table showed 149 of 150 requests. What happened, and what prevents it now?

A, exactly one succeeded, because the increment was already atomic, so nothing had to change. B, the second waited for the first model call to end, and a per-user mutex now serialises them. C, both failed with a serialisation error, and a retry loop around the check now handles it. D, both succeeded and the count reached 151, and a check under the row lock now decides.

[think]

The answer is D: both succeeded and the count reached 151, and a check under the row lock now decides.

Each request read 149, passed the comparison, then ran its own atomic increment. Atomic increments do not make a check-then-act sequence atomic. The fix moved the check under the day row's lock, first as one conditional upsert and now as a reservation inside a locking transaction, so reservations queue. A mutex around the model call would serialise minutes of work, not one short check.

## Question 3

A learner presses Stop 5 seconds into a reply that would have used 3,000 output tokens. Roughly what is billed and stored?

A, nothing at all, because the provider does not bill aborted requests. B, the full reply is generated, billed, stored and counted in the usage table. C, about five seconds of tokens, because Stop cancels the call to the provider. D, the partial text is stored, and the daily budget refunds the difference.

[think]

The answer is B: the full reply is generated, billed, stored and counted.

Aborting the request closes the connection, which the server cannot tell apart from a closed tab, and the background task finishes the stream by design. Saving tokens on Stop would need an explicit cancel signal that the task checks, which trades against the guarantee that disconnects never lose replies. Stop saves the learner's attention, not tokens.

## Question 4

In assisted mode, a candidate asks the pair-programmer a question while the interviewer's reply is still streaming, and both background tasks finish a few seconds apart. Why could transcript entries be lost before the fix?

A, each task appended to its own stale snapshot and wrote the whole array back. B, Postgres merged the two JSON arrays and removed the entries it saw as duplicates. C, the second task failed on a unique constraint and silently dropped its entry. D, the two update statements deadlocked, and Postgres aborted the second one.

[think]

The answer is A: each task appended to its own stale snapshot and wrote the whole array back.

A single update is atomic, but the value it wrote was computed from a stale read: the classic lost update. The fix appends inside the database, in one statement, so each append applies to the row as it is at that moment. There was no deadlock or constraint involved, which is exactly why the bug was silent.

## Question 5

During a solo interview, a learner calls the coach's message endpoint from another tab. What happens now, and why that status?

A, 401 Unauthorized, because the coach session is scoped to the interview. B, 409 Conflict, because the request is valid but not in the learner's current state. C, 403 Forbidden, because learners in a solo round may never use the coach. D, the request succeeds, because the coach lock is only a UI affordance.

[think]

The answer is B: 409 Conflict, because the request is valid but not in the learner's current state.

The server refuses while a solo interview is within its time box plus 15 minutes. A 409 says the conflict can be resolved by ending the interview; 403 would say never, and a 401 would make the client treat the learner as signed out. Option D was the behaviour before the fix, when the lock existed only in the UI.

## Question 6

A learner presses End while the interviewer's last reply is still streaming. Grading takes 20 seconds, and the reply finishes 4 seconds in. What happens to the reply today?

A, it is appended, and the grader is called again because the transcript changed. B, it is appended, because finishing changes the status only once the grade is stored. C, it is refused with a 409, because starting the grade froze the transcript first. D, it is queued and appended after the grade, so it never affects the evaluation.

[think]

The answer is C: it is refused with a 409, because starting the grade froze the transcript first.

Pressing End moves the row to a grading status in the same statement that stores the final code, before the grader is called. The reply's append only matches an active interview, so it matches nothing, and the refusal is logged as the expected case. Option B describes the behaviour before that fix, and nothing ever queues or regrades.

## Question 7

Why does the browser runner enforce time limits by terminating the worker, instead of asking the learner's code to stop?

A, browsers already stop every worker after ten seconds, so the limit is enforced anyway. B, synchronous code never yields, so it can neither check a flag nor receive a message. C, terminating a worker is faster than posting a stop message to it and waiting. D, workers cannot receive any messages at all once they have started running a learner's code.

[think]

The answer is B: synchronous code never yields, so it can neither check a flag nor receive a message.

A worker only processes an incoming message when its current task returns to the event loop, which an infinite loop never does. Workers can receive messages in general, just not in the middle of a synchronous task. Pyodide's interrupt buffer is the exception, and it needs a cross-origin isolated page, which this app does not have.

## Question 8

A problem has a time limit of 4,000 milliseconds and 8 tests. A learner's JavaScript has an infinite loop in the first test. When is the timeout reported?

A, never, because the loop freezes the tab before any timer can fire. B, after 8 seconds, because the budget scales with how many tests there are. C, after 4 seconds, because each test gets its own four-second limit. D, after 34 seconds, because one budget covers the whole batch of tests.

[think]

The answer is D: after 34 seconds, because one budget covers the whole batch.

The budget is the time limit times the number of tests, plus 2 seconds: 4 times 8 is 32, plus 2 is 34. All tests run in one call, and the main thread only hears back when the batch ends. The timer lives on the main thread, so the tab never freezes. Timing each test separately would report sooner, but would cost a runtime restart per timeout, which is expensive for Python.

## Question 9

A script posts to the submissions endpoint, claiming every test passed, with code that returns wrong answers. What does the server record today?

A, a 422 error, because the claimed counts disagree with the browser's signature. B, a solved problem at first, until a nightly job re-grades the code. C, a failed attempt, because it grades the code itself and ignores the counts. D, a solved problem, because the claimed counts match the target's tests.

[think]

The answer is C: a failed attempt, because the server grades the code itself and ignores the counts.

The server runs the code in its WebAssembly grader and stores only its own verdict; a test posts wrong code claiming two passes and expects zero of two. Option D was the old design, where matching counts were all that was checked, so any client could mark a problem solved. And a browser signature proves nothing, because anything the browser can sign, a learner can sign.

## Question 10

Why does the visualisation engine store a full snapshot per frame instead of a list of diffs?

A, any frame is reachable by setting an index, and tests assert on plain data. B, React cannot render a diff without first replaying it into a full state. C, diffs cannot be serialised to JSON, so the tests could not inspect them. D, snapshots use less memory than diffs once the 600-frame cap applies.

[think]

The answer is A: any frame is reachable by setting an index, and tests assert on plain data.

Diffs are smaller, which is the tempting answer, but every backward step then needs an inverse operation or a replay from the start, and every renderer must apply diffs correctly. Snapshots make the renderer a pure function of one frame. Measured over the curriculum, they cost a median of about 9 kilobytes of JSON per animation.

## Question 11

A new generator has a loop whose exit condition is never met for one input, and it pushes a frame on every iteration. What happens when a lesson renders it?

A, React catches the runaway loop and shows the warning box instead. B, the player shows the limit frame and lets the learner scrub through the rest. C, the page freezes, because push stops recording but the loop keeps running. D, the cap stops the loop once 600 frames have been recorded for it.

[think]

The answer is C: the page freezes, because push stops recording but the loop keeps running.

After the limit frame, push returns early, but that only bounds memory. Generators run synchronously on the main thread during render, so nothing interrupts the loop, and nothing is ever shown. Loops must check whether the builder is full, which the families do 170 times, or otherwise terminate.

## Question 12

A generator stores an answers array in its variables before each push, and keeps filling that array in place. The snapshot copies the variables object one level deep. After the run, what does frame 1's variables panel show?

A, the final answers, because every frame's answers field is the same array. B, a warning box, because the engine detects the mutated frame and fails. C, the answers at frame 1, because the spread copied the variables object. D, nothing, because the frame cap drops arrays nested inside the variables.

[think]

The answer is A: the final answers, because every frame's answers field is the same array.

The copy goes one level deep: each frame gets a new variables object whose answers field still points at the one array the generator keeps mutating. This was the bug in the monotonic-stack and depth-first-search animations until a later fix. A test that the first and last states are different objects passes; comparing each frame's JSON when pushed with its JSON at the end catches it.

## Recap

Three ideas kept coming back. Ownership: the work that must finish, a reply and its bill, belongs to a task that outlives the request, and the response only watches it. Atomicity: a check and an act in two steps race, whether it is a budget, a transcript append, or a grade, so the decision moves under a lock or into one statement, and state changes when the decision is made. And trust: the server enforces what matters, grades the code itself, and never trusts a shallow copy, a claimed result, or a lock that only the UI knows about.

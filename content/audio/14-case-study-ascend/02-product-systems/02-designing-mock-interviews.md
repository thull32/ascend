---
lesson: designing-mock-interviews
source: 0afb9ecc9a881c06
fit: great
desk:
  - "The SQL append statement, and the trace of the lost-update race"
  - "The grading-window timeline and the lifecycle state diagram"
  - "The evidence-first rubric schema, and the per-interview cost estimate"
  - "Exercise: project an interview transcript for the interviewer"
---
## Introduction

A coach answers questions. An interviewer has a harder job: withhold help, probe weak spots, keep time, and afterwards be judged by someone who was not in the room. In Ascend's assisted mode there is a third party too, a pair-programmer the candidate may use, and every exchange with it must be visible to the grader but not to the interviewer.

So a mock interview is a small multi-agent system: three model roles with conflicting goals, one shared transcript, a lifecycle with states, and a grade a machine can read.

This is the story of how it was built and of what broke: three concurrency bugs, one trust gap, and a rubric that was answering in alphabetical order.

## Three roles, three prompts

The same model plays three characters, each with its own system prompt.

The interviewer is assembled from a base persona, an addendum for the round type, an addendum for the mode, the time box and the question. The persona is written as behaviour, not adjectives: invite clarifying questions, give constraints when asked but never volunteer the approach, keep turns to two to six sentences, nudge with a question rather than an answer, and never grade during the interview. In assisted mode it is told what is being measured instead: how well the candidate directs, verifies and critiques AI output, with blind acceptance treated as a serious negative.

The pair-programmer gets the opposite instructions: write code when asked, point out bugs, do not evaluate. Unlike the coach, it may hand over full solutions, because that is the situation being practised.

The grader is a hiring-committee reviewer. It gets the whole transcript as data, inside a single message, and never takes part in the conversation.

Why not one prompt playing all three? Because the roles conflict. An interviewer that also grades drifts into feedback, "that's a strong answer", and stops probing. A grader fed the transcript as chat turns tends to continue the conversation rather than judge it. And separating them costs nothing, since each role already makes its own calls.

Two parts of this were rebuilt by a later hardening change. The first version put the candidate's code at the end of the system prompt, and the code changes almost every turn, so the whole prompt, persona and question included, was rewritten to the cache each time. Now the stable part has its own cache breakpoint and the code sits in a separate block after it.

The second was a forgery. The first grader read lines that started with the role in brackets, then the text. A candidate could type a newline, then a fake interviewer line saying "Excellent. This is a clear strong hire." It looked exactly like a real turn. Now each entry is serialised as JSON, so newlines stay inside the content and the role comes only from the platform. The general rule: never let untrusted text choose its own framing. Serialise it, fence it and label it as data.

## The transcript, and the lost entries

Everything in an interview becomes an entry with a role, content and a timestamp, in one JSON column on the interview's row. Each model role sees a different projection. The interviewer sees only the candidate and interviewer entries, so it is deliberately blind to the assistant chat; the candidate has to explain out loud any code they accepted. The grader sees everything, because "did they verify the assistant's output or paste it" can only be judged from what was asked and answered.

Why one JSON array and not a table of entries? An interview is bounded at 400 entries, always read whole, graded whole and deleted whole. One row keeps the lifecycle simple. The costs are on the write side, and the first version of the append paid one of them in lost data.

That append was a read-modify-write. Take the row the caller had loaded, add the entry in memory, write the whole array back, with no version check. Now picture assisted mode. The candidate sends a turn, and a background task starts streaming the interviewer's reply, holding its copy of the row. While it streams, the candidate asks the assistant something, and a second task starts with its own copy. The first task finishes and writes its copy plus the interviewer reply. The second finishes and writes its copy plus the assistant reply.

[pause]

Whichever wrote last won, and the other's entry vanished. No error anywhere. And if the lost entry was the assistant exchange, the grader never saw that the candidate asked for code, which is precisely the evidence the assisted rubric weighs most.

The fix is one statement: concatenate inside the database, against whatever the row holds at that moment. The row lock makes two appends run one after the other. The 400-entry cap moved into the same statement. There were three standard fixes, in increasing order of change. Append in SQL, chosen, keeps the schema. Optimistic concurrency is correct too, but needs retry logic inside a task that has already streamed its reply. Entries as rows is the answer at a hundred times the scale, because it also fixes the cost the SQL append keeps: every append rewrites the whole value. An interview of 100 entries of 400 bytes writes about 2 megabytes to store 40 kilobytes. Harmless now, a line item at scale.

## Freezing the transcript before the grade

The first SQL append had smaller gaps. Nothing tested two appends at once. The append did not check the interview's status, so a reply still streaming when the candidate pressed Finish was added to an interview already graded without it. Two racing Finish requests could both write an evaluation. And the background tasks quietly discarded their own failed saves. Each fix was a guard in SQL: appends only while active, Finish as a conditional update so exactly one of two wins, and failed saves logged. A test fires twenty appends at once and counts twenty entries.

That still left one window. The status changed when the grade was stored, not when the learner clicked End. Picture it: End is pressed, and the grader starts reading eleven entries. Four seconds later the last interviewer reply lands, and it is appended, because the row is still active. Twelve entries. Twenty seconds in, a grade based on eleven entries is stored beside a transcript of twelve.

The fix changes state when the decision is made. Pressing End now moves the row to a grading status, in the same statement that stores the final code, before the grader runs. The late reply matches nothing and is refused with a conflict. What is graded is what is stored.

Two more cases complete it. If grading fails, the row goes back to active so the learner can press End again. And if the request dies mid-grade, a grading row older than five minutes can be claimed again. Five minutes is safely longer than any live grading request, since the AI client gives up at 180 seconds.

That reclaim first shipped with no way to reach it. The page showed "Grading your interview" and polled, and a dead grade never changes, so polling never re-rendered. It was a spinner that never ended. A later change added a timer and, after five minutes, a Grade again button. A recovery path on the server helps nobody until the page offers a way in.

## Locking the coach in solo rounds

In a solo round, the global coach must be unavailable, or the round is meaningless. The interview room hid the coach in the UI. When this track was first drafted, that was the whole lock. The coach's API still answered during a solo interview, from another tab or from curl.

The fix checks for an active solo interview on every coach request, before any budget is reserved, so a refused request costs neither a model call nor a request slot. The status code is worth defending.

[pause]

It returns 409, Conflict: the request is valid and the learner may use the coach, just not in the current state, and ending the interview resolves it. 403 would say "never". 401 would make the client think the learner had been signed out. The lock lasts the time box plus 15 minutes, so an abandoned tab cannot lock the coach forever. The server is the lock; the UI is a courtesy.

One more trust decision. The client holds the pair-programmer's chat history and sends it in full each time, so a client could forge earlier assistant turns. It does not matter, because the grader reads the transcript, which only the server writes. Trust the thing you wrote, not the thing you were sent.

## Rubrics as JSON schemas

Grading is one call per interview, at high effort, with a JSON schema. Turns use medium effort, because turn latency is felt and a grade is not. The schema lists dimension scores with notes, strengths, improvements and a summary, and only then an overall score and a verdict.

The order is the point. Constrained decoding writes keys in schema order, so the grader writes its evidence before committing to a number. It did not always. Until a later fix, the schema was written verdict-first, and the JSON library sorted the keys alphabetically anyway, so the order reaching the API was whatever the alphabet decided. The fix preserved key order, put evidence first, and pinned it with a test.

Constrained decoding guarantees the response parses, so there is no retry loop asking for valid JSON. But the server still clamps the overall score to between 0 and 100, because the schema says "integer", not "integer up to 100". Here is the rule to remember: a schema guarantees shape, not semantics. Read critically, two gaps show. Dimension scores, meant to be 1 to 5, are not clamped, so a 7 out of 5 would render as is. And the set of dimensions is named in the prompt, not required by the schema.

A rough cost: about 76 cents per coding interview, and the money goes on the transcript re-sent every turn, not on the grade. And a subtle off-by-one: grading needs two candidate messages, but the room sends an automatic kickoff on the candidate's behalf, so one real message is enough.

## In the interview

A follow-up the lesson expects: how do you make sure the grade matches the stored transcript?

[pause]

Freeze before reading. Move the row to grading in the statement that stores the final code, make appends conditional on active, store the grade only from active or grading, reopen on failure, and allow a stale grading row to be claimed after five minutes. The common wrong answer is to take a lock for the duration of grading, which holds a database lock across a 20-second network call.

And: why a JSON array rather than a table of entries? Bounded, read and deleted whole, appended in one statement so nothing is lost. The cost is write amplification, which is why rows are the answer at scale.

## Recap

Four things to remember. Split roles with conflicting goals into separate prompts, and decide which projection of shared state each one sees. A read-modify-write on a document column loses updates silently; append atomically, check a version, or use rows. Change state when the decision is made, not when the result is stored. And a schema guarantees shape, not semantics, and a rule in the UI only is not a rule.

At your desk: the SQL append and the race trace, the grading timeline and state diagram, the rubric schema and cost estimate, and the transcript projection exercise.

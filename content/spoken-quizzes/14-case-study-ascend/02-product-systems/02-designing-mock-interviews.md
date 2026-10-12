---
lesson: designing-mock-interviews
source: f1550c6d0b9a1088
---
## 1

The interview grader receives the transcript as JSON lines inside one user message. An earlier version used plain lines, each starting with the role in brackets. What does the JSON form protect against?

A, the grader continuing the conversation in character, instead of judging it. B, prompt caching failing, because plain text lines change on every turn. C, the model silently truncating long transcripts once they pass its context window. D, a candidate typing a newline and a fake interviewer line, to forge praise.

[think]

The answer is D: a candidate typing a newline and a fake interviewer line, to forge praise.

With plain lines, text inside a candidate's message could start a new line that looked exactly like an interviewer turn. JSON escaping keeps newlines and quotes inside the content string, so the role comes only from the platform. Presenting the transcript as data rather than as chat turns is what stops the grader continuing the conversation, and that was true of both versions.

## 2

In assisted mode, a candidate asks the pair programmer a question while the interviewer's reply is still streaming, and both background tasks finish a few seconds apart. Why could transcript entries be lost before the fix?

A, each task appended to its own stale snapshot, and wrote the whole array back. B, Postgres merged the two JSON arrays, and removed entries it saw as duplicates. C, the second task failed on a unique constraint, and silently dropped its entry. D, the two update statements deadlocked, and Postgres aborted the second one.

[think]

The answer is A: each task appended to its own stale snapshot, and wrote the whole array back.

A single update is atomic, but the value it wrote was computed from a stale read: the classic lost update. The fix appends in SQL, concatenating onto the stored array, so each append applies to the row as it is at that moment. No deadlock or constraint was involved, which is why the bug was silent.

## 3

During a solo interview, a learner posts a message to the coach from another tab. What happens now, and why that status?

A, 401 unauthorised, because the coach session is scoped to the interview. B, 409 conflict, because the request is valid, but not in the learner's current state. C, 403 forbidden, because learners in a solo round may never use the coach. D, the request succeeds, because the coach lock is only a UI affordance.

[think]

The answer is B: 409 conflict, because the request is valid, but not in the learner's current state.

The coach returns a conflict error while a solo interview is within its time box plus 15 minutes. A 409 says the conflict can be resolved, by ending the interview; a 403 would say never, and a 401 would make the client treat the learner as signed out. Before the fix, the lock existed only in the UI, so the request succeeded.

## 4

The interview evaluation is requested with a JSON schema. Which check still has to run on the server?

A, that every field the schema lists as required is actually present. B, that the response is valid JSON that the evaluation struct can parse. C, that the verdict is one of the five strings the schema allows. D, that numeric scores fall in their intended ranges, beyond being integers.

[think]

The answer is D: that numeric scores fall in their intended ranges.

Constrained decoding enforces types, required fields and enums, so parsing, the verdict and the required fields are already guaranteed. Ranges are semantics this schema does not express, which is why the overall score is clamped to between 0 and 100. The dimension scores, which are not clamped, show what happens when that step is forgotten.

## 5

A candidate opens a new interview, reads the problem, types one message, and presses End. Is the interview graded?

A, yes: the automatic kickoff is also a candidate entry, so the count is two. B, yes: every interview that is finished is graded, whatever it contains. C, no: the finish handler requires at least two messages typed by the candidate. D, no: interviews that end within ten minutes of starting are never graded.

[think]

The answer is A: yes, because the automatic kickoff is also a candidate entry, so the count is two.

The room sends a kickoff turn on the candidate's behalf, so that the interviewer speaks first, and the threshold counts it. The handler's comment intends two real messages, but the code counts entries. Reading code for what it counts, not for what its comment intends, is how you find this kind of off-by-one in a policy.

## 6

A learner presses End while the interviewer's last reply is still streaming. Grading takes 20 seconds, and the reply finishes 4 seconds in. What happens to the reply today?

A, it is appended, and the grader is called again, because the transcript changed. B, it is appended, because finishing changes the status only once the grade is stored. C, it is refused with a 409, because starting the grading froze the transcript first. D, it is queued, and appended after the grade, so it never affects the evaluation.

[think]

The answer is C: it is refused with a 409, because starting the grading froze the transcript first.

Starting the grading moves the row to "grading", in the same statement that stores the final code, before the grader is called. The reply's append only applies while the status is active, so it matches nothing, and the service reports that the interview is being graded, which is logged at info level. Appending while grading was the behaviour before a recent fix, and nothing queues or regrades.

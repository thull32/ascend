---
lesson: the-ai-native-interview
source: 683f46bf2b01fb42
---
## 1

In an AI-assisted coding round, what is the interviewer primarily evaluating, beyond the fundamentals?

A, how well you direct, verify and critique the assistant's output. B, how fast you type, once you have settled on an approach. C, how few prompts you need to send before the tests pass. D, whether you can get the assistant to produce the answer fastest.

[think]

The answer is A: how well you direct, verify and critique the assistant's output.

With an assistant available, typing is cheap, and speed to an answer says little. The signal is in direction, meaning precise specs; verification, meaning reading, tracing and testing; and critique, meaning catching and rejecting bad output. All on top of understanding, approach, testing and communication.

## 2

In this app's assisted mock interview, what can the interviewer see during the session?

A, only your messages; your code reaches it only at the end. B, everything, including your assistant chat, streamed to it in real time. C, your messages and current editor code, but not your assistant chat. D, your code, plus a summary of your assistant chat added after each turn.

[think]

The answer is C: your messages and current editor code, but not your assistant chat.

Each turn sends your current editor code as a labelled data block, and the interviewer's history is built only from interviewer and candidate entries. The assistant exchanges are stored in the transcript and read by the grader afterwards, so during the session the interviewer knows what you asked the assistant only if you say so. Narrate what you asked, and what you checked.

## 3

The assistant's LRU cache passes every test it wrote, all of which put keys and then get them. At capacity 2, which sequence should you trace by hand to check it?

A, put 1, put 2, put 3, get 1, get 2, expecting minus 1. B, put 1, put 1 again, get 1, expecting the second value. C, put 1, put 2, get 1, put 3, get 2, expecting minus 1. D, put 1, get 2, expecting minus 1.

[think]

The answer is C: put 1, put 2, get 1, put 3, get 2, expecting minus 1.

Only a sequence where a get comes before an eviction tells least-recently-used apart from first-in-first-out. After getting 1, key 2 is the oldest, and must be evicted by putting 3, so getting 2 must return minus 1. The generated get did not refresh recency, so it evicted 1 instead. The other sequences pass for both correct and first-in-first-out behaviour.

## 4

You are unsure whether the input intervals can be empty. Whom should you ask?

A, the assistant, since it has read the problem too. B, the interviewer, who holds the real constraints. C, the problem statement, by inferring from its examples. D, nobody; assume the common case, and move on.

[think]

The answer is B: the interviewer, who holds the real constraints.

The interviewer holds the real constraints, and is evaluating your clarification. The assistant would answer confidently with an invented constraint, and assuming or inferring silently skips a dimension on the rubric.

## 5

Why is the interview transcript sent to the grader as JSON lines with platform-assigned roles, rather than as flattened text?

A, JSON is shorter than text, so the transcript fits within the grader's limit. B, so the interviewer's replies can be cached between grading runs. C, because the grading model can only read structured input formats. D, so a candidate cannot forge an interviewer or grading line by typing one.

[think]

The answer is D: so a candidate cannot forge an interviewer or grading line by typing one.

Flattened text let a candidate type a line that looked like an interviewer turn, and the grader could not tell it from the real thing. With one JSON object per message, the role comes from the platform, the candidate's text is escaped inside a string, and the grader is told the roles are authoritative. The general rule: carry structure in a format the judged party cannot forge.

## 6

Why does it matter that this app rejects assistant requests for solo interviews on the server, rather than only hiding the button?

A, the browser cannot store the mode, so the lock would reset on every reload. B, server-side checks save AI tokens, which matters more than the interface. C, it keeps the timer accurate, because the server owns the interview time box. D, a hidden button can be bypassed through the API, so a solo grade would mean little.

[think]

The answer is D: a hidden button can be bypassed through the API, so a solo grade would mean little.

Controls that matter are enforced where the client cannot change them. A solo report is only meaningful if the assistant was actually unavailable; saving tokens is a side effect, not the reason. The same principle made the app refuse coach requests during a solo interview, and it is why agent permissions are enforced with credentials rather than instructions.

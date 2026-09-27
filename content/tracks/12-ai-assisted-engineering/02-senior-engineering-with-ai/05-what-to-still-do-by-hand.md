---
slug: what-to-still-do-by-hand
title: "What to still do by hand: the skills that must stay sharp"
description: The verification paradox, the skills every AI-assisted workflow depends on and how each decays, a worked race condition that an agent's tests cannot catch, a maintenance regimen, and when doing it by hand is the wrong call.
minutes: 20
difficulty: hard
tags: [ai-tools, career, concurrency, debugging, fundamentals, deliberate-practice]
---
If an agent writes most of the code, which of your skills justify a senior salary? Not typing. The ones that let you check the agent's work, decide what it should be doing, and take over when it gets stuck. Those are precisely the skills that decay fastest when the agent does everything, because they are built and maintained by the work you are now delegating.

This lesson is about choosing, deliberately, what to keep doing yourself. Not out of nostalgia, and not everything: the goal is to delegate as much as possible while keeping the abilities that make delegation safe.

## The verification paradox

You can reliably verify work only at roughly the level at which you could have produced it. A reviewer who could not write a correct keyset pagination query will approve the wrong one, because the wrong one looks fine. A reviewer who has never debugged a race will not see one in a clean-looking diff. Generation became cheap; verification did not, and verification draws on exactly the skills that producing the work used to exercise.

Reviewing is also often harder than writing. The author of a line knows why it is there; the reviewer has to reconstruct that from the outside. When the author is a model, there is no one to ask who actually knows, only a model that will produce a plausible explanation on demand.

The decline is gradual, which is what makes it dangerous. Each skipped exercise is harmless. After a year of skipping them, you are a relay between a ticket and a model, and you cannot tell when the model is wrong. Nobody notices until an incident, or an interview without an assistant.

## The skills that every other skill depends on

| Skill | Why AI makes it more important | Decay symptom | Maintenance rep |
|---|---|---|---|
| Reading and tracing code precisely | It is the core of verification | You approve diffs you could not explain | Trace one AI diff by hand each week, one normal and one edge input |
| Complexity and estimation | Fluent code hides an O(n²) loop; generated estimates slip units | You learn about complexity from production latency | State the complexity before running anything |
| Debugging from first principles | When the agent loops, someone has to form hypotheses | You re-prompt instead of reading the stack trace | First 15 minutes of each bug without AI |
| Concurrency and distributed reasoning | Bugs are non-local and non-deterministic, so tests pass by luck | "It works on my machine" becomes your explanation | Ask of every shared state: what runs between this read and this write? |
| Data modelling and interface design | Hardest decisions to reverse; models propose the average schema | Schemas that need a migration every quarter | Design it yourself, then ask the model to critique |
| Security reasoning | Models produce common patterns; attacks target uncommon ones | Threats appear only in pen-test reports | Write the threat model for each new endpoint |
| Writing | The spec is now your main output, and writing is thinking | Specs that say "improve" and "robust" | Write first drafts of specs and design docs yourself |
| Git and shell fluency | They are the undo button for agent mistakes | Fear of `reflog`, `bisect`, `add -p`, worktrees | Recover one messy branch by hand each month |
| Unassisted problem solving | Solo interview rounds still exist and test exactly this | You freeze without an assistant | One solo timed problem each week |
| Judgement about what to build | The model builds whatever you ask, including the wrong thing | Busy weeks that ship nothing that mattered | Write down why before starting each task |

Several of these have their own lessons: [Invariants and loop reasoning](/learn/foundations/problem-solving/invariants-and-loop-reasoning), [Back-of-envelope estimation](/learn/system-design/building-blocks/back-of-envelope-estimation), [Races, mutexes and invariants](/learn/systems/concurrency/races-mutexes-and-invariants) and [Security in design](/learn/system-design/building-blocks/security-in-design).

## Worked example: a race the tests cannot catch

You ask an agent for a per-user export quota: at most 10 exports per user per day. It produces clean code and tests.

```python
class Quota:
    def __init__(self, limit):
        self.limit = limit
        self.used = {}

    def try_consume(self, user_id):
        used = self.used.get(user_id, 0)      # read
        if used >= self.limit:                # check
            return False
        self.used[user_id] = used + 1         # write
        return True

def test_eleventh_export_is_rejected():
    q = Quota(limit=10)
    assert all(q.try_consume("u1") for _ in range(10))
    assert not q.try_consume("u1")
```

The test passes, every time. It will keep passing, because it runs on one thread and nothing can happen between the read and the write.

In production the service handles requests on a pool of worker threads. User `u1` has used 9 exports and fires two requests at once. Thread A reads 9 and passes the check. Before A writes, the scheduler runs thread B, which also reads 9 and passes. Both write 10. Both exports run. The quota allowed 11, and the stored count says 10, so nothing downstream can even tell.

```viz
{"type": "concurrency", "algorithm": "race-condition", "threads": 2, "title": "The lost update inside try_consume", "caption": "Two threads read the same count before either writes. Both pass the check and both store the same value, so one consumption vanishes. Single-threaded tests never interleave, which is why they cannot see this."}
```

In CPython the window between the read and the write is small, so this might fail once in thousands of concurrent pairs, which makes it worse: it passes load tests and fails in production on the busiest day. Move the count to Redis with `used = await redis.get(key)` followed by `await redis.set(key, used + 1)`, a very common generated pattern, and the window becomes a network round trip wide.

The fix is to make read, check and write one atomic step. In process, hold a lock across all three:

```python
import threading

class Quota:
    def __init__(self, limit):
        self.limit = limit
        self.used = {}
        self._lock = threading.Lock()

    def try_consume(self, user_id):
        with self._lock:
            used = self.used.get(user_id, 0)
            if used >= self.limit:
                return False
            self.used[user_id] = used + 1
            return True
```

Across processes, push the check into the store so the database performs it atomically, and look at whether a row was updated:

```sql
UPDATE quotas
SET used = used + 1
WHERE user_id = $1 AND day = CURRENT_DATE AND used < 10;
-- 1 row updated: allowed.  0 rows updated: quota exhausted.
```

How do you find this by hand? One question, asked of every piece of shared mutable state in a diff: *what if another thread or request runs between this read and this write?* It takes seconds. No test suite asks it for you, the agent did not ask it, and the only way to keep asking it is to keep the habit.

## A self-audit

Try answering these without any assistant. Each maps to a skill in the table above, and each is a question a senior interviewer or reviewer can ask you at any time.

1. What is the time complexity of the last non-trivial function you merged, and what input makes it slowest?
2. Take one endpoint you own. Where would you look first if its p99 doubled after a deploy, and what would each place tell you?
3. Name one piece of shared mutable state in your service and what happens if two requests modify it at once.
4. How many requests per second does your service handle at peak, and roughly how many machines does that take? Show the arithmetic.
5. Which table in your schema would be the most painful to change, and why?
6. What is the worst thing an attacker could do with your most privileged API token, and where is it stored?
7. You committed to the wrong branch and pushed. What exact git commands recover it?
8. Explain, in one paragraph, why your team chose its main datastore over the obvious alternative.

If more than two of these send you reaching for a tool, that is where to put next month's reps. None of them is exotic; all of them are the substrate every AI-assisted workflow runs on.

## A maintenance regimen

Two to three hours a week of deliberate reps is cheap insurance on the skills that make you worth delegating to:

- **Weekly**: one solo timed problem; one AI-written diff traced by hand end to end; the first 15 minutes of one bug debugged without AI.
- **Monthly**: one small task done entirely by hand; one design doc first draft written without assistance; one solo mock interview in this app, compared with your assisted scores.
- **On every change you accept**: state its complexity and one way it could fail before you approve it.

[Learning without atrophy](/learn/ai-assisted-engineering/senior-engineering-with-ai/learning-without-atrophy) covers how to make those reps count.

## When doing it by hand is the wrong call

Do not become a purist. Typing boilerplate is not skill maintenance; it is waste. Delegate freely:

- Boilerplate, scaffolding and configuration syntax you can validate.
- Codemods, with the script reviewed rather than the output.
- Test scaffolding, provided you own the expected values.
- API lookups and translations between languages, verified by running them.
- First drafts of routine documentation.

The heuristic that sorts tasks: **if the AI got this wrong, would I be able to tell?** If yes, delegate and verify. If no, either do it yourself or learn enough first that the answer becomes yes. Do by hand what builds or preserves judgement; delegate what only consumes time.

## Senior signals

- You can explain the **verification paradox**: you can only reliably check work you could have produced or deeply understand.
- You keep **tracing, estimation, first-principles debugging and concurrency reasoning** sharp on purpose, with scheduled reps.
- You ask **"what runs between this read and this write?"** of every shared state in a diff, and know why single-threaded tests cannot answer it.
- You fix check-then-act races with **atomic operations or locks**, not retries or sleeps.
- You design **schemas and interfaces yourself** and use AI to critique them.
- You delegate by the rule **"would I be able to tell if it were wrong?"**, and you are not precious about boilerplate.

## Check yourself

```quiz
- q: >-
    What does the verification paradox imply for an engineer who delegates most coding to agents?
  options: ["Tests make understanding unnecessary, so invest in test coverage instead", "You can only reliably verify work you could have produced, so keep those skills", "Reviewing is always easier than writing, so review skill is the one to keep", "Verification can be delegated to a second agent, which catches the first one's errors"]
  answer: 1
  explanation: >-
    Plausible-but-wrong code only looks wrong to someone who knows what right looks like, so the production skills must be maintained even if you rarely use them to produce. A second agent shares the same blind spots in many cases, reviewing subtle code is often harder than writing it, and tests only check what someone thought to test.
- q: >-
    The agent's Quota tests pass reliably, yet production allows 11 exports for a limit of 10. Why did the tests not catch it?
  options: ["The limit was misconfigured in production, so the tests checked a different value", "Python dictionaries are not thread-safe for reads, so the count was read wrongly", "The tests used a limit of 10, and the off-by-one only shows at a limit of 11", "The tests are single-threaded, so nothing interleaves between the read and the write"]
  answer: 3
  explanation: >-
    Check-then-act on shared state is only wrong when another request interleaves between the read and the write. A single-threaded test never interleaves, so it passes forever. Reasoning about interleavings, or a targeted concurrency test, is required.
- q: >-
    The quota count lives in Redis and the code does GET, compares, then SET. What is the correct fix?
  options: ["Make read, check and write one atomic operation in the store", "Add a short sleep between GET and SET, so concurrent requests settle", "Retry the SET when it fails, so a lost write is always reapplied", "Cache the count locally in each process, so fewer round trips can race"]
  answer: 0
  explanation: >-
    The bug is that read, check and write are separate steps. Only an atomic operation (an atomic increment and compare, or a conditional update performed by the store itself) or a lock spanning all three removes the window. The SET does not fail, so retries do nothing; sleeps change timing, and local caches add more copies of the state to disagree.
- q: >-
    Which task is the best candidate to delegate fully to an agent, with only normal verification?
  options: ["A script to convert 40 JSON test fixtures to YAML, which you run", "Deciding whether to build a new service or extend an existing one", "Designing the schema for a new multi-tenant billing table", "Writing the threat model for a new public payments endpoint"]
  answer: 0
  explanation: >-
    The conversion is mechanical and easy to check: you review and run the script, and if it is wrong, you can tell. Schema design, build-versus-extend decisions and threat modelling are judgement calls that are hard to reverse and hard to verify without having done the thinking.
- q: >-
    Which heuristic best decides whether to delegate a task or do it yourself?
  options: ["Never delegate production code; use agents only for tests and scripts", "Delegate whatever the AI reports it can complete with high confidence", "If the AI got this wrong, would I be able to tell? If not, do it myself", "Delegate anything that would take you more than ten minutes to write by hand"]
  answer: 2
  explanation: >-
    Safe delegation depends on your ability to verify; if you could not tell, do it yourself or learn enough first that you could. Time-based rules ignore risk, blanket bans throw away real gains, and the tool's confidence is not a measure of its correctness.
```

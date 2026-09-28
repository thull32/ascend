---
slug: getting-unstuck
title: "Getting unstuck: recognising it, diagnosing it, recovering gracefully"
description: How to notice you are stuck within a minute, seven kinds of stuck and the move that unblocks each (each shown on a real problem), an annotated Koko Eating Bananas transcript from stuck to binary search on the answer, and how hints are recorded and weighed.
minutes: 22
difficulty: medium
tags: [interview, problem-solving, hints, recovery, stuck]
problems: [daily-temperatures, subarray-sum-equals-k, koko-eating-bananas, coin-change]
---
Minute 14. You have a brute force, you know it is O(n²), you know n is 10⁵, and nothing is coming. You re-read the problem. You stare at the example. You try the same idea again, a little differently. Three minutes pass without a word. The interviewer shifts in their chair.

Every strong candidate gets stuck. Interviewers pick problems at the edge of what a candidate can do precisely so that they can watch what happens next. The moment of being stuck is not the failure; the next three minutes are the assessment. A candidate who says "I'm stuck on how to avoid rescanning; let me try it by hand on a small example" and gets there with one nudge often scores better than one who recalled the answer instantly, because the interviewer saw how they think. A candidate who goes silent for eight minutes and then guesses scores badly even if the guess is right.

This lesson is the recovery playbook: how to notice you are stuck early, which of seven kinds of stuck you are in, the move that unblocks each kind (each demonstrated on a real problem), a full annotated transcript of a candidate working through [Koko Eating Bananas](/practice/koko-eating-bananas), and how interviewers record and weigh the hints you take.

## Notice it within a minute

The costliest part of being stuck is the time before you admit it. These signals mean you are stuck, whatever it feels like:

- You have said the same idea twice.
- Two or three minutes have passed with no new information on the screen: no new example, observation or line of code.
- Your code is growing special cases (`if i == 0`, `if i == n - 1`, `if len(stack) == 1`). A stream of special cases usually means the approach or the invariant is wrong, not that one more case is needed.
- You are trying to *remember* rather than *derive*: "I've seen this… what was the trick?"
- The interviewer has asked "are you sure?" or repeated a question. They are telling you something.

When you notice one, say so within seconds: "I'm going in circles. Let me step back." Visible, structured thinking is what is being evaluated; silence is time passing with nothing to write down. The widely quoted window of visible effort before a hint is three to five minutes. It varies by interviewer, but none report rewarding eight minutes of silence, and on a 38-minute working budget, eight minutes is a fifth of the round.

## Seven kinds of stuck, and the move for each

"Stuck" covers different situations, and each has a different first move. Diagnose before you act: the move for kind 3 wastes time on kind 5.

| Kind | What it feels like | Diagnostic question | First move | Shown on |
|---|---|---|---|---|
| 1. The problem is unclear | You cannot compute the right answer for an example by hand | "Can I produce the expected output myself?" | Solve a small example slowly, aloud; re-read the statement | Koko: what happens to leftover time in an hour |
| 2. No approach at all | You cannot even state a brute force | "What are all the candidate answers, and can I check one?" | Describe the search space and a checker | Koko: try every speed |
| 3. Brute force, no optimisation | You know it is too slow and cannot see better | "What does the inner loop recompute?" | Name the repeated work; ask "what would make this easy?"; sweep the pattern signals | Daily Temperatures; Koko |
| 4. Approach, but the details will not work | The idea seems right, the code keeps needing special cases | "What is true at the top of every iteration?" | Write the invariant in one sentence; solve a relaxed version first | Koko's loop bounds; Subarray Sum Equals K |
| 5. The code is wrong | The output does not match | "What is the smallest input that fails?" | Shrink to the smallest failing input and trace it | Subarray Sum Equals K without the empty prefix |
| 6. You cannot justify it | It seems to work, but you cannot say why | "Is there a small input where this is wrong?" | Hunt a counterexample on tiny inputs against a brute force | Greedy coin change |
| 7. The mechanics | You know what to do, not how to write it (an API, an index formula) | "Is this the interesting part of the problem?" | Stub it behind a named helper with a stated contract; move on | Integer ceiling in Koko |

Kinds 1 and 2 are rarer than they feel. Most interview stuckness is kind 3, most of the rest is kind 4, and kind 7 is the cheapest to escape and the one candidates most often spend five minutes on.

## The moves, demonstrated

### Solve it by hand, slowly (kinds 1 and 3)

Your hands often know the algorithm before your head does. [Daily Temperatures](/practice/daily-temperatures): for each day, how many days until a warmer one? `[73, 74, 75, 71, 69, 72, 76, 73]`, expected `[1, 1, 4, 2, 1, 1, 0, 0]`.

Do it by hand and narrate what you keep track of. 73: next is 74, so 1. 74: 1. 75: I'm waiting… 71, 69 and 72 are not warmer, 76 is, so 4. Doing it again, you notice you were holding a *pile of days still waiting*: 75, 71, 69. When 72 arrives it resolves 69 and 71, newest first, but not 75. When 76 arrives it resolves 72 and 75. The pile only resolves from the top, and its temperatures decrease from bottom to top. That is a monotonic stack, derived from your own bookkeeping; the [monotonic stack pattern](/learn/interview-patterns/sequence-patterns/monotonic-stack-pattern) has the template.

The same move clears kind 1. In Koko, working `[3, 6, 7, 11]` at speed 4 by hand forces the question "a pile of 3 at speed 4, is the rest of that hour wasted?" The statement says yes, so a pile of p takes `ceil(p / k)` hours, and you know the definition before you know the algorithm.

### Describe the search space (kind 2)

When no approach comes, list what the answer could be and how you would check one candidate. In Koko the answer is a speed between 1 and `max(piles)`, and checking a speed means summing `ceil(p / k)` over the piles, O(n). Trying every speed is O(n · M) for maximum pile M. That is slow, but it is an approach: kind 2 has become kind 3.

### Name the repeated work, then ask what would make it easy (kind 3)

Say the brute force aloud and ask what the inner loop recomputes that an earlier iteration already knew. In Daily Temperatures, the scan from day i walks past days that earlier scans already resolved. In "subarray sum equals k", the inner loop recomputes sums that a running prefix already holds. Naming the repeated work usually names the structure that stores it.

When there is no obvious repeated work, list properties that would make the problem trivial and ask which you can afford: sorted input (two pointers, binary search); the answer for every prefix (DP, prefix sums); small values (a counting array); a graph (BFS or DFS); a fast check for a candidate answer (binary search on the answer, if feasibility is monotone). Then sweep the signals from [pattern recognition](/learn/foundations/problem-solving/pattern-recognition) aloud: contiguous range, "k-th", dependencies, "all combinations", "minimum number of", "next greater". Thirty seconds of sweeping beats three minutes of hoping.

If you know the target complexity, work backwards: O(n log n) means a sort or O(log n) work per element; O(n log M) for a value range M means a binary search over values with an O(n) check. "Where would the log come from?" is often the fastest route to the idea.

### Write the invariant; relax a constraint (kind 4)

When the details keep breaking, stop editing and write one sentence that is true at the top of every iteration. For Koko's binary search: "`hi` is always a feasible speed, and every speed below `lo` is infeasible." The bounds follow: start at `lo = 1, hi = max(piles)` (the maximum is feasible whenever `h >= n`); on a feasible `mid`, `hi = mid`; otherwise `lo = mid + 1`; stop when they meet. No special cases remain, because the invariant decided each one. The [invariants lesson](/learn/foundations/problem-solving/invariants-and-loop-reasoning) has the method in general.

The other kind-4 move is to solve an easier version, then see what breaks. [Subarray Sum Equals K](/practice/subarray-sum-equals-k), counting contiguous subarrays that sum to k:

- **Relaxed: all values positive.** A sliding window works: extend right; while the sum exceeds k, shrink from the left; count when it equals k. Shrinking always lowers the sum.
- **Restore negatives.** Shrinking no longer lowers the sum reliably, so the window breaks. What survives is the running sum: subarray `i..j` sums to k exactly when `prefix[j+1] − prefix[i] = k`, so for each prefix you need the count of *earlier* prefixes equal to `prefix − k`.

```python
def subarray_sum(nums, k):
    count, prefix = 0, 0
    seen = {0: 1}                    # the empty prefix
    for x in nums:
        prefix += x
        count += seen.get(prefix - k, 0)
        seen[prefix] = seen.get(prefix, 0) + 1
    return count
```

On `[1, -1, 1]` with k = 1 the prefixes are 1, 0, 1. At prefix 1, one earlier prefix equals 0 (the empty one): count 1. At prefix 0, none equals −1. At prefix 1, two earlier prefixes equal 0: count 3. The subarrays are `[1]`, `[1]` and `[1, -1, 1]`.

### Shrink to the smallest failing input (kind 5)

Suppose the first draft started with `seen = {}` and returned 1 on `[1, -1, 1]` instead of 3. Staring at the three-element trace is slow. Shrink it, dropping elements while the output stays wrong: `[1, -1]` still fails (0 instead of 1), and so does `[1]` with k = 1 (0 instead of 1). On a one-element input the trace is one line: prefix 1, look up `seen[0]`, find nothing. The subarray that starts at index 0 needs an "earlier prefix" of 0, which is the empty prefix, and `{0: 1}` is the fix. Shrinking turned a three-row puzzle into a one-row diagnosis.

### Hunt a counterexample (kind 6)

"Always take the largest coin that fits" feels right for [Coin Change](/practice/coin-change). If you cannot say why it is right, test it against a brute force on tiny inputs. Coins `[1, 3, 4]`, amounts 1 to 6: greedy and the minimum agree up to 5, and at 6 greedy takes 4 + 1 + 1 (three coins) while 3 + 3 uses two. One counterexample ends the greedy idea and points at DP. If the hunt finds nothing in a few minutes of small cases, you have evidence (not proof) and a sentence for the interviewer: "I checked amounts up to 10 against a brute force".

### Stub the mechanics (kind 7)

In Koko, a candidate who cannot remember how to write an integer ceiling should not spend three minutes on it. Write `hours += ceil_div(p, k)`, say "`ceil_div` is `(p + k − 1) // k`, or `-(-p // k)`, I'll confirm with a value", and continue. Check it once: `ceil_div(7, 4)` is `(7 + 3) // 4 = 2`. The same move handles "Python has no max-heap" (push negated keys, and say so) and a half-remembered library signature (name the contract, ask whether pseudocode is acceptable for that call).

## A transcript: Koko, from stuck to binary search on the answer

Koko has `n` piles of bananas and `h` hours. Each hour she picks one pile and eats up to `k` bananas from it; if the pile has fewer, she finishes it and waits for the hour to end. Return the minimum integer `k` that finishes every pile within `h` hours. Constraints: n up to 10⁴, piles and h up to 10⁹.

| Time | What is said | Move | Interviewer's note |
|---|---|---|---|
| 08:10 | C: "One pile per hour, and leftover time in an hour is lost?" I: "Yes." | Clarify the rule (kind 1 avoided) | "clarified eating rule" (an answer, not a hint) |
| 08:50 | C: "`[3, 6, 7, 11]`, h = 8. At k = 4: 1 + 2 + 2 + 3 = 8 hours, fits. At k = 3: 1 + 2 + 3 + 4 = 10, doesn't. So 4." | Solve by hand | "worked the example to the answer" |
| 09:40 | C: "Brute force: k = 1, 2, 3, … until one fits. O(n) per check, up to 10⁹ checks. Too slow." | Describe the search space (kind 2 cleared) | "brute force with cost, unprompted" |
| 10:30 | C: "I'm stuck on avoiding every speed. Sweeping: not contiguous, not a graph; sorting piles doesn't change the hours." | Name the stuck point; pattern sweep | "stated stuck point; structured search" |
| 11:40 | C: "What would make this easy? A fast check for one candidate, and I have that, O(n). So the question is which speeds to check." | What would make this easy | "found the O(n) feasibility check" |
| 12:40 | C: "I think the order I try speeds in matters. Is there a relationship between speeds I should use?" | Targeted hint request | "asked a specific question at 12:40" |
| 12:55 | I: "If speed 5 works, what can you say about 6?" | | "nudge (level 1), phrased as a question" |
| 13:05 | C: "Then 6 works: `ceil(p / k)` never grows as k grows, so total hours never grow. Feasibility is false … false, true … true. Binary search for the first true: about 30 checks for 10⁹, O(n log M)." | Restate the hint, connect, continue | "converted the nudge into the full approach in 10 s" |
| 13:40 | C: "Invariant: `hi` always feasible, everything below `lo` infeasible. Feasible `mid`: `hi = mid`; else `lo = mid + 1`; loop while `lo < hi`." | Write the invariant (kind 4 prevented) | "stated the invariant before writing bounds" |
| 14:10 | C codes; writes `ceil_div` as a helper with a one-line check | Stub the mechanics | |
| 16:50 | C traces the example (table below) | Test | "traced to 4; correct first run" |

```python
def min_eating_speed(piles, h):
    def hours(k):
        return sum((p + k - 1) // k for p in piles)     # ceil(p / k) per pile

    lo, hi = 1, max(piles)             # invariant: hi feasible; below lo infeasible
    while lo < hi:
        mid = (lo + hi) // 2           # rounds down, so hi = mid always shrinks
        if hours(mid) <= h:
            hi = mid
        else:
            lo = mid + 1
    return lo
```

The trace on `[3, 6, 7, 11]`, h = 8, as printed by running the code:

| Step | `lo` | `hi` | `mid` | `hours(mid)` | `<= 8`? | Update |
|---|---|---|---|---|---|---|
| 1 | 1 | 11 | 6 | 1 + 1 + 2 + 2 = 6 | yes | `hi = 6` |
| 2 | 1 | 6 | 3 | 1 + 2 + 3 + 4 = 10 | no | `lo = 4` |
| 3 | 4 | 6 | 5 | 1 + 2 + 2 + 3 = 8 | yes | `hi = 5` |
| 4 | 4 | 5 | 4 | 1 + 2 + 2 + 3 = 8 | yes | `hi = 4` |
| 5 | 4 | 4 | | | | return 4 |

The code passes all nine tests in the practice problem. What the approach buys, measured on CPython 3.14 on a Ryzen 9 9950X3D desktop: one feasibility check over 10⁴ random piles up to 10⁹ takes 0.28 ms, and the whole binary search took 10 ms (log₂ 10⁹ ≈ 30 checks). That instance's answer was about 3.3 × 10⁸, so the linear scan from k = 1 would need that many checks: at 0.28 ms each, about 25 hours.

Notice what the transcript contains. Five moves before the hint, each producing something on the screen; a question at 12:40 that showed exactly where the candidate was; a nudge that supplied one fact (monotonicity), not the technique; and the technique, its complexity and its invariant derived within a minute of the nudge. The write-up for the algorithm dimension would read close to "worked the problem with structured moves; one small nudge on monotonicity, used immediately; stated invariant; correct first trace".

## How hints are recorded and weighed

Hints are not all equal, and interviewers do not record them as a count. What is commonly reported is a ladder: how much of the solution the interviewer supplied, when, and what the candidate did with it. Many interviewers prepare two or three hints of increasing strength for their question in advance. Here is that ladder for the Koko moment at 12:40.

| Level | What the interviewer says | How it is typically noted | Typical weight |
|---|---|---|---|
| 0. An answer to a clarifying question | "Yes, leftover time in an hour is lost." | Not a hint; often a positive ("clarified the rule") | None |
| 1. A nudge, usually a question | "If speed 5 works, what about 6?" | "small nudge" with the time | Minor when converted quickly; one is common in strong rounds |
| 2. A direction | "Could you search over speeds instead of trying each?" | "hint toward the approach" | Moderate: the candidate still supplies the technique |
| 3. The core idea | "Binary search on the speed, with an O(n) check." | "needed the core idea" | Commonly caps the algorithm dimension near a mid-level pass |
| 4. Led through | "Set lo to 1 and hi to the max; now what's the condition?" | "led through the solution" | Below the bar for that dimension |

Three things change the weight of the same hint. **What happened after it**: a level-1 nudge turned into the full approach in ten seconds reads as "nearly unassisted"; the same nudge needing to be repeated reads as level 2. **When it came**: a nudge at minute 13 leaves time to show everything else; a core-idea hint at minute 28 leaves the testing and follow-up phases empty, which costs more than the hint. **Who initiated it**: a candidate's specific question ("is there a relationship between speeds?") is itself evidence of diagnosis, while a rescue after silence is not. The [45-minute protocol](/learn/interview-patterns/interview-execution/the-45-minute-protocol) has the wider phrase vocabulary of write-ups; this ladder is the part of it that concerns hints.

## Asking for a hint

**When.** After about three to five minutes of visible, structured effort without progress, or sooner if the clock says so (minute 17 with no approach). Asking in the first thirty seconds signals no effort; asking at minute 30 leaves no time to use the answer.

**How.** Say where you are and ask about a direction, not for "a hint":

> "I can see the brute force re-scans days that are already resolved. I'm thinking about keeping the unresolved days somewhere, but I'm not sure what structure resolves them in order. Is that the right direction?"

A specific question earns a small, precise hint, and a small hint you turn into the solution reads far better than a large one you are handed.

**Using the hint.** Repeat it in your own words, connect it to what you had, and continue from there, as the candidate did at 13:05. Do not restart, and do not pretend you were about to say it. The [communicating while solving](/learn/foundations/problem-solving/communicating-while-solving) lesson covers this in detail.

## Switching approaches gracefully

Sometimes, halfway through coding, you find the approach cannot work: a greedy choice has a counterexample, a window cannot handle negatives. Sunk cost pushes you to patch. Make the switch visible instead:

> "I'm going to stop. This window can't handle negatives, because shrinking doesn't guarantee a smaller sum; `[1, -1, 1]` with k = 1 is the counterexample. Prefix sums with a hash map handle negatives. I'll switch; the input handling and test cases carry over."

That shows you found the flaw yourself, justifies the switch with a concrete reason, and keeps what can be salvaged. Deleting fifty lines silently looks like panic; the same change, narrated, looks like judgement. Switch only with a counterexample in hand; switching on a feeling tends to happen twice, and two half-finished approaches are worse than one finished brute force.

## The fallback: ship the brute force

At around minute 20 with no optimised approach, change goal. Write the brute force cleanly, test it, and say where the bottleneck is:

> "I'll code the linear scan over speeds now so we have something correct and tested. The bottleneck is trying every speed; if there's time I'll come back to that."

Be honest about what this buys. For a medium problem at a top company, brute force alone is usually not enough for a strong algorithm rating. It still earns code-quality and testing credit, gives the interviewer something concrete to probe, and the optimisation often appears once working code is on the screen and the repeated work is visible in it.

## Managing the adrenaline

Being stuck in front of someone triggers a stress response that narrows your thinking when you need it wide. Announce a short silence ("let me think quietly for thirty seconds"): announced silence is fine, unannounced silence of two minutes is not. Write something down: restate the problem in a comment, write a small example, list the constraints, so working memory has something external to lean on. And take one slow exhale; it takes three seconds and is invisible on video.

## Choosing a move

| Move | Typical time | Works best on | Fails on | How it reads |
|---|---|---|---|---|
| Solve by hand | 2–3 min | Hidden-structure problems: stacks, two pointers, greedy orderings | Problems whose structure is global, such as subset DP | "derived the approach from the example" |
| Name the repeated work | About 1 min | A nested-loop brute force | No brute force yet | "optimised from the brute force" |
| What would make it easy | 1–2 min | Search, sortable input, bounded values, monotone checks | Problems with no exploitable property | "structured search for the idea" |
| Relax a constraint | 2–4 min | Sign, sortedness, distinctness constraints | When the relaxed version is as hard as the original | "isolated what breaks" |
| Shrink the failing input | 1–2 min | Wrong output with a large failing case | Performance problems, which shrinking hides | "debugged systematically" |
| Ask a targeted question | Under 1 min | After 3–5 minutes of visible effort | The first minute, or minute 30 | Recorded as a hint, lightly if specific |

## Under the hood: how being stuck is graded

Few rubrics have a dimension called "getting unstuck". The evidence lands in two others. The algorithm dimension is rated *hint-adjusted*: how much of the approach was the candidate's. The communication dimension records whether the stuck period was visible and structured. Ascend's mock interviewer works the same way: when a candidate is stuck for a while it offers a small nudge phrased as a question, not the answer, and notes internally that a hint was given; the grader then reads that nudge in the transcript like any other moment.

The notes for the same Koko moment, written two ways:

```text
Candidate 1
10:30  stuck on optimisation - said so; swept patterns aloud
11:40  found O(n) feasibility check himself
12:40  asked: "is there a relationship between speeds?"
12:55  nudge L1: "if 5 works, what about 6?"
13:05  -> monotone -> binary search on answer, O(n log M), in 10 s
13:40  stated invariant for lo/hi before coding

Candidate 2
10:30  brute force stated
10:30-15:20  silent; typed and deleted a sort
15:20  asked "can I get a hint?"
15:30  L2: "could you search over speeds rather than try each?"
17:00  still unsure -> L3: "binary search on k with an O(n) check"
18:10  coding; lo/hi bounds changed 3 times; infinite loop found at 24:00
```

In the debrief, the argument is about the fraction of the solution that was the candidate's and the time left after it. Candidate 1 supplied the brute force, the feasibility check, the technique, the complexity and the invariant; the interviewer supplied one fact. Candidate 2 supplied the brute force; the interviewer supplied the technique, and the silent five minutes plus the bound churn meant testing could not start before minute 25. Both wrote the same final code. Interviewers who have asked a question many times also know where candidates usually stall, and a nudge at the usual sticking point is read more lightly than one needed earlier.

## Failure modes

**Symptom: "long silence, then needed the core idea" in the write-up.** Diagnosis: the candidate was trying to recall the trick rather than derive it, and never named the stuck point, so the interviewer could not give a small hint. Check the transcript for the gap between the last new line on screen and the first question. Fix: say the stuck point within a minute, run one move from the table by kind, and ask a specific question by minute 17.

**Symptom: "needed the hint repeated" or "hint did not land".** Diagnosis: after the hint the candidate restarted from scratch instead of connecting it to their own work, or did not restate it and misheard it. Fix: repeat the hint in your own words, say which of your pieces it connects to, and continue from there.

**Symptom: the binary search hangs or is off by one, and the bounds change three times.** Diagnosis: kind 4 treated as kind 5: editing `lo`, `hi` and the loop condition by trial without an invariant. With `mid` rounding down, `lo = mid` never makes progress on two elements. Fix: state what `lo` and `hi` mean, then derive each update from that sentence.

**Symptom: two approaches started, neither finished, at minute 30.** Diagnosis: switching on a feeling, without a counterexample to the first approach. Fix: switch only with a concrete failing input; otherwise finish the current approach or fall back to a tested brute force.

**Symptom: five minutes lost on a ceiling formula or a heap API.** Diagnosis: kind 7 treated as the main problem. Fix: a named helper with a stated contract and a one-value check, then move on.

## Interviewer follow-ups

**"Why is binary search valid here?"** Model answer: `hours(k)` is a sum of `ceil(p / k)`, each non-increasing in k, so feasibility (`hours(k) <= h`) is false for small k and true from the answer upward; binary search finds the first true in O(log M) checks. Common wrong answer: "because the piles are sorted", which they need not be; the search is over speeds, not over the array.

**"Could the linear scan ever beat binary search?"** Model answer: only when the answer is tiny: the scan costs about `answer` checks and the search about `log₂ M`, so the scan wins when the answer is below about 30 for M = 10⁹. A hybrid that tries k = 1, 2, 4, … (exponential search) gets O(n log answer) either way. Common wrong answer: "binary search is always faster", which ignores that its cost depends on M, not on the answer.

**"What changes in Java or C++ with piles up to 10⁹ and n = 10⁴?"** Model answer: at k = 1 the hour total reaches 10¹³, past a 32-bit int, so accumulate in a 64-bit integer, or stop summing as soon as the total exceeds h. `p + k − 1` can reach about 2 × 10⁹, under 2³¹ − 1 ≈ 2.147 × 10⁹ by less than 8%, which is close enough to use 64-bit there too. Common wrong answer: "no overflow, because each pile fits in an int".

**"You needed a nudge. How would you find this alone next time?"** Model answer: name the trigger: "minimise a value subject to a yes/no check that is monotone in that value" means binary search on the answer; add it to the pattern sweep, next to "k-th smallest" and "capacity to ship within D days". Common wrong answer: "I'd memorise this problem", which does not transfer to the next one.

**"If the nudge hadn't come, what would you have done at minute 20?"** Model answer: code the linear scan with an early exit, test it on the example, and name the bottleneck, so the round has working code and the optimisation can follow. Common wrong answer: keep thinking silently until time runs out.

## What mid-level engineers get wrong

- **Treating "stuck" as one state.** Using the kind-3 move (optimise) on a kind-5 problem (wrong output) wastes the minutes a two-line shrink would have saved.
- **Asking "can I have a hint?" with no position.** The interviewer cannot calibrate a small hint, so they give a big one, and the note says "needed the core idea".
- **Restarting after a hint.** The hint was meant to connect to your work; starting over reads as not having understood either.
- **Patching binary-search bounds by trial.** Three edits of `lo`, `hi` and the condition, then an infinite loop at minute 24; one invariant sentence avoids all three.
- **Spending minutes on mechanics.** A forgotten ceiling formula or heap signature is not the problem being assessed; stub it and move on.
- **Waiting eight minutes to avoid a hint.** The silence costs more than a level-1 nudge would have, and leaves testing and follow-ups with no time.

## Practising being stuck

You cannot practise recovery on problems you already know. Use unfamiliar ones deliberately:

- Start a solo coding interview on `/interviews` at hard difficulty, where you are more likely to get stuck. Afterwards, read the transcript for the minutes before you asked for help and check whether you named what you were stuck on, and which hint level you received.
- On the practice list, pick problems you have not seen, set a 20-minute timer, and when it rings open the first hint whether or not you feel close. That trains "use the hint and keep moving" instead of "suffer silently".
- After each session, label every stuck moment with its kind from the table. Within a few weeks you will know which kind you fall into most, and which move fixes it.

## Senior signals

- You say "I'm stuck on X" within a minute or two, naming the specific sub-problem rather than the whole problem.
- You diagnose which kind of stuck you are in and pick the matching move, rather than waiting for inspiration.
- You turn "no approach" into a search space and a checker, and "brute force" into a named piece of repeated work.
- You ask for hints with a specific question that shows your position, and convert a nudge into the full approach, visibly.
- You write the invariant before the bounds, so off-by-one bugs never start.
- You switch approaches out loud, with a counterexample, and salvage what carries over; otherwise you ship a tested brute force at a sensible checkpoint.
- You know hints are weighed by level, timing and what follows, and you act to keep them small and early.

## Check yourself

```quiz
- q: >-
    Your code for Subarray Sum Equals K returns 1 on [1, -1, 1] with k = 1, but the answer is 3. Which kind of stuck is this, and what is the first move?
  options: ["Unclear problem: re-read the statement from the top", "Wrong output: shrink to the smallest failing input", "Mechanics: stub the hash map behind a named helper", "No optimisation: name the repeated inner-loop work"]
  answer: 1
  explanation: >-
    The approach is right and the output is wrong, which is kind 5. Shrinking finds that [1] with k = 1 already fails, returning 0; the one-line trace shows a subarray starting at index 0 needs the empty prefix 0 in the map, so seen must start as {0: 1}. Optimising or re-reading the statement does not address a wrong result.
- q: >-
    In Koko Eating Bananas, why is binary search over the speed k valid?
  options: ["The piles are given to you in sorted order", "The answer always lies at the median pile", "Each pile can be split across several hours", "Hours needed never increase as k grows"]
  answer: 3
  explanation: >-
    Total hours is a sum of ceil(p / k), each non-increasing in k, so feasibility is false for every speed below the answer and true from it upward. Binary search finds the first true in about log₂ M checks. The piles need not be sorted, since the search is over speeds, not over the array.
- q: >-
    A candidate writes lo = mid on a feasible check in a lower-bound binary search where mid = (lo + hi) // 2. What happens on a two-element range?
  options: ["It skips the answer and ends early", "It loops forever, as mid equals lo", "It works, as floor division rounds up", "It returns an index one too high"]
  answer: 1
  explanation: >-
    With lo and hi adjacent, (lo + hi) // 2 equals lo, so lo = mid changes nothing and the loop never ends. The invariant (everything below lo is infeasible, hi is feasible) forces lo = mid + 1 on an infeasible mid and hi = mid on a feasible one, which always shrinks the range.
- q: >-
    At 12:55 the interviewer asks "if speed 5 works, what can you say about 6?" and the candidate derives the full approach within ten seconds. How is that typically recorded?
  options: ["Not a hint at all, since it was phrased as a question", "Led through the solution, below the bar for the dimension", "A small nudge, converted quickly; minor weight", "A core-idea hint that caps the algorithm score"]
  answer: 2
  explanation: >-
    A question that supplies one fact (monotonicity) but not the technique is a level-1 nudge, and what follows sets its weight: turning it into binary search, the complexity and the invariant within seconds reads as nearly unassisted. Being phrased as a question does not stop it counting as a hint; the core idea would be naming binary search on the speed.
- q: >-
    You believe "always take the largest coin that fits" solves Coin Change but cannot say why. What is the best move?
  options: ["Compare it with a brute force on small amounts", "Ask the interviewer whether greedy is correct", "Keep it, since it passes the typical coin sets", "Code it and test it on the given example"]
  answer: 0
  explanation: >-
    That is kind 6, and the move is a counterexample hunt: with coins [1, 3, 4], greedy matches the minimum up to amount 5 and fails at 6 (4 + 1 + 1 against 3 + 3). The example may pass by luck, and asking whether greedy is correct hands the interviewer the question you should be answering.
- q: >-
    Two candidates end with the same correct Koko code. One stated the stuck point at 10:30 and asked a specific question at 12:40; the other was silent until 15:20 and needed a core-idea hint at 17:00. What mainly separates their algorithm ratings?
  options: ["Whether they used Python or a compiled language", "The total number of questions each one asked", "How much of the solution was theirs, and when", "Only the final code, which is identical here"]
  answer: 2
  explanation: >-
    The algorithm dimension is typically rated hint-adjusted: the first candidate supplied the check, the technique, the complexity and the invariant after one small nudge; the second was given the technique late, which also squeezed testing. Identical final code does not erase that, and question count or language are not what the debrief weighs.
```

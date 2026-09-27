---
slug: getting-unstuck
title: "Getting unstuck: recognising it, diagnosing it, recovering gracefully"
description: How to notice you are stuck within a minute, which of six kinds of stuck you are in, the moves that unblock each one, how to ask for and use a hint, and when to switch approaches or ship the brute force.
minutes: 22
difficulty: medium
tags: [interview, problem-solving, hints, recovery, stuck]
problems: [daily-temperatures, subarray-sum-equals-k, koko-eating-bananas]
---
Minute 14. You have a brute force, you know it is O(n²), you know n is 10⁵, and nothing is coming. You re-read the problem. You stare at the example. You try the same idea again, a little differently. Three minutes pass without a word. The interviewer shifts in their chair.

Every strong candidate gets stuck. Interviewers pick problems at the edge of what a candidate can do precisely so that they can watch what happens next. The moment of being stuck is not a failure mark; the next three minutes are the assessment. A candidate who says "I'm stuck on how to avoid rescanning; let me try it by hand on a small example" and gets there with one nudge often scores better than one who recalled the answer instantly, because the interviewer saw how they think. A candidate who goes silent for eight minutes and then guesses scores badly even if the guess is right.

This lesson is the recovery playbook: how to notice you are stuck early, how to work out which kind of stuck it is, which moves unblock each kind, how to ask for a hint well, and when to change approach or fall back to the brute force.

## Notice it within a minute

The costliest part of being stuck is the time before you admit it. These signals mean you are stuck, whatever it feels like:

- You have said the same idea twice.
- Two or three minutes have passed with no new information on the screen: no new example, no new observation, no new line of code.
- Your code is growing special cases (`if i == 0`, `if i == n - 1`, `if len(stack) == 1`). A stream of special cases usually means the approach or the invariant is wrong, not that you need one more case.
- You are trying to *remember* rather than *derive*: "I've seen this… what was the trick?"
- The interviewer has asked "are you sure?" or repeated a question. They are telling you something.

When you notice one, say so out loud within seconds: "I'm going in circles. Let me step back." That sentence alone changes how the next minutes are read. Visible, structured thinking is being evaluated; silent flailing is just time passing.

## Diagnose which kind of stuck

"Stuck" covers several different situations, and each has a different first move.

| Kind of stuck | What it feels like | First move |
|---|---|---|
| 1. The problem is unclear | You cannot work out the right answer for an example by hand | Solve a small example by hand, slowly, out loud; re-read the statement |
| 2. No approach at all | You cannot even say a brute force | Describe the search space: what are all the candidate answers, and how would you check each one? |
| 3. Brute force, no optimisation | You know it is too slow and cannot see better | Name the repeated work; ask "what would make this easy?"; sweep the pattern signals |
| 4. Approach, but the details will not work | The idea seems right but the code keeps needing special cases | Write the invariant in one sentence; solve a simpler version first |
| 5. The code is wrong | The output does not match | Shrink to the smallest failing input and trace it |
| 6. You cannot justify it | It seems to work, but you cannot say why | Hunt for a counterexample on tiny inputs |

Kinds 1 and 2 are rarer than they feel. Most interview stuckness is kind 3, and most of the rest is kind 4.

## The toolbox

### Solve it by hand, slowly

Your hands often know the algorithm before your head does. Take [Daily Temperatures](/practice/daily-temperatures): for each day, how many days until a warmer one? Temperatures `[73, 74, 75, 71, 69, 72, 76, 73]`, expected `[1, 1, 4, 2, 1, 1, 0, 0]`.

Do it by hand and narrate what you actually keep track of. 73: the next day is 74, so 1. 74: 75, so 1. 75: now I'm waiting… 71 is not warmer, 69 is not, 72 is not, 76 is, so 4. Doing it again left to right, you notice that you were holding a *pile of days still waiting for a warmer day*: 75, 71, 69. When 72 arrives it resolves 69 and 71 (the most recent first) but not 75. When 76 arrives it resolves 72 and 75. The pile only ever resolves from the top, and the temperatures in it are decreasing from bottom to top. That is a monotonic stack, and you derived it from your own bookkeeping. The [monotonic stack pattern](/learn/interview-patterns/sequence-patterns/monotonic-stack-pattern) lesson has the template.

### Name the repeated work in the brute force

Say the brute force out loud, then ask: *what does the inner loop recompute that an earlier iteration already knew?* For daily temperatures, the inner scan from day i walks past days that an earlier scan has already resolved. For "subarray sum equals k", the inner loop recomputes sums that a running prefix sum already holds. Naming the repeated work usually names the data structure that stores it.

### Ask "what would make this easy?"

List the properties that would make the problem trivial, then ask which ones you can afford to create.

- If the input were sorted: two pointers or binary search. Can I sort? It costs O(n log n) and loses the original order; is order needed?
- If I knew the answer for every prefix: DP or prefix sums. Can I build that left to right?
- If values were small: a counting array. Are they bounded?
- If it were a graph: BFS or DFS. What are the nodes and edges?
- If I could check a candidate answer quickly: binary search on the answer. Is "can it be done with speed or capacity X?" monotone in X? That is exactly the key to [Koko Eating Bananas](/practice/koko-eating-bananas).

### Sweep the pattern signals

Run the checklist from [pattern recognition](/learn/foundations/problem-solving/pattern-recognition) deliberately, out loud if necessary. Contiguous range → sliding window or prefix sums. Sorted input or a sortable one → two pointers or binary search. "k-th", "top k" → heap or quickselect. Dependencies or ordering constraints → topological sort. "All combinations" → backtracking. "Minimum number of", "number of ways" → DP. "Next greater" → monotonic stack. Thirty seconds of sweeping beats three minutes of hoping.

### Relax a constraint, then restore it

Solve an easier version first, then ask what breaks when you add the constraint back. [Subarray Sum Equals K](/practice/subarray-sum-equals-k): count the contiguous subarrays that sum to k.

- **Relaxed: all values positive.** Then a sliding window works: extend right; while the sum exceeds k, shrink from the left; count when it equals k. Shrinking always lowers the sum, so the window logic is sound.
- **Restore negatives.** Shrinking no longer reliably lowers the sum, so the window breaks. What survives from the relaxed version is the running sum. A subarray `i..j` sums to k exactly when `prefix[j+1] - prefix[i] = k`, so for each prefix you need the number of *earlier* prefixes equal to `prefix - k`. A hash map of prefix counts gives that in O(1) per step.

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

Check it on `[1, -1, 1]` with k = 1. The prefixes are 1, 0, 1. At prefix 1, one earlier prefix equals 0 (the empty one), so count = 1. At prefix 0, none equals −1. At prefix 1, two earlier prefixes equal 0, so count = 3. The answer is 3: `[1]`, `[1]` and `[1, -1, 1]`. The relaxed version did not solve the problem, but it isolated exactly which property the real solution had to replace.

### Work backwards from the target complexity

If you know or suspect the target, list what fits in it. O(n log n): sort first, or do O(log n) work per element with a heap, binary search or a balanced tree. O(n): a single pass with a hash map, a stack, a deque or two pointers. O(log n): binary search on the index or on the answer. Asking "if this were O(n log n), where would the log come from?" is a legitimate and often fast route to the idea.

## Asking for a hint

A hint is information. Asking for one well is a skill, and it is scored.

**When.** After about three to five minutes of visible, structured effort without progress, or sooner if the clock says so (for example, you are at minute 17 with no approach). Asking in the first thirty seconds signals that you are not trying; asking at minute 30 means the hint arrives too late to use.

**How.** Ask a specific question that shows where you are, not a generic "can I have a hint?"

> "I can see the brute force re-scans days that are already resolved. I'm thinking about keeping the unresolved days somewhere, but I'm not sure what structure lets me resolve them in order. Is that the right direction?"
>
> "I'm deciding between sorting and a heap here. Is either of those closer to what you have in mind?"

A specific question often earns a small, precise hint ("which unresolved day gets resolved first?"), and a small hint that you turn into the solution reads far better than a large one you are handed.

**Using the hint.** Repeat it back in your own words, connect it to what you already had, and continue from where you were. Do not restart from scratch, and do not pretend you were about to say it. The [communicating while solving](/learn/foundations/problem-solving/communicating-while-solving) lesson covers this in detail.

**The honest cost.** Interviewers record hints. One small hint rarely decides a senior hire, especially if you used it well and the rest of the round was strong. Several large hints on the core idea usually mean a weak score on the algorithm dimension, but the round can still be rescued on code quality, testing and communication. What almost never helps is eight minutes of silence to avoid a hint; that costs more than the hint would have.

## Switching approaches gracefully

Sometimes you realise, halfway through coding, that the approach cannot work: a greedy choice has a counterexample, or a window cannot handle negatives. Sunk cost pushes you to patch. Resist it, and make the switch visible:

> "I'm going to stop here. This window approach can't handle negative values, because shrinking doesn't guarantee a smaller sum; here's the counterexample. I could keep patching it, but prefix sums with a hash map handle negatives naturally. I'll switch. The input parsing and the test cases carry over."

This does three things: it shows you found the flaw yourself, it justifies the switch with a concrete reason, and it keeps what can be salvaged. Deleting fifty lines silently and starting again looks like panic. The same change, narrated, looks like judgement.

## The fallback: ship the brute force

At around minute 20 with no optimised approach, change goal. Write the brute force cleanly, test it, and say where the bottleneck is:

> "I'll code the O(n²) version now so we have something correct and tested. The bottleneck is the inner scan; if there's time afterwards I'll come back to that."

Be honest with yourself about what this buys. For a medium problem at a top company, brute force alone is usually not enough for a strong rating on the algorithm dimension. It is still far better than nothing: it earns code-quality and testing credit, it gives the interviewer something concrete to ask about, and the optimisation surprisingly often appears once working code is on the screen and you can see the repeated work in it.

## Managing the adrenaline

Being stuck in front of someone triggers a stress response that narrows your thinking exactly when you need it wide. Three things help, and none of them are mystical:

- **Announce a short silence.** "Let me think quietly for thirty seconds." Announced silence is fine; unannounced silence of two minutes is not. Then actually think, ideally on paper or in a comment.
- **Write something down.** Restate the problem in a comment, write out a small example, or list the constraints. Externalising frees working memory and gives you something to look at other than the blank editor.
- **Slow your breathing.** A long exhale takes three seconds and is invisible on video.

## The same moment, weak and strong

The problem is Daily Temperatures, and the candidate has the O(n²) brute force.

**Weak:**

> **Candidate:** So that's O(n²)… *(silence, 2 minutes)* … Maybe I could sort it? *(silence, 1 minute)* … Hmm, no, sorting loses the positions. *(silence, 2 minutes)* … Could you give me a hint?
>
> **Interviewer:** Think about which days are still waiting for an answer.
>
> **Candidate:** OK. *(starts writing a new, different nested loop)*

**Strong:**

> **Candidate:** The brute force is O(n²) because each day scans forward. I'm not seeing the improvement yet, so let me do the example by hand and watch what I track. 73: next is warmer, 1. 74: 1. 75: I have to wait; 71, 69, 72 don't beat it… I'm holding 75, 71 and 69 as "waiting". When 72 comes, it answers 69 and 71, newest first, but not 75. So the waiting days form a pile I only resolve from the top, and their temperatures decrease toward the top. That's a stack of indices. Each day is pushed once and popped once, so it's O(n). Does that sound right before I code it?

The strong candidate never needed the hint, but notice *why*: they did not wait for inspiration. They said where they were, chose a tool from the toolbox (solve it by hand), and narrated the observation that produced the idea. Even if they had needed the hint, the interviewer would have seen a clear process.

## Practising being stuck

You cannot practise recovery on problems you already know. Use unfamiliar problems deliberately:

- Start a solo coding interview on `/interviews` at hard difficulty, where you are more likely to get stuck. The mock interviewer behaves like a real one: if you are stuck for a while it offers a nudge as a question, not the answer, and it notes internally that a hint was given. Afterwards, read the transcript for the minutes before you asked for help and check whether you named what you were stuck on.
- On the practice list, pick problems you have not seen, set a 20-minute timer, and when it rings, open the first hint whether or not you feel close. This trains the "use the hint and keep moving" reflex instead of the "suffer silently" one.
- After each session, label every stuck moment with its kind from the table above. Within a few weeks you will know which kind you fall into most, and which tool fixes it.

## Senior signals

- You say "I'm stuck on X" within a minute or two, naming the specific sub-problem rather than the whole problem.
- You diagnose which kind of stuck you are in and pick a matching tool, rather than waiting for inspiration.
- You ask for hints with a specific question that shows your current position, and you integrate the hint visibly.
- You switch approaches out loud, with a concrete counterexample or reason, and salvage what carries over.
- You fall back to a clean, tested brute force at a sensible checkpoint instead of running out of time with nothing working.
- You treat a string of special cases in your code as evidence that the approach is wrong.

## Check yourself

```quiz
- q: >-
    Your sliding-window code has grown three special cases for the start of the array, and each fix breaks another test. What does this most likely indicate?
  options: ["The tests are probably wrong, so question the expected output", "The window just needs to start at index 1 instead of 0", "You need one more special case to cover the last input", "The invariant or approach is wrong; restate it first"]
  answer: 3
  explanation: >-
    A growing list of special cases is one of the clearest signs of being stuck: step back and restate the invariant or reconsider the approach. Correct window code rarely needs them; they appear when the invariant is not actually maintained or the technique does not fit the problem, for example when negative values break the window. Another special case or a shifted start index only moves the failure.
- q: >-
    Which is the most effective way to ask for a hint?
  options: ["Ask for one within the first minute, to save time", "Wait until minute 35, so you have tried everything", "Say what you tried; ask if a direction is right", "Ask to see the solution so you can explain it back"]
  answer: 2
  explanation: >-
    A specific question, such as whether a particular structure is the right direction, shows your reasoning, usually earns a small and precise hint, and makes it easy to integrate. Asking immediately signals no effort; asking at minute 35 leaves no time to use the hint; asking for the solution gives the interviewer nothing to assess.
- q: >-
    For "count subarrays summing to k", you solved the all-positive case with a sliding window. What does restoring negative values break, and what replaces it?
  options: ["The problem becomes NP-hard, so switch to backtracking", "Sorting the array first restores the window property", "Shrinking can raise the sum; use prefix-sum counts", "Nothing breaks; the window logic still holds as is"]
  answer: 2
  explanation: >-
    The window relies on shrinking always lowering the sum, which negative values violate. A subarray sums to k exactly when two prefix sums differ by k, so a hash map counting earlier prefixes equal to prefix − k gives an O(n) solution. Sorting destroys contiguity, so it cannot help.
- q: >-
    At minute 21 you have no optimised approach for a medium problem. What is the most sensible fallback?
  options: ["Keep searching for the optimal approach until the end", "Write pseudocode for an approach you are unsure about", "Code and test the brute force; name the bottleneck", "Ask to end the round early and try another problem"]
  answer: 2
  explanation: >-
    Working, tested code earns credit on code quality and testing, gives the interviewer something concrete to probe, and often makes the repeated work visible enough to find the optimisation. It is usually not enough on its own for a strong algorithm score, but it beats running out of time with nothing that works.
- q: >-
    Halfway through coding, you find a counterexample to your greedy approach. What is the best way to switch?
  options: ["Keep patching the greedy to avoid wasting the code", "State the counterexample, switch, reuse what fits", "Ask whether the counterexample really needs handling", "Quietly delete the code and start again from scratch"]
  answer: 1
  explanation: >-
    Narrating the switch (the counterexample, why the new approach handles it, and which parts carry over) shows that you found the flaw and are choosing deliberately. Silent deletion looks like panic, patching a provably wrong approach wastes time, and questioning a valid counterexample reads as defensive.
```

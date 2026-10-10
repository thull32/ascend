---
lesson: greedy-pattern
source: 995623e9b83e0970
fit: partial
desk:
  - "The three loop templates in Python and JavaScript, and the brute-force checker"
  - "The near-misses table: each tempting rule with the input that breaks it"
  - "The exchange argument carried out on five intervals, as a table"
  - "The traces: Jump Game II, Gas Station, Partition Labels, Valid Parenthesis String, Hand of Straights"
  - "The variations table, and the sort and comparator measurements"
  - "Exercises: minimum jumps, and the gas station start"
---
## Introduction

"Fewest jumps to reach the end." "Which station can you start from." "Split the string into as many pieces as possible." The DP version of each is quadratic and correct. The greedy version is linear, and correct only if one specific argument holds: that a locally best choice never needs to be revisited.

Candidates fail greedy problems in two opposite ways. Some propose a rule that feels right and is wrong, like largest coin first. Others write the quadratic DP for a problem that was begging for a single pass, and time out. On 10 thousand elements, the Jump Game DP took 666 milliseconds in CPython, and the greedy took a third of a millisecond.

So the pattern is not "be greedy". It is: name the local rule, then give the reason no later information can make you regret it. That reason comes in one of three shapes. Four things, then: the signal, how to kill a wrong rule in thirty seconds, the three argument shapes, and the worked problems that use each.

## The signal

Reach for greedy when the statement has a superlative and one of a few structures. A running summary of one or two numbers is all the past you need: the furthest reach, the best so far, the current balance. A reset argument exists: if a prefix fails, no start inside it can succeed. Sorting reveals the order of decisions, so the earliest-ending or smallest element has only one sensible choice. A boundary only ever grows. A range of possible values can be tracked as an interval, its minimum and maximum, instead of branching. Or the most constrained item goes first, fed by a heap.

What rules it out? A counterexample to the rule. If you can build one in thirty seconds, use DP. If you can build neither a counterexample nor an argument, say so and choose DP, because a wrong greedy is worse than a slow DP. Greedy is also out when the choice depends on state the summary drops: in House Robber, whether to take this house depends on whether you took the last one, so it is DP with two variables. And when you need a count, or all solutions, because greedy commits to one optimum.

The confusable pattern is exactly that two-variable DP, which is also linear with constant state. The test: does each step commit, or does it keep both options open, the better of take and skip? Name the invariant and the label stops mattering.

## Killing a wrong rule

Have these counterexamples ready, because each answers a question you will be asked.

Fewest coins with denominations 1, 3 and 4, amount 6. Largest first gives 4, 1, 1, three coins. The optimum is 3 and 3, two.

The knapsack where you cannot split items, capacity 50: items of 10 kilos worth 60, 20 kilos worth 100, and 30 kilos worth 120. Best value per kilo takes the first two, worth 160. The optimum takes the second and third, worth 220.

Most meetings in one room. Shortest first fails on three meetings, 1 to 5, 4 to 7, and 6 to 10: the shortest, 4 to 7, overlaps both others, so it keeps one meeting where two fit. Earliest start fails on 0 to 10, 1 to 2 and 3 to 4: it takes the long one and keeps one, where two fit. Earliest finish is the rule that works.

Notice the shape. A rule that ignores what the choice uses up, weight, time after it ends, the next jump's reach, fails on three items.

And the habit that separates a senior answer: test the rule against brute force on random small inputs before trusting it. On 2 thousand random sets of six intervals, shortest first failed 52 times, first at trial 29. Earliest start failed 408 times, first at trial 3. Earliest finish never failed. Largest coin first, on random three-coin systems containing a 1, failed on 291 of 2 thousand cases. A wrong greedy is found in seconds by a test you can write in two minutes.

## Three argument shapes

The first is exchange. Take any optimal solution that differs from greedy's. Swap its first differing choice for greedy's, show the result is still feasible and no worse, and repeat until it equals greedy's. For earliest finish: the first meeting of any optimum can be replaced by greedy's first, which ends no later, so everything after it still fits. Each swap can only leave more room, and the count never drops, so greedy's count is optimal.

The exchange also tells you when greed breaks. Give each meeting a value. The swap still keeps feasibility, but it can lose value: replacing a meeting from 0 to 4 worth 5 with one from 0 to 2 worth 1. The exchange no longer proves "no worse", so the weighted version is DP: sort by end, and for each job take the better of skipping it, or its value plus the best answer for the last job that ends by the time it starts, found by binary search. Order n log n.

The second is greedy stays ahead. Name a quantity greedy maximises after every step, and show by induction that no strategy is ever ahead. The third is reset, or dominance: if a prefix fails, every start inside it fails too, so skipping it loses nothing.

Say which one you are using. "Greedy works here" with no shape is the sentence interviewers push back on, and "it leaves the most room" is the intuition, not the proof.

## Stays ahead and reset, worked

Jump Game II: each value is the longest jump from that index, and you want the fewest jumps to the end. Think of it as breadth-first search over indices. Level k is the set of indices reachable in exactly k jumps, and it is one contiguous range, because from any index you may also jump shorter. Sweep the current level, track the furthest index any member reaches, and that becomes the end of the next level.

On 2, 3, 1, 1, 4: from index 0 you reach indices 1 and 2. Of those, index 1 reaches 4, the end. Two jumps. Jumping as far as possible from where you stand goes 0, then 2, then 3, then 4: three jumps. The right rule looks at the whole level, not the landing square. The argument is stays ahead: after k jumps, the level's end is the furthest index reachable in at most k jumps. One trap: loop only to the second-last index, or a level that ends exactly on the last index counts one jump too many.

Gas Station: a circular road, gas picked up at each station, a cost to reach the next. Two facts. If total gas covers total cost, a start exists. And the reset: if, starting at s, you first run dry leaving station i, then no station between s and i works either. Why? Before I tell you, think about what a later start gives up.

[pause]

Every stretch from s to a later station had a non-negative surplus, or the scan would have reset earlier. Starting later gives that surplus up, so you reach i with no more fuel than before, and still fail. So restart at i plus one, with an empty tank. One pass suffices on a circle, as long as you also keep the total: forget the total check and the scan always ends with some start, even when no tour exists.

## Boundaries, ranges and forced moves

Partition Labels: split a string into as many parts as possible so each letter appears in only one part. A part containing a letter must stretch to that letter's last occurrence. So sweep, push the part's end out to the furthest last occurrence of any letter seen, and close the part when you reach that end. The lesson's 24-letter string splits into parts of 9, 7 and 8. Closing earlier is invalid; closing later merges parts and lowers the count.

Valid Parenthesis String has open brackets, close brackets, and stars, which may be either or nothing. Backtracking branches three ways per star; DP is quadratic. The greedy tracks the range of possible open counts: a low, as if every star closed or vanished, and a high, as if every star opened. Fail if the high goes negative. Clamp the low at zero, since a star read as a close can be read as empty instead. Accept if the low ends at zero. On open, star, close, close: the low goes 1, 0, 0, 0 after clamping, and the high goes 1, 2, 1, 0. Valid, with the star read as an open. It works because the achievable counts always form a contiguous range, so two integers describe the set exactly.

Hand of Straights: can the cards be split into runs of w consecutive values? The smallest card left cannot sit in the middle or at the end of a run, because nothing smaller remains to precede it. So every copy of it must start a run. A forced move is the strongest kind of greedy argument.

The cost of all of these is the scan, linear, plus whatever puts the input in decision order. Sorting a million intervals by end took just over a quarter of a second in CPython, so the sort, not the sweep, is the running time.

## Traps in the details

Touching intervals. Meetings are usually half-open, so one ending at 5 and one starting at 5 are compatible. Balloons popped by arrows are closed, so balloons touching at one point share an arrow. Decide which from the statement, and write the comparison with a comment.

JavaScript sorting has two traps. With no comparator, it compares as strings, so 10, 9, 1, 2 sorts as 1, 10, 2, 9. And a comparator that returns a boolean, "a greater than b", gets false read as zero, meaning equal, so the sort learns nothing: in Node, 3, 1, 2 came back unchanged. Both pass small tests that happen to be sorted. Return the difference.

## In the interview

"The array is spread over 100 machines. Find the maximum subarray sum."

[pause]

Running Kadane per machine and taking the largest misses every subarray that crosses a boundary. Instead, each machine sends four numbers: its total, its best prefix, its best suffix, and its best subarray. Two adjacent summaries combine in constant time: the best of the pair is the larger of each side's best and the left suffix plus the right prefix. Merge them in a tree. For Gas Station the summary is the total and the minimum prefix.

"Count the optimal schedules", or "return every optimal partition." Greedy produces one optimum and says nothing about the others. Counting needs a DP over the same order; listing needs backtracking. Rerunning the greedy with shuffled ties is the wrong answer.

## Recap

Five things to remember. Greed is a rule plus an argument: exchange, stays ahead, or reset, and you say which. Keep the counterexamples ready: coins 1, 3, 4 for amount 6; three items for best value per kilo; shortest meeting first; jump as far as possible on 2, 3, 1, 1, 4. Test a rule against brute force on random small inputs, where wrong rules fail within dozens of trials. Weights break the exchange, so weighted scheduling is DP with binary search. And the sort is the running time, so sort by the key the argument needs, with a numeric comparator.

At your desk: the three templates and the checker, the counterexample table, the exchange carried out as a table, the five traces, and the exercises on minimum jumps and the gas station.

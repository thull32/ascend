---
lesson: greedy-and-exchange-arguments
source: 73fb70e3d5408430
fit: partial
desk:
  - "The eleven-activity instance, the swap table and the stays-ahead table"
  - "The coin-change DP visualisation and the is-canonical brute-force code with its verdict table"
  - "The comparison table of greedy rules that work and fail, and the greedy-versus-alternatives table"
  - "Kadane's algorithm: the visualisation and the five-line code"
  - "Exercises: minimum boats with a two-person limit, and fractional knapsack by value density"
---
## Introduction

You have thirty conference rooms' worth of meeting requests and one room. Pick the schedule that fits the most meetings. The instinct is immediate: take the meeting that ends earliest, throw away everything it overlaps, repeat. That instinct is correct, and the whole algorithm is a sort and a loop.

Now make change for 6 cents with coins worth 1, 3 and 4. The same instinct says take the biggest coin first: a 4, then 1, then 1. Three coins. The right answer is 3 plus 3, two coins. The instinct is wrong, and no amount of care in the loop will fix it.

Both algorithms are greedy. They make the locally best choice, commit to it, and never look back. The difference is not in the code but in a property of the problem. Three things, then: the property you need and the exchange argument that proves it, the counterexamples that break it, and a one-minute procedure for deciding greedy or dynamic programming in an interview.

## What greedy means, and the property you prove

A greedy algorithm builds a solution one decision at a time, picks whatever looks best right now by a fixed rule, earliest finish, largest coin, highest value per kilogram, and never revisits a decision. That makes it cheap: no branching, no table of subproblems. Usually order n log n for the sort and linear for the loop.

It also makes it fragile. Dynamic programming and backtracking explore alternatives and can recover from a bad early choice. Greedy cannot. So greedy is only correct when a bad early choice is impossible.

Textbooks name two conditions. The first is the greedy-choice property: some optimal solution contains the greedy choice. Listen to the word "some". Not every optimal solution, because ties exist. Not "the greedy choice looks best", because that is the definition of greedy, not of correctness. Just: at least one optimal solution agrees with it.

The second is optimal substructure. After the greedy choice, what remains is a smaller instance of the same problem. Dynamic programming needs this too. The difference is that DP tries every first choice and greedy tries one.

The greedy-choice property is the one that fails on real problems, and it is the one you prove. The standard tool is the exchange argument.

## The exchange argument

Take activity selection: intervals, choose the largest set with no two overlapping, and the rule is always take the remaining interval with the earliest end.

The argument goes like this. Take any optimal solution and look at its first activity. Greedy's first pick has the earliest end of all activities, so it ends no later than that one. Swap it in. Every other activity in the optimal solution started after the old first one ended, so they all start after greedy's pick ends too. The solution is still feasible, still the same size, so still optimal, and now it agrees with greedy on the first choice. Remove that pick and everything it overlaps, and induction does the rest.

Here it is on the lesson's instance, said with four activities. Greedy picks A, which runs from 1 to 4, then D from 5 to 7, then H from 8 to 11, then K from 12 to 16. Four activities. Another optimal answer is B, D, I and K, where B runs 3 to 5 and I runs 8 to 12. It disagrees with greedy in two places. Swap A in for B: A ends at 4, no later than B's 5, so D, starting at 5, still fits. Swap H in for I: H ends at 11, before I's 12, so K, starting at 12, still fits. Each swap keeps the count at four and never moves a finish time later. You have walked an arbitrary optimum into greedy's answer.

That is the whole template. Take an arbitrary optimal solution. Find the first place it disagrees with greedy. Swap in the greedy choice and show it is still feasible and no worse. Repeat.

In an interview it is three sentences. "Suppose an optimal schedule doesn't start with the earliest-ending meeting. Replace its first meeting with the earliest-ending one; nothing overlaps because it ends no later. So there is an optimal schedule that starts with the greedy choice, and I recurse." An interviewer who hears that stops worrying about correctness.

A second proof style is called greedy stays ahead. You show that after k steps, greedy's partial solution is at least as good as any other k-step partial solution, by some measure. For activity selection the measure is the finish time of the k-th activity: greedy's is never later. So if another solution had a fifth activity, it would start after that solution's fourth finish, which is after greedy's fourth finish, and greedy could have taken it too. Use stays ahead when the choice is about a running quantity, furthest reach, earliest finish. Use exchange when it is about which element to include.

## Where greedy fails

The counterexamples matter more than the proofs, because in an interview you find the counterexample first.

Coins. With 1, 3 and 4, and an amount of 6, no optimal solution contains a 4, so the greedy-choice property fails at the first step. Yet largest-first is correct for US coins, 1, 5, 10 and 25, at every amount. Systems where largest-first always works are called canonical. US, Euro and UK coins are canonical. 1, 3 and 4 is not, and nor was pre-decimal British coinage.

Here is the result worth remembering. Kozen and Zaks proved in 1994 that if a coin system is not canonical, its smallest counterexample lies below the sum of its two largest coins. So a brute-force comparison of greedy against the DP over that range is a complete test. A customer configures 1, 5, 10, 21 and 25. Check every amount below 46, and you find 31: greedy pays 25, 5 and 1, three coins, while 21 plus 10 is two. And the DP fallback is cheap: an amount of 10 thousand with 12 denominations is about 120 thousand inner steps, on the order of 10 milliseconds in CPython. So greedy coin change is never the right algorithm for arbitrary denominations. Coin Change is a DP problem.

Knapsack. Capacity 50. Three items: 10 kilograms worth 60, 20 kilograms worth 100, 30 kilograms worth 120. Value per kilogram: 6, 5 and 4. If you may take part of an item, greedy by ratio takes the first two whole, then two thirds of the third for 80. Total 240, and that is optimal: if an optimal load carries a low-ratio item while leaving a higher-ratio one behind, shift weight toward the better ratio and the value can only rise.

Now whole items only. Greedy by ratio takes the first two, 30 kilograms, 160, and the third does not fit. The optimum is the second and third, exactly 50 kilograms, 220. The exchange breaks because you cannot move part of an item. Same data, same rule, and one word in the problem statement decides whether it works.

[pause]

Weights on intervals. Give each meeting a value and maximise total value instead of count. One long meeting from 0 to 10 worth 10, and three short ones worth 1 each inside it. Earliest-end greedy takes the three short ones for 3. Look at where the exchange breaks: swapping in the earliest-ending activity keeps the schedule feasible, but it can now lower the value, so "no worse" fails. Weighted interval scheduling is a DP: sort by end, binary search for the last compatible activity, order n log n.

One sentence of theory sits under some of this. A matroid is a set system with a particular exchange axiom, and on any matroid "sort by weight, add each element if it stays independent" is optimal. Acyclic edge sets form one, which is exactly why Kruskal works. But matroids are sufficient, not necessary: activity selection is not a matroid, and greedy still works there. So prove greedy directly, and keep matroids as the answer to "why does Kruskal work?".

## Deciding greedy or DP in a minute

You cannot spend ten minutes on a proof. The procedure takes about a minute out loud.

First, state the greedy rule as one sentence. If you cannot, it is not a greedy problem. Second, try to break it with five elements or fewer: two or three coins, three or four items, a short interval in a bad place. Real greedy failures almost always have tiny counterexamples. Third, if you broke it, say so and go to DP: "The greedy choice can be wrong here, for example 1, 3, 4 and 6, so I'll define a subproblem instead." That sentence is worth more than a correct greedy you cannot justify. Fourth, if you could not break it, sketch the exchange, then code.

Signals that lean greedy: a count, a maximum number of non-overlapping things, a minimum number of covers, or feasibility, plus a natural ordering. Large constraints, 100 thousand and up, argue against a quadratic DP. Signals that lean DP: values that must combine exactly to hit a target, or the word "ways". Counting problems have no single best choice to commit to.

Kadane's algorithm for maximum subarray sits on the border. Walk the array keeping the best sum of a subarray ending here, and at each element keep the larger of the element alone or the running sum plus the element. Read as DP, it is a one-dimensional table with one number of state. Read as greedy, it says a prefix with negative sum can never help, so drop it. Saying "this is a DP with a greedy justification for why the state is one number" signals seniority.

## The sort is the cost

A greedy algorithm is a sort followed by a linear pass, so its running time is the sort's. Two practical traps. In Python, a key function is called once per element, while a comparison function wrapped with cmp to key runs Python code on every comparison and was about five times slower on 100 thousand floats. In JavaScript, the default sort compares as strings: 10, 9 and 2 come out as 10, 2, 9, which silently breaks any greedy that sorts numbers. And ranking by value per unit weight divides by weight, so a zero-weight item crashes Python or gives infinity and not-a-number keys in JavaScript. Compare densities by cross-multiplying integers instead.

Greedy also runs production systems, usually as a heuristic rather than an exact algorithm. Kubernetes' default scheduler scores nodes and binds each pod to the best, with no backtracking. Bin packing is NP-hard, and first-fit-decreasing, sort descending and put each item in the first bin with room, uses at most 11 ninths of the optimum plus 6 ninths of a bin. Greedy set cover is within about the natural log of n. The senior move is to say which kind you are proposing: exact, with a proof, or a heuristic, with a bound.

## In the interview

"The denominations are now configurable by the customer. Still greedy?"

[pause]

No. Greedy is only correct for canonical systems, and a customer can configure 1, 3 and 4. Either run the Kozen and Zaks brute force when the set is configured and reject non-canonical sets, or switch to the DP, which is cheap at realistic amounts. The wrong answer is "as long as there's a 1-coin, greedy always returns a valid answer". True, and irrelevant: valid is not minimal.

"Now each meeting has a value. Same algorithm?" No. Weighted interval scheduling is a DP over meetings sorted by end, with a binary search for the last compatible one. The wrong answer is "sort by value per unit time", the fractional-knapsack instinct applied to something you cannot split.

And the basic one: "How do you know the greedy is correct?" Name the rule, then the exchange in three sentences. "I ran it on the examples and it matched" is evidence, not proof, and the interviewer's next input is the counterexample.

## Recap

Four things to remember. Greedy is correct when some optimal solution contains the greedy choice, and the exchange argument proves it: take any optimum, swap in greedy's choice at the first disagreement, show it is still feasible and no worse. Try to break the rule with five elements before you defend it. Coins 1, 3, 4 at 6, and whole-item knapsack at 160 against 220, are the counterexamples to carry. And a production greedy is usually a heuristic, so name its bound.

At your desk: the activity and swap tables, the coin-change DP and the is-canonical check, the comparison tables, Kadane's code, and the two exercises, minimum boats and fractional knapsack.

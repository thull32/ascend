---
slug: combinatorial-patterns
title: Backtracking, DP, greedy & design
description: The six patterns behind the hardest quarter of the interview canon, from backtracking and dynamic programming to greedy proofs, bit tricks, math and the design-a-data-structure round.
prerequisites: [algorithms/dynamic-programming]
---
The problems in this module are the ones candidates fear: "generate all", "minimum number of", "is it possible to", "design a class that supports these operations in O(1)". They are also the ones where the pattern, once named, does the most work. A backtracking problem is a choose-explore-unchoose loop with a pruning rule. A DP problem is a state definition and a recurrence, and the six shapes of state cover nearly every interview question. A greedy problem is a one-line local rule plus a one-paragraph argument for why it is safe. Bit manipulation and math problems have a small bag of tricks each. Design problems compose two data structures you already know.

Each lesson opens with the signal that selects the pattern and, just as importantly, the signal that rules it out: the phrase that makes a problem greedy rather than DP, or backtracking rather than DP. The template is given in Python and JavaScript and then two or three Ascend 150 problems are traced through it with the recursion tree, the DP table or the greedy state written out. Variations cover the follow-ups; pitfalls cover the bugs that surface under pressure, from missing the unchoose step to off-by-one in a DP base case.

The order is deliberate. Backtracking comes first because DP is what you reach for when backtracking's subproblems repeat. Greedy follows DP because the way to justify greed is to show that the DP collapses. Bit manipulation and math are short, specific toolkits. Design closes the module because it draws on everything before it and is the round most often used to separate senior from mid-level: not "can you code it" but "can you name the trade-off and choose".

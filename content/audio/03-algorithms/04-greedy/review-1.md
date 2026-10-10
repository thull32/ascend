---
review: greedy
source: 3cb2d268c5c760d9
---
## Introduction

Twelve questions from the greedy module. Answer out loud before the answer comes.

They run through the module in order: exchange arguments and where greedy fails, interval problems, and the classic greedy algorithms, Huffman and gas station among them. Each has four options, A to D, then a few seconds for you to commit to one.

## Question 1

An interviewer gives you coins worth 1, 5 and 8, and asks for the fewest coins that make 10. What do you say?

A, greedy fails, since 5 plus 5 is two coins; use the coin-change DP. B, greedy is safe because the set includes a 1-coin, so the answer is three coins. C, greedy gives 8 plus 1 plus 1, three coins, because largest-first is optimal. D, greedy fails; sort ascending and take the smallest coins first.

[think]

The answer is A: greedy fails, since 5 plus 5 is two coins; use the coin-change DP.

Largest-first gives 8, 1 and 1, but 5 and 5 uses two coins, so no optimal solution contains the greedy choice. The greedy-choice property fails, and that is the signal to define a DP over amounts instead. Having a 1-coin only guarantees that some answer exists, not that largest-first is optimal, and sorting ascending does not rescue greedy either.

## Question 2

Which statement correctly describes the greedy-choice property?

A, the greedy choice is the best choice at every step. B, every optimal solution contains the greedy choice. C, some optimal solution contains the greedy choice. D, the greedy choice minimises the size of the remaining problem.

[think]

The answer is C: some optimal solution contains the greedy choice.

The property only needs one optimal solution to agree with the greedy choice, and the exchange argument constructs it by rewriting an arbitrary optimal solution. Requiring every optimal solution to agree is too strong, because ties exist. And "best right now" is the definition of greedy, not of correctness.

## Question 3

Capacity 50. Three items: 10 kilograms worth 60 dollars, 20 kilograms worth 100, and 30 kilograms worth 120. For the whole-items, zero-one knapsack, greedy by value density returns 160 dollars. Why is that wrong, and what is the optimum?

A, the rule is fine but stops early; a fraction of item 3 gives 240. B, it is correct: density order is optimal for whole items too, so 160. C, the key is wrong: sorting by raw value is always optimal, giving 220. D, items cannot be split, so the exchange fails; the optimum is 220.

[think]

The answer is D: items cannot be split, so the exchange fails; the optimum is 220.

Items 2 and 3 fill the bag exactly for 220 dollars. The fractional exchange argument moves weight between items, which whole items forbid, so greedy has no proof and indeed fails. 240 is the fractional answer, not allowed here. Sorting by raw value happens to reach 220 on this data, but it also fails in general.

## Question 4

A customer configures denominations 1, 5, 10, 21 and 25. What is a complete, cheap way to decide, before serving any request, whether largest-first change-making is safe?

A, compare greedy with the DP for amounts up to 1,000, and extrapolate. B, compare greedy with the DP for every amount below 25 plus 21. C, confirm each coin divides the next, which is what canonical means. D, confirm the set contains a 1, which makes largest-first optimal.

[think]

The answer is B: compare greedy with the DP for every amount below 25 plus 21.

Kozen and Zaks showed that a non-canonical system has its smallest counterexample below the sum of its two largest coins, so checking amounts up to 45 is a complete test. Here it finds 31, where greedy gives 25, 5 and 1, and the optimum is 21 plus 10. Containing a 1 only guarantees termination. Each coin dividing the next is sufficient but not necessary: it would reject the canonical US set, since 25 is not a multiple of 10. And no scaling argument lets a check up to 1,000 cover larger amounts.

## Question 5

You want the maximum number of non-overlapping intervals. Which sort key is correct, and what does the alternative get wrong?

A, sort by end; sorting by start lets one long early interval block short ones. B, sort by length; sorting by end can drop a short interval. C, sort by start; sorting by end skips intervals that begin early. D, either key works; only the tie-break on touching ends matters.

[think]

The answer is A: sort by end; sorting by start lets one long early interval block short ones.

The earliest-ending interval leaves the most room, which is the activity-selection exchange argument. Sorting by start keeps 1 to 100 out of 1 to 100, 2 to 3 and 4 to 5, and loses two intervals. Sorting by length fails too: a short interval in the middle can block two others.

## Question 6

In Meeting Rooms two, with a min-heap of end times, why is it enough to pop at most one room per incoming meeting?

A, each meeting needs one room, and spare free rooms left in the heap do not raise the peak. B, it is not enough; every room whose end is at or before the start must be popped first. C, popping more than one room would double-count the freed rooms. D, the heap can only ever hold one free room at a time.

[think]

The answer is A: each meeting needs one room, and spare free rooms left in the heap do not raise the peak.

Leaving other free rooms in the heap does not grow it beyond what the meetings require, since the size only grows when no room is free. Extra free rooms stay in the heap and are popped by later meetings. Popping all the free rooms is also correct, just not required: the peak comes out the same.

## Question 7

A sweep line over half-open intervals has a start event and an end event at the same time t. In which order must they be processed?

A, start first, so the peak count includes both meetings. B, either order, since the maximum is the same after both events. C, start first, unless the intervals are closed, then end first. D, end first, so the room freed at t can host the new meeting.

[think]

The answer is D: end first, so the room freed at t can host the new meeting.

With half-open intervals, a meeting ending at t and one starting at t do not overlap, so the count must go down before it goes up. Processing the start first reports a phantom overlap and over-counts rooms. Closed intervals need the opposite tie-break.

## Question 8

A "concurrent sessions at peak" job ran fine on per-minute data, and now runs out of memory on millisecond timestamps over a day. What happened, and what is the fix?

A, it used a heap of end times; switch to a difference array. B, it sorted by end time; sorting by start would halve the memory. C, it kept every session in memory; sample 10 percent and scale up the peak. D, it used a difference array indexed by time; sort the start and end events instead.

[think]

The answer is D: it used a difference array indexed by time; sort the start and end events instead.

A difference array has one slot per unit of time, so a day of milliseconds is about 86 million slots however many sessions there are, on the order of 0.7 gigabytes of pointers in a Python list. Sorting the start and end events costs memory proportional to the sessions, not the clock, and gives the same exact peak. A heap is not the culprit, the sort key does not change memory, and sampling turns a capacity number you must provision into an estimate.

## Question 9

Huffman coding on frequencies 5, 9, 12, 13, 16 and 45 produces merged nodes of 14, 25, 30, 55 and 100. What is the total encoded length per 100 symbols, and why can you read it off those weights?

A, 224, because each merge adds a bit to every leaf below it. B, 124, because the root merge adds no bits to any code. C, 300, because all six symbols need a fixed-width 3-bit code. D, 100, because the root weight counts every symbol once.

[think]

The answer is A: 224, because each merge adds a bit to every leaf below it.

Every merge pushes the symbols in both subtrees one level deeper, adding their combined frequency to the total. So summing all the merged weights, 14, 25, 30, 55 and 100, gives 224, matching the sum of each frequency times its code length. The root merge counts too: it adds the first bit to every code. 300 is the 3-bit fixed-width baseline that Huffman beats.

## Question 10

The gas station pass fails at station i after starting at s, and resets the start to i plus 1. What justifies skipping every station between s and i?

A, those stations were already visited, so retrying them would loop. B, the total of the differences is negative, so no start between s and i can work. C, each one was reached with a non-negative tank, so starting there also fails at i. D, each of them has a negative difference, so none of them can be a start.

[think]

The answer is C: each one was reached with a non-negative tank, so starting there also fails at i.

Starting later cannot help. The original run arrived at each intermediate station with zero fuel or more, so a fresh start there with an empty tank has at most the same fuel at every later point, and hits the same shortfall. The intermediate stations need not have negative differences themselves. That is why one linear pass is enough once the total is known to be non-negative.

## Question 11

An encoder and a decoder each build a Huffman tree from the same frequency table, on different machines, and the decoded output is garbage. Both are correct Huffman builds. What happened, and what does DEFLATE do about it?

A, one side used a max-heap by mistake; DEFLATE fixes the heap order in its specification. B, floating-point frequencies rounded differently; DEFLATE sends integer counts instead of probabilities. C, the trees differ in total length; DEFLATE transmits the full tree so both sides agree. D, ties were broken differently, giving two optimal trees; DEFLATE sends code lengths and derives a canonical code.

[think]

The answer is D: ties were broken differently, giving two optimal trees; DEFLATE sends code lengths and derives a canonical code.

Equal weights can be merged in more than one order, and every order gives a tree with the same total length but different codewords. Frequencies are integers, so rounding is not the cause. DEFLATE never transmits a tree or the frequencies. It sends each symbol's code length, and both sides assign the canonical code, where equal lengths get consecutive values in symbol order, so the tie-break no longer matters.

## Question 12

A binary source emits one symbol with probability 0.99 and the other with probability 0.01. Its entropy is about 0.08 bits per symbol. What does a Huffman code achieve, and why?

A, about half a bit per symbol, because the two codes average out. B, about 0.08 bits per symbol, because Huffman is optimal and reaches the entropy. C, about 0.1 bits per symbol, within the usual 1 percent gap of the entropy floor. D, 1 bit per symbol, because each symbol needs a codeword of at least one whole bit.

[think]

The answer is D: 1 bit per symbol, because each symbol needs a codeword of at least one whole bit.

Huffman assigns one whole-bit-length codeword per symbol, and with two symbols both codewords are exactly one bit, twelve times the entropy. The bound, within one bit per symbol of entropy, is tight on skewed sources, which is why arithmetic coding and ANS, which share fractions of a bit across symbols, replaced Huffman in video codecs. The 1 percent gap holds only when probabilities are near powers of one half, as in the six-symbol example.

## Recap

Three ideas kept coming back. Greedy is correct only when some optimal solution contains the greedy choice, and the five-element counterexample, coins or whole-item knapsack, is how you find out it does not. In interval problems the sort key and the tie-break are the algorithm: end for selecting, and ends before starts for half-open intervals. And the classic greedy algorithms are justified by short arguments you should be able to say, from Huffman's merged weights to the gas station restart, along with their limits, like a whole bit per symbol on a skewed source.

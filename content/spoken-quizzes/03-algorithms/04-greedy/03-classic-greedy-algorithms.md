---
lesson: classic-greedy-algorithms
source: 8f70bd6fa10ba4c0
---
## 1

Huffman coding on the frequencies 5, 9, 12, 13, 16 and 45 produces merged nodes of weight 14, 25, 30, 55 and 100. What is the total encoded length per 100 symbols, and why can you read it off those weights?

A, 224, because each merge adds a bit to every leaf below it. B, 124, because the root merge adds no bits to any code. C, 300, because all six symbols need a fixed-width 3-bit code. D, 100, because the root weight counts every symbol once.

[think]

The answer is A: 224, because each merge adds a bit to every leaf below it.

Every merge pushes the symbols in both subtrees one level deeper, adding their combined frequency to the total. So summing the merged weights gives 224, the same as summing each frequency times its code length. The root merge counts too: it adds the first bit to every code. And 300 is the fixed-width baseline that Huffman beats.

## 2

In Jump Game Two, why does the loop stop at the second-to-last index, rather than the last one?

A, skipping it saves an iteration without changing the result. B, processing it can add a jump when it ends a layer. C, the problem numbers indices from 1, so the last index is past the end. D, the last element may be 0, which would strand the scan.

[think]

The answer is B: processing it can add a jump when it ends a layer.

Reaching the last index never requires jumping from it. Jumps are counted when a layer is used up, so if the last index happens to end a layer, processing it adds a jump that never needs to happen. On the array 1, 2 the correct answer is 1, but looping to the end returns 2. The bound is about correctness, not about saving an iteration.

## 3

The gas station pass fails at station i after starting at station s, and resets the start to i plus 1. What justifies skipping the stations between s and i?

A, the stations before i were already visited, so retrying them loops. B, the total of the differences is negative, so no start in that range can work. C, each one was reached with a non-negative tank, so a start there fails at i too. D, each of them has a negative difference, so none of them can be a start.

[think]

The answer is C: each was reached with a non-negative tank, so a start there fails at i too.

The original run arrived at every intermediate station with zero fuel or more, so a fresh start there, with an empty tank, has at most the same fuel at every later point, and hits the same shortfall. The intermediate stations need not have negative differences themselves. That is why one linear pass is enough, once the total is known to be non-negative.

## 4

The tasks are four As, three Bs and two Cs, with a cooldown of 2 between equal tasks. What is the minimum time?

A, 11. B, 10. C, 9. D, 12.

[think]

The answer is B: 10.

The most frequent task, A, appears 4 times, and only one task has that count, so the time is 3 frames of 3 slots, plus 1: 10, which exceeds the 9 tasks. One schedule is A B C, A B C, A B, idle, A. Nine would need no idle slot, which is impossible with four As each needing two slots between them.

## 5

An encoder and a decoder each build a Huffman tree from the same frequency table, on different machines, and the decoded output is garbage. Both are correct Huffman builds. What happened, and what does DEFLATE do about it?

A, one side used a max-heap by mistake; DEFLATE fixes the heap order in its specification. B, floating-point frequencies rounded differently; DEFLATE sends integer counts instead. C, the trees differ in total length; DEFLATE transmits the full tree. D, ties were broken differently, giving two optimal trees; DEFLATE sends code lengths and derives a canonical code.

[think]

The answer is D: ties were broken differently; DEFLATE sends code lengths and derives a canonical code.

Equal weights can be merged in more than one order, and every order gives a tree with the same total length but different codewords. The frequencies are integers, so rounding is not the cause. DEFLATE sends neither a tree nor frequencies: it sends each symbol's code length, and both sides assign the canonical code, so the tie-break no longer matters.

## 6

A binary source emits X with probability 0.99 and Y with probability 0.01. Its entropy is about 0.08 bits per symbol. What does a Huffman code achieve, and why?

A, about half a bit per symbol, because the two codes average out. B, about 0.08 bits per symbol, because Huffman is optimal and reaches the entropy. C, about 0.1 bits per symbol, within the usual 1 percent gap. D, 1 bit per symbol, because each symbol needs a codeword of at least one whole bit.

[think]

The answer is D: 1 bit per symbol, because each codeword is at least one whole bit.

Huffman gives each symbol a whole number of bits, and with two symbols both codewords are exactly one bit: twelve times the entropy. Its guarantee, within one bit of the entropy, is tight on skewed sources, which is why arithmetic coding and ANS, which share fractions of a bit across symbols, replaced it in video codecs. The small gap holds only when probabilities are near powers of one half.

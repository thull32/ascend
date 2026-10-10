---
lesson: classic-greedy-algorithms
source: 32fe00c52c1ae0df
fit: partial
desk:
  - "The Huffman trace on six symbols: heap steps, the tree, the code table, and decoding the word faced"
  - "Jump Game and Jump Game II traces, including the seven-element layer table, and the layer code"
  - "The gas station trace and the task scheduler heap trace on AAAABBBCC"
  - "The Dijkstra visualisation on five vertices"
  - "Under the hood: DEFLATE block types, canonical codes, the 15-bit cap, table decoding, and the entropy-coder trade-off table"
  - "Exercises: Jump Game II by layers, and total bits of a Huffman code"
---
## Introduction

Every byte of every PNG, every gzip response your servers send, and nearly every JPEG passes through a greedy algorithm David Huffman published in 1952. Huffman coding is the cleanest example of a greedy algorithm that is not obvious, is provably optimal, and runs at planetary scale. It is also the one whose proof most people cannot reproduce even when they can recite the steps.

This episode walks the classic greedy algorithms interviewers actually ask: Huffman, the two jump games, gas station and task scheduling, each with its proof idea. Then it rereads Dijkstra, Prim and Kruskal as greedy algorithms justified by a single idea, the cut property, so the whole family fits in one mental model.

## Huffman coding

A fixed-width code spends the same bits on every symbol. A prefix code, where no codeword is the start of another so the decoder never needs delimiters, can give short codes to common symbols. Huffman's algorithm builds the prefix code with the minimum total length.

The algorithm: put every symbol in a min-heap keyed by frequency. Repeatedly pop the two lightest, make them children of a new node whose weight is their sum, and push it back. The last node is the root, and a symbol's code is the path of zeros and ones down to its leaf.

The lesson's example has six symbols with frequencies per 100 characters: 45, 16, 13, 12, 9 and 5. The merges go: 5 and 9 make 14. 12 and 13 make 25. 14 and 16 make 30. 25 and 30 make 55. 45 and 55 make the root, 100. The most common symbol gets a one-bit code; three get three bits; the two rarest get four.

Here is the shortcut worth knowing. The total encoded length equals the sum of the merged weights: 14 plus 25 plus 30 plus 55 plus 100, which is 224 bits per 100 characters. Why? Every merge pushes every symbol below it one level deeper, adding one bit to each of their codes. The root merge counts too: it adds the first bit to every code. So you can compute the cost without drawing a tree.

How good is 224? A 3-bit fixed code would spend 300, so Huffman saves about a quarter. The entropy floor for this distribution is about 222 bits, so Huffman is under 1 percent above it.

Why is greedy optimal here? Two exchange arguments. First, in some optimal tree the two rarest symbols are siblings at the deepest level: if not, swap them with whatever is deepest, which moves lighter symbols down and heavier ones up, so the total cannot rise. Second, merging those two into one pseudo-symbol leaves an optimal-code problem on one fewer symbol, whose cost is exactly the original minus the merged weight. Induction closes it. Order n log n with a heap, or linear with two queues if the frequencies arrive sorted.

Now the limit. Huffman is always within one bit per symbol of the entropy, and the gap is large exactly when one symbol dominates. A source that emits one symbol 99 percent of the time has entropy of about 0.08 bits, but each Huffman codeword needs at least one whole bit. That is twelve times the floor. So "within 1 percent of entropy" is true on the six-symbol example and false on skewed sources, which is why arithmetic coding and ANS exist.

## Jump games: stays ahead and layers

Jump Game: each element is the maximum jump length from that index; can you reach the end? Keep one number, reach, the furthest index you could have landed on so far. Walk left to right. If the index passes reach, you are stranded. Otherwise extend reach to the index plus its jump length. On 2, 3, 1, 1, 4, reach becomes 4 at index 1, which is the end: true. On 3, 2, 1, 0, 4, reach stays at 3, and index 4 is beyond it: false.

The proof is greedy stays ahead in its purest form: after each index, reach is exactly the furthest index reachable using the positions so far, so no strategy can be ahead of it.

Jump Game two asks for the minimum number of jumps. Think of it as breadth-first search in layers. Layer zero is index 0. Layer one is everything reachable in one jump. The answer is the layer containing the last index. You do not need a queue, because each layer is a contiguous range: track where the current layer ends and the furthest reach from anything in it, and when the index reaches the layer's end, take a jump and move the end out to the furthest reach. On 2, 3, 1, 1, 4 that is two jumps, index 0 to 1 to 4. It is minimal because BFS layer numbers are shortest-path distances.

The trap: the loop stops one before the last index, because reaching the end never requires jumping from it. Take the array 1, 2. The correct answer is one jump. Loop all the way to the last index, and it closes a layer there and counts a phantom second jump.

## Gas station: two halves of one argument

Stations around a circle. Each has some fuel, and it costs some fuel to reach the next. Find a start that completes the loop. Call the difference at each station its gain.

Two claims make it linear. First, if the total gain is negative, no start works: a full loop burns more than it earns. Second, if the total is zero or more, a start exists, and one pass finds it. Keep a running tank from a candidate start. Whenever the tank goes negative at some station, set the start to the next station and empty the tank.

The lesson's example has gains of minus 2, minus 2, minus 2, plus 3, plus 3. Total zero. The tank fails at stations 0, 1 and 2, and from station 3 it reads 3, then 6. The answer is station 3.

Why is it safe to skip every station between the old start and the failure? Because the original run arrived at each of them with a tank of zero or more. Starting fresh there, with an empty tank, can only arrive at the failure point with the same fuel or less, so it fails too. Every one is ruled out at once.

[pause]

But that is only half. An interviewer will ask why the last candidate necessarily succeeds. Answer: everything before it summed negative, because every restart happened after a negative run. If the last candidate also failed, the whole array would be a negative prefix plus a negative stretch plus the rest, which contradicts a non-negative total. State both halves; candidates who state only the restart rule get asked exactly that.

## Task scheduling with a cooldown

Tasks are letters, each takes one unit, and the same letter needs n idle units between runs. The greedy is "always run the most frequent remaining task that is off cooldown", so the scarcest resource is never left waiting.

There is a closed form. The most frequent letter, appearing max-count times, forces max-count minus one gaps of length n plus one, plus a final slot for each letter that ties for most frequent. Then take the larger of that and the number of tasks.

AAABBB with a cooldown of 2: the most frequent count is 3, two letters tie, so two gaps of three, plus two: 8. A, B, idle, A, B, idle, A, B. Now AAABBBCCCDDD with the same cooldown: the formula gives 10, but there are 12 tasks, so the answer is 12 and no slot is idle.

When the interviewer changes the rules, different durations or per-task cooldowns, the formula breaks, and you simulate with a max-heap: each round, run up to n plus one tasks, decrement, push back the survivors. The bug lives in the final round: if the heap is empty afterwards, charge only the tasks you ran, not the full round. Otherwise you count idle time after the last task.

## Dijkstra, Prim and Kruskal: greedy on a cut

A cut splits the vertices into a settled set and the rest. All three graph algorithms make a greedy choice about the cheapest edge crossing a cut.

Dijkstra settles the unsettled vertex with the smallest tentative distance, and claims that distance is final. Proof: any other path to it must leave the settled set through some unsettled vertex whose tentative distance is at least as large, and with non-negative weights the path can only get longer. Negative edges break exactly that last step, which is why Bellman-Ford exists.

Prim grows a tree by adding the lightest edge from the tree to a new vertex. Kruskal sorts all edges and adds each one that joins two different components. Both rest on the cut property: for any cut, the lightest crossing edge belongs to some minimum spanning tree. The exchange: take a tree that omits that light edge. Adding it creates a cycle, which must cross the cut somewhere else at an edge at least as heavy. Swap that one out, and the result is a spanning tree no heavier.

The interview signal is not knowing these algorithms. It is saying "Prim is greedy, and it works because of the cut property, which is an exchange argument", and then giving the exchange in two sentences.

And in production, greedy is mostly a heuristic. Shortest-job-first minimises mean waiting time. Least-connections load balancing picks the best-looking server right now. First-fit-decreasing bin packing is not optimal but uses at most 11 ninths of the optimum plus 6 ninths of a bin. Interview greedy is about provable optimality; production greedy usually has measured failure modes. Say which one you are running.

## In the interview

"Huffman is optimal. So nothing compresses better?"

[pause]

Optimal among prefix codes with one whole-bit-length codeword per symbol. Whole bits waste up to a bit per symbol, badly when one symbol dominates. Arithmetic coding and ANS share fractions of a bit across symbols, and most of a real compressor's gain comes from the modelling in front of the coder anyway. Treating "optimal prefix code" as "optimal compression" is the wrong answer.

A second one. Encoder and decoder build the tree from the same frequencies on different machines, and the output is garbage. Ties were broken differently: two equally optimal trees with different codewords. DEFLATE never sends a tree. It sends each symbol's code length, and both sides derive the same canonical code, so ties stop mattering. Lengths are capped at 15 bits, and the decoder reads a table indexed by the next 9 bits rather than walking the tree bit by bit. The gzip levels, one to nine, never touch this step; they only change how hard LZ77 searches for matches.

## Recap

Four things to remember. Huffman merges the two lightest, and the total bits equal the sum of the merged weights; it is within one bit per symbol of entropy, which is a lot on skewed sources. Jump Game is stays ahead, and Jump Game two is BFS whose layers are intervals, looping only to the second-to-last index. Gas station needs both halves: a failure rules out every start before it, and a non-negative total makes the survivor work. And Dijkstra, Prim and Kruskal are greedy on a cut, justified by one exchange.

At your desk: the Huffman trace, tree and decoding table, the jump, gas and scheduler traces, the Dijkstra visualisation, the DEFLATE internals, and the two exercises.

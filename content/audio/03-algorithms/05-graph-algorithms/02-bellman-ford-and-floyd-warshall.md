---
lesson: bellman-ford-and-floyd-warshall
source: aa1286c1fe6992c6
fit: partial
desk:
  - "The five-node Bellman-Ford trace, in place and against a copy, round by round"
  - "The negative-cycle trace and the walk along predecessor pointers that extracts the cycle"
  - "The Floyd-Warshall matrices after each stage, and the NumPy and bitset versions"
  - "The algorithm-choice table and the n-cubed budget table"
  - "Exercises: Bellman-Ford with negative-cycle detection, and the Floyd-Warshall distance matrix"
---
## Introduction

Dijkstra's proof needed one thing: extending a path never makes it cheaper. Currency exchange breaks that immediately. Turn each exchange rate into an edge weight equal to minus the logarithm of the rate. Now the sum of weights along a path is minus the log of the product of the rates, and a negative cycle is a sequence of trades that ends with more money than it started with. Dijkstra cannot find it. It cannot even compute correct distances when a single edge is negative.

Two algorithms handle this. Bellman-Ford drops the priority queue and relaxes every edge, V minus 1 times, then uses one more round to catch a negative cycle. Floyd-Warshall answers a different question, the shortest path between every pair, with a three-line dynamic program. Both are slower than Dijkstra, and you need to be able to say why. Both are correct where Dijkstra is wrong.

So: why V minus 1 rounds is enough, how the extra round exposes a cycle, and why one particular loop in Floyd-Warshall must be the outer one.

## Relaxation is the only primitive

Every shortest-path algorithm in this module does one thing to an edge from u to v: if the distance to u plus the weight beats the distance to v, lower v and remember u as its predecessor. The algorithms differ only in which order they relax, and how many times.

Dijkstra orders relaxations by distance, so each edge is relaxed once. Bellman-Ford gives up on ordering and relaxes every edge, repeatedly. Floyd-Warshall relaxes through intermediate nodes instead of along edges.

What makes repetition safe: a distance never drops below the truth, because every value it takes is the length of a real path. Repeating relaxations can only move distances towards the truth, never past it. The only question is how many relaxations it takes to get there.

## Why V minus 1 rounds are enough

A shortest path that does not revisit a node uses at most V minus 1 edges. The claim: after i full rounds of relaxing every edge, every node whose shortest path has at most i edges has its correct distance.

The induction is two sentences. Take a node v whose shortest path has i edges, and let u be the node just before it. The path to u has i minus 1 edges, so u was correct after round i minus 1, and round i relaxes the edge from u to v, which sets v to the true value. Notice what the argument never mentions: the sign of any weight. That is why Bellman-Ford survives negative edges.

The cost is plain: V minus 1 rounds, each touching every edge, so order V times E. And here is a tiny example of why the worst case really needs every round. Four nodes in a line: A to B, B to C, C to D, each weight 1. Store the edges in reverse order: C to D first, then B to C, then A to B. In round 1, C to D and B to C do nothing, since C and B are still at infinity, and only A to B fires. Round 2 fixes C. Round 3 fixes D. Three rounds, which is V minus 1. Store the same edges in forward order and one round does all three, because relaxation in place chains within a round.

That gives you the early exit: if a full round changes nothing, no later round can either, so stop. On most real graphs that is far fewer than V minus 1 rounds. Edge order is invisible in the complexity and dominant in the running time, which is a useful thing to say out loud in an interview.

One guard line matters more than it looks: skip any edge whose tail is still at infinity. In Python, float infinity plus minus 3 is still infinity, so the guard looks redundant. But if infinity is a big integer, say 10 to the 18, then that number minus 3 is smaller than it, and an unreachable node quietly acquires a finite distance. Worse, a negative cycle the source cannot reach would get reported.

## Negative cycles, and k stops

After V minus 1 rounds, every distance is final, if there is no negative cycle. So run one more round. If any edge still improves, some shortest path has V or more edges, so it repeats a node, so there is a cycle with negative total weight reachable from the source.

What does that look like in a trace? The distances on the cycle keep falling by exactly the cycle's weight, every round. In the lesson's example, a cycle weighing minus 2 makes its nodes drop by 2 per round, forever. To report the actual cycle, which an arbitrage detector needs, take the node that improved in the extra round and follow predecessor pointers exactly V times. You are then guaranteed to be standing on the cycle; walk the pointers until you come back to the same node.

And the trap: the extra round only finds cycles the source can reach. To find one anywhere, add a virtual source with a zero-weight edge to every node, or run Floyd-Warshall and check the diagonal.

The induction gives you something stronger, too. After exactly k rounds, each distance is the cheapest path using at most k edges. That is the answer to "cheapest flight with at most k stops". Before I say the catch: three stops means how many rounds, and what must you relax against?

[pause]

Three stops is four flights, so four rounds. And you must relax against a copy of the previous round's distances, not in place. In place, one round can chain several edges, exactly as the forward-ordered line did, and you count edges wrong. In place is fine when you only want the final distance. When the round number means something, use the copy.

## Where Bellman-Ford runs

RIP, a distance-vector routing protocol, is distributed Bellman-Ford. Each router keeps its distance to every destination and periodically tells its neighbours, and each neighbour relaxes its own table on receipt. There is no round counter and no coordinator. That works because Bellman-Ford's correctness does not depend on relaxation order.

Its famous failure is count to infinity. Router A reaches X directly at cost 1; router B reaches X through A at cost 2. The link from A to X dies. A hears B advertise X at cost 2, and relaxes through B to 3. B hears A at 3 and moves to 4. One hop per exchange, each relaxing through the other's stale entry. RIP caps it by defining 16 as unreachable. The patches are split horizon, never advertise a route back to the router you learned it from, and poison reverse, advertise it back as unreachable. Link-state protocols, which run Dijkstra on the whole topology, replaced this in large networks.

There is also a queue-based variant called SPFA that only re-relaxes edges out of nodes that changed. It is often fast on random graphs. Its worst case is still order V times E, adversarial inputs exist, and the lesson's advice is: never in anything with a service-level agreement.

## Floyd-Warshall: all pairs by intermediate node

Now every pair. Running Dijkstra from every node on a dense graph costs order V cubed times log V. Floyd-Warshall does it in order V cubed, with three nested loops and no data structure.

The idea is a dynamic program over which nodes you are allowed to pass through. Stage k means: the best path from i to j using only the first k nodes as stopovers. To allow node k as well, either you do not use it, or you go from i to k and then from k to j, each half using only earlier stopovers. Take the smaller. That is the whole recurrence.

Said on the lesson's four-node example: A to B costs 3, B to C costs 1, and there is also a direct edge from A to C costing 7. When B becomes an allowed stopover, the distance from A to C drops from 7 to 3 plus 1, which is 4. When C is allowed next, A reaches D through C at 4 plus 2, which is 6, using the improvement from the previous stage. Every stage builds on the finished one before it.

Which is why the stopover loop, k, must be the outermost. Put it inside and you compute "the best path with at most one stopover", which is wrong, and some pairs come back unreachable when a path exists. Interviewers who ask you to write Floyd-Warshall are mostly checking that you know which loop goes outside and can say why: k is the stage, and each stage must finish before the next begins.

Two bonuses. Negative edges are handled for free, and a negative number on the diagonal, a node whose distance to itself went below zero, means that node is on a negative cycle. That is the global check single-source Bellman-Ford cannot do. And swap minimum and plus for "or" and "and", and the same three loops compute reachability, which with bitsets runs 64 times faster.

## Budgets and choices

Floyd-Warshall's cost is the same on every input, so it is easy to budget. A hundred nodes is a million steps: fine anywhere, even per request. A couple of thousand nodes is 8 billion steps and 32 megabytes: several seconds in C, batch only. Ten thousand nodes is a trillion steps and 800 megabytes: wrong tool. The rule: a few hundred nodes in any language, a couple of thousand with a compiled inner loop, and above that the memory runs out before the time does.

For all pairs on a large sparse graph with negative edges, the answer is Johnson's algorithm. Run Bellman-Ford once from a virtual source to get a potential for each node. Because no edge still relaxes at the end, adding the tail's potential and subtracting the head's makes every edge weight non-negative. Along any path the potentials cancel except at the two ends, so every path between the same pair shifts by the same constant, and the cheapest one stays the cheapest. Then run Dijkstra from every node.

## In the interview

A follow-up from the lesson. Detect arbitrage among 200 currencies, given a rate table.

[pause]

Weight each edge minus the log of the rate, so a cycle whose rates multiply to more than 1 has negative total weight. Run Bellman-Ford from a virtual source, or Floyd-Warshall, since 200 cubed is 8 million steps and instant. Look for an edge that still improves, or a negative diagonal, and extract the cycle by walking predecessors. And compare with a tolerance, because the logs are floats, and rounding turns a zero-profit cycle into a phantom one. The wrong answer is Dijkstra on the rates, which cannot represent "going round makes money".

And: why can RIP be distributed when OSPF's Dijkstra cannot be run the same way? Because Bellman-Ford converges whatever order relaxations arrive in, while Dijkstra needs one global priority order, so every OSPF router holds the whole topology and computes locally.

## Recap

Four things to remember. Bellman-Ford's V minus 1 bound is an induction on path length that never looks at a weight's sign, and its cost is order V times E. The extra round finds negative cycles, but only ones the source can reach; use a virtual source or the Floyd-Warshall diagonal for the rest. When the round count means something, k stops, relax against a copy. And Floyd-Warshall's stopover loop goes outside, because each stage builds on the finished one; it is order V cubed, fine to a few hundred nodes, and Johnson beyond that.

At your desk: the two Bellman-Ford traces, the negative-cycle extraction, the Floyd-Warshall matrices stage by stage, the budget and choice tables, and the two exercises.

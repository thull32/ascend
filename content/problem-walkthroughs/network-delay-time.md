---
problem: network-delay-time
args: [[[1, 2, 4], [1, 3, 1], [3, 2, 2], [2, 4, 1]], 4, 1]
frames: 51
source: fcbdc64a947cad93
---
@0
Four nodes, and a signal sent from node 1. The links: 1 to 2 takes 4, 1 to 3 takes 1, 3 to 2 takes 2, and 2 to 4 takes 1. How long until every node has heard it? Each node hears the signal along its fastest route, so we need shortest times, and then the largest of them. Breadth-first search counts hops, not time, and this example is built to fool it: the direct link to node 2 takes 4, but the detour through node 3 takes 3. With no negative delays, the unfinished node with the smallest tentative time already has its final time. That is Dijkstra's algorithm.

@1-9
First, an adjacency list. Node 1 links to 2 with delay 4 and to 3 with delay 1, node 3 links to 2 with delay 2, and node 2 links to 4 with delay 1.

@10-12
The finished times start empty, and the heap holds one entry: time zero at node 1.

@13-16
Pop the smallest entry, node 1 at time zero. It is not finished yet, so its time is now final: zero.

@17-22
Relax its links. Node 2 can be reached at time 4, and node 3 at time 1. Both are pushed. Notice that node 2's time of 4 is only a candidate. Finalising a node when it is first pushed is a classic bug, because the first time you discover is not always the shortest.

@23-27
Pop the smallest: node 3 at time 1, and it becomes final.

@28-30
From node 3, node 2 is reachable at 1 plus 2, time 3. We push that too, so now the heap holds two entries for node 2: time 3 and time 4.

@31-38
Pop node 2 at time 3, the shorter of the two, and finalise it. From node 2, node 4 is reachable at 3 plus 1, time 4.

@39-42
Pop the old entry, node 2 at time 4. Node 2 is already final, so this entry is stale, and we skip it. That check is lazy deletion: instead of updating entries in place, we leave old ones in the heap and ignore them when they surface.

@43-48
Pop node 4 at time 4 and finalise it. It has no outgoing links, and the heap is empty.

@49-50
All four nodes were reached, so we return the largest final time: 4. If any node had never been reached, the answer would be minus one. The signal travels in parallel, so the answer is the maximum, not the sum. Every link can push one heap entry, so the time is E log E, which is the usual E log V.

---
problem: spf-next-hops
args: [[["leaf1.ams", "spine1.ams", 10], ["spine1.ams", "leaf2.ams", 10], ["leaf2.ams", "leaf1.ams", 16777215], ["leaf1.ams", "leaf2.ams", 20]], "leaf1.ams"]
frames: 74
source: 6ab3ebdc3a63317c
---
@0
Leaf one is running SPF over a tiny map. It reaches spine one at metric 10, spine one reaches leaf two at 10, and leaf one also has a direct link to leaf two at 20. So there are two ways to leaf two, and both cost 20. The router needs more than the cost: it needs every neighbour that starts a shortest path, because ties become an ECMP group. The insight is that first hops are inherited along the shortest path tree. Whatever first hops reach a router also reach the routers just beyond it. So we run ordinary Dijkstra and carry a set of first hops through the same relaxation step that carries distances.

@1-11
First we build the adjacency map, one directed entry at a time. Leaf one advertises spine one at 10, and spine one advertises leaf two at 10. Each new pair goes straight in, because there is no earlier metric to compare against.

@12-14
The third entry is leaf two advertising leaf one at the largest wide metric, about 16.8 million. That value means never use this link, so we skip it.

@15-19
The last entry is leaf one's direct link to leaf two at 20. Leaf one now lists two neighbours: spine one at 10 and leaf two at 20.

@20-24
Dijkstra's state: the source at distance zero with an empty set of first hops, nothing finalised yet, and a heap holding just the source.

@25-28
We pop leaf one at distance zero. It is not finalised yet, so we finalise it and relax its links.

@29-35
Spine one costs 10. Because we are relaxing out of the source itself, the first hop on offer is spine one, the neighbour we are stepping to. Spine one has never been reached, so it gets distance 10 and a fresh copy of that set, and goes on the heap.

@36-42
Leaf two over the direct link costs 20, and again we are leaving the source, so the offer is leaf two itself. It gets distance 20 and the set holding leaf two. That set is provisional: nothing guarantees yet that it is complete.

@43-47
The heap gives back spine one at 10, the cheaper entry. Its distance and its set are now final.

@48-50
Here is the line that carries the idea. Spine one reaches leaf two for 10 plus 10, which is 20. This time we are not leaving the source, so the offer is not leaf two. It is spine one's own set, which holds spine one. A packet to leaf two along this path still leaves leaf one through spine one.

@51-53
20 is not shorter than 20, so this is not a replacement. It is equal, so it is a tie, and we merge: leaf two's set becomes leaf two and spine one. A tie never pushes again, because the distance did not change.

@54-58
Leaf two pops at 20 and is finalised with both first hops. It has no usable links out, since its only one was the link we dropped, so the heap is empty and the loop ends.

@59-73
We emit every router except the source, with its first hops sorted. Spine one costs 10 through spine one. Leaf two costs 20 through leaf two and spine one, a two member ECMP group. The direct link counts only because the detour ties it; with the direct metric at 30, the strictly shorter path would have replaced the set, and spine one alone would remain.

The cost is Dijkstra's with a binary heap: links plus routers, times the log of the number of routers. On top of that, each relaxation does set work bounded by the number of the source's neighbours. The classic mistakes are a single parent pointer, which finds one shortest path and shrinks every ECMP group to one member, swapping replace and merge, and assigning the predecessor's set instead of a copy, so a later tie leaks into the wrong router.

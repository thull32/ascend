---
lesson: bridges-articulation-and-flow
source: fa3c9dff2aa75656
fit: partial
desk:
  - "The fourteen-event bridge trace on five nodes, with discovery times and low-links"
  - "The bridges-and-cut-vertices code, and the bow-tie case for discovery time over low-link"
  - "The Edmonds-Karp trace on the six-node network, round by round, and the cut read off at the end"
  - "Kuhn's matching code and its three-worker trace"
  - "The flow-algorithm trade-offs table and the quantified costs"
  - "Exercises: find all bridges, and maximum bipartite matching"
---
## Introduction

Your network has forty routers and sixty links. Which single link, if it fails, splits the network in two? Which single router? Brute force removes each link, runs BFS, and checks connectivity: order E times V plus E. Fine for sixty links, hopeless for a road network with a million edges. The low-link idea from the components lesson answers both questions, for every edge and node at once, in one linear pass.

The second half is a different question with a related feel: not what breaks the network, but how much you can push through it. Max-flow. You are unlikely to be asked to implement Dinic's algorithm in forty-five minutes. You are quite likely to be asked to recognise that a problem is bipartite matching, and to say how flow solves it.

So: bridges and cut vertices, and the one-character difference between them. The residual graph, which is the whole idea of max-flow. And matching, the flow problem you will actually be asked.

## Bridges and articulation points

A bridge is an edge whose removal increases the number of connected pieces. An articulation point, or cut vertex, is a node whose removal does the same. Redundant networks are designed to have neither.

Run a DFS on the undirected graph. Each node gets a discovery time and a low-link: the earliest discovery time its subtree can reach, going down tree edges and then up at most one back edge. Undirected DFS has a property directed DFS lacks: there are no cross edges. Every non-tree edge joins an ancestor and a descendant. That is why this version needs no stack: every already-visited neighbour is an ancestor, still open. So a child's low-link says exactly how far up the tree its subtree can climb without using the edge to its parent.

Now the two rules. For a node u and its child v: if v's low-link is strictly greater than u's discovery time, the subtree under v cannot reach u at all except through that edge, so the edge is a bridge. If v's low-link is greater than or equal to u's discovery time, the subtree cannot reach anything strictly above u, so removing u strands it: u is a cut vertex. The root is special: it is a cut vertex only if it has two or more DFS children.

Greater-than for bridges, greater-or-equal for cut vertices. Here is why. A back edge from v's subtree to u itself saves the edge from u to v, since the subtree can still reach u. It does not save u, because removing u removes that back edge's endpoint too.

## Five nodes, said aloud

A triangle, A, B and C, all joined to each other. Then a tail: B joined to D, and D joined to E.

Start at A, discovered at time 0. Go to B at 1, then C at 2. C has a back edge to A, so C's low-link drops to 0, and B inherits 0. That back edge climbs above B, so the edge from B to C is no bridge, and it does not make B a cut vertex.

Then B goes to D at 3, and D to E at 4. E has nothing but the edge it arrived by, so its low-link stays 4. Back in D: E's 4 is greater than D's 3, so D to E is a bridge, and greater-or-equal holds too, so D is a cut vertex. Back in B: D's low-link of 3 is greater than B's 1, so B to D is a bridge, and B is a cut vertex. Finally A is the root with only one DFS child, so it is not a cut vertex. Two bridges, B to D and D to E. Two cut vertices, B and D. That matches the picture: the triangle survives losing any one edge, the tail does not.

## The two classic bugs

The first bug: skip the edge you arrived by using its index, not by checking whether the neighbour is your parent. Two parallel links between the same two routers, and nothing else. What does the "skip the parent node" version report?

[pause]

It reports one bridge, which is wrong. From the child's side, both links lead back to the parent, so both are skipped, the second one never counts as a back edge, and the low-link never drops. Skipping by edge index leaves the second link as a legitimate back edge, and correctly reports no bridges. And the multigraph case is exactly the redundant-link topology the check exists for.

The second: on a back edge, update with the other node's discovery time, not its low-link. Bridges happen to survive the substitution. Cut vertices do not: on a bow-tie, two triangles sharing one node, the low-link value leaks from one triangle into the other, and the shared node stops looking like a cut vertex.

Once you have the bridges, remove them, and the pieces left are the two-edge-connected components. In production the graph is a service dependency graph, a network topology or a road network, and the check is cheap enough to run on every deploy: a few thousand services takes milliseconds.

## Max-flow: the residual graph

A flow network is a directed graph with a source, a sink, and a capacity on each edge. A flow puts a value on each edge, at most its capacity, with what goes in equal to what comes out at every node except the source and sink. Max-flow asks for the largest total leaving the source.

The greedy attempt fails, and the lesson's tiny example shows it. Four nodes: source s, sink t, and two middle nodes a and b. Five edges, every one with capacity 1: s to a, s to b, a to b, a to t, and b to t. Greedy finds the path s, a, b, t and pushes 1. Now s to a is full, and b to t is full, so nothing else gets through. Greedy stops at 1. But the true maximum is 2: s, a, t, and separately s, b, t.

The fix is the residual graph. For every edge carrying flow, keep the forward edge with its remaining capacity, and add a reverse edge with capacity equal to the flow. Pushing along a reverse edge cancels flow on the original. In the example, after the first push there is a reverse edge from b back to a, so the path s, b, a, t opens up. It cancels the flow on a to b, and the result is two separate paths, flow 2. Reverse edges are what make the method correct, not merely faster. Each such path is an augmenting path, and this is Ford-Fulkerson.

How you choose the path matters. By BFS, shortest in edges, it is Edmonds-Karp, order V times E squared, and it terminates even with irrational capacities. By DFS there is no such bound: the number of rounds can track the capacity values, and the lesson shows a network with capacities of a thousand where DFS takes 2,000 rounds and BFS takes two. Dinic's algorithm, which finds all shortest paths at once, is the practical default and SciPy's. For an interview, knowing these exist and what the residual graph is for is the bar.

Then the theorem: the maximum flow equals the capacity of the minimum cut, the cheapest set of edges whose removal separates the sink from the source. When Edmonds-Karp stops, the nodes the source can still reach in the residual graph form one side of a minimum cut. Not the last path found; the reachable set. That duality is why "minimum edges to remove so A cannot reach B" is a flow problem, and why image segmentation, foreground against background, is a classic min-cut application.

## Bipartite matching

Workers and tasks, and a list of which worker can do which task. Assign as many workers as possible to distinct tasks. Add a source with a capacity-1 edge to every worker, a sink fed by a capacity-1 edge from every task, capacity 1 on every worker-task edge, and the max-flow is the maximum matching. The unit capacities enforce "each worker once, each task once".

With every capacity 1, the machinery collapses to Kuhn's algorithm, short enough to write in an interview. For each worker, try each of its tasks. If the task is free, take it. If it is held, ask the current holder to find a different task, recursively. If the holder can move, the task is yours. That recursive "move over" is the augmenting path. Keep a set of tasks already tried, fresh for each top-level worker. Share it across workers and you undercount. Kuhn is order V times E in the worst case; Hopcroft-Karp is the scalable version.

The signals to listen for: "maximum number of pairs", "each used at most once", "minimum things to remove to disconnect", capacities or rates on edges. Say the model out loud: source, sink, capacities, and what the cut means.

## In the interview

A follow-up from the lesson. Each node also has a capacity. Now what?

[pause]

Split every node into an in-copy and an out-copy, joined by an edge with the node's capacity. Edges into the node go to the in-copy; edges out leave from the out-copy. The graph doubles, the algorithm is unchanged. The wrong answer is capping the node's outgoing edge capacities, which does not constrain flow through the node.

And: several sources and several sinks? Add a super-source with unlimited edges to every source and a super-sink fed by every sink, and run once. Running one flow per pair and summing double-counts shared edges.

## Recap

Four things to remember. Undirected DFS has no cross edges, so low-link needs no stack, and the rules differ by one character: strictly greater for a bridge, greater-or-equal for a cut vertex, two children for the root. Skip the parent edge by index, never by node. The residual graph's reverse edges let a later path undo an earlier choice, which is why greedy gets 1 and the method gets 2; choose paths by BFS, and read the minimum cut off what the source can still reach. And "maximum pairs, each used once" is bipartite matching: say the flow model, then write Kuhn.

At your desk: the bridge trace and code, the bow-tie case, the Edmonds-Karp rounds on the six-node network with its cut, the matching trace, the trade-offs table, and the two exercises.

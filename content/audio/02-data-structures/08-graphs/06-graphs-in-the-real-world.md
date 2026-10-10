---
lesson: graphs-in-the-real-world
source: f23b866032e750b6
fit: great
desk:
  - "The modelling table for the standard puzzles: word ladder, knight, jugs, walls, lock and mutation"
  - "The jug BFS code and its queue trace, pop by pop"
  - "The order-lifecycle state diagram, the transition table and the check-machine test"
  - "Under the hood: relational joins versus index-free adjacency, Pregel supersteps and the PageRank formula"
  - "The storage trade-off table across memory, relational, native graph, TAO-style and Pregel"
  - "Exercises: package install order, and word ladder as an implicit graph"
---
## Introduction

Nobody hands you an adjacency list in production, and the harder interview questions do not either. You get a word list, a set of user accounts with email addresses, a warehouse map, two jugs and a tap, a bank's transaction log. The algorithms in this module are all linear and mechanical. What distinguishes engineers is the sentence that comes before the algorithm.

That sentence is: the vertices are X, the edges are Y, there are about Z of them, and the question is W, where W is one of a dozen standard graph questions. Get the sentence right and the code is twenty lines. Get it wrong, usually by leaving something out of the vertex, and no optimisation helps.

So: the modelling method, worked on a puzzle. Then the five shapes that keep coming back, social, dependency, state machine, bipartite and physical, with what each one unlocks. Then the question of whether to build the graph at all.

## The modelling method

Four questions, in order, out loud.

First, what is a vertex? The complete state the answer depends on: a word, a grid cell plus what you are carrying, a pair of jug volumes. The test: if two situations with the same vertex could need different answers, the vertex is too small.

Second, what is the edge rule? A function from a state to its neighbours: change one letter, move a knight, pour a jug. Directed or not, weighted or not.

Third, how many states and edges? Multiply the ranges of the state's parts, then multiply by the branching factor. That decides whether you build the graph, explore it implicitly, or need a different idea.

Fourth, which question, in graph words? Reachability, shortest path, components, cycle, ordering, matching. The question picks the algorithm.

Here it is on a classic. Two jugs, 3 litres and 5 litres, and a tap. Measure exactly 4 litres. A vertex is the pair of volumes, what is in jug A and what is in jug B. Jug A holds 0 to 3, jug B 0 to 5, so 4 times 6, which is 24 states. The edges are six moves: fill either jug, empty either, or pour one into the other until the source is empty or the target is full. The question is the fewest moves to a state with 4 in either jug: shortest path in an unweighted graph, so BFS.

Before I give you the answer, try it: how many moves?

[pause]

Six. Fill the 5. Pour it into the 3, leaving 2 in the 5. Empty the 3. Pour the 2 across. Fill the 5 again. Pour into the 3, which only has room for 1, and 4 litres remain in the big jug. Only 16 of the 24 states are reachable at all, which is a number-theory fact in disguise: a target is reachable exactly when it is a multiple of the greatest common divisor of the jug sizes and no more than their sum.

Writing the size down is what catches mistakes. Shortest path on a grid where you may remove up to 5 walls: the state is the cell plus walls left, so a 100 by 100 grid has 60 thousand states, and the cell alone is 6 times too small. The bug that follows is classic: the first arrival at a cell, having spent its wall, marks it visited, and blocks a later arrival that still has the wall to spend. BFS says no path when there is one.

## The social graph

Users are vertices, and follows or friendships are edges: directed for follows, undirected for friendships. The graph is enormous, sparse, and heavy-tailed. Most users have tens to a few hundred connections; the 2011 Facebook study found a median of 99 friends. A few have millions, and those few decide the cost of every query.

People you may know is BFS to depth 2 with counts. A user with 300 friends, each with 300 friends, has up to 90 thousand candidates before de-duplication and ranking by mutual friends. And Facebook reported in 2016 an average distance of 4.57 between any two users, so depth 3 or 4 reaches a large part of the graph. Nobody runs that online.

Now the supernode. If one of those 300 friends is a celebrity with 10 million followers, the same two-hop query touches 10 million vertices. Naive BFS on a social graph is bounded by its supernodes, not its average degree. You will see it as a 99th percentile a hundred times the median, always for users connected to the same few accounts. The fixes: cap the edges you expand per neighbour, sample, precompute candidates offline, or treat very high-degree vertices as a separate signal.

At scale, the adjacency is sharded by vertex id, and BFS becomes one batched round of lookups per level, so you optimise rounds, not vertices. Facebook's TAO, described in 2013, is the reference shape: typed objects and typed associations in a sharded relational store behind a big cache, with an API of a few calls, like the most recent N edges of a type. Every undirected relationship is stored twice, once per direction. Replication across regions is asynchronous; the paper measured the lag under a second 85 percent of the time, and under 10 seconds 99.8 percent.

## Dependencies and state machines

In a dependency graph the vertices are packages, targets, tasks or services, and an edge means "must happen before". Pick one direction and write it down, because a manifest lists what a package depends on, which is the reverse arrow. Build one, reverse it once, keep both. Order is a topological sort; a cycle is the error, reported as a path by three-colour DFS. And blast radius, what breaks if this database goes down, is reachability in the reverse graph: one reverse DFS, and whether it reports 12 services or 400 decides the incident's severity.

A state machine is a directed graph whose vertices are states and whose edges are transitions labelled by events. Order lifecycles, protocols, UI flows, regex engines. Picture an order: created, then paid or cancelled; paid goes to shipped or refunded; shipped goes to delivered or returned; returned goes to refunded. Now graph questions become correctness questions. Can a cancelled order ever become shipped? That is reachability, and it should be a test. Is there a state nothing can reach? Dead code. Is there a non-terminal state with no way out? A hang. A protocol state with no timeout edge is exactly that.

The engineering point: write the machine as an explicit transition table, so the code can only follow edges that exist. An if-else chain over status strings can be quietly edited into allowing cancelled to shipped. A table cannot express that edge unless someone adds it, and a unit test can walk the table and assert that every state is reachable and nothing is stuck.

## Bipartite and physical networks

Bipartite graphs have two kinds of vertex with edges only between kinds: workers and jobs, users and items, accounts and email addresses. Matching assigns each job to at most one worker by searching for augmenting paths. And identity resolution, the accounts-merge problem, is components in disguise. Make the email addresses vertices too, link each account to its addresses, and the connected components are the real people. Comparing every pair of 200 thousand accounts instead is 20 billion operations. Collaborative filtering, items liked by users who liked what you liked, is a three-step walk with counts, which recommenders run as sparse matrix multiplication.

Physical networks, roads, fibre, pipes, are where weights live: Dijkstra and A star for routing, spanning trees for cheapest connection, max-flow for capacity. The modelling subtleties are in the edges. One-way streets are directed. Turn restrictions need a vertex for each junction and incoming road. And travel times that depend on the time of day break Dijkstra's assumptions, unless leaving later never gets you there earlier.

## Build it, or explore it?

Build the adjacency list when the graph is data, a table or a manifest, when you will run several queries over it, and when it fits in memory. Explore implicitly when neighbours come from a rule, you run one search, and the full graph is astronomical but the reachable part is small.

Word ladder makes it concrete. Five thousand five-letter words. Building the graph by comparing all pairs is 12.5 million comparisons. Generating neighbours on demand, 25 substitutions at each of 5 positions checked against a hash set, is 125 lookups per word, and only for words the search actually reaches. The middle ground, when millions of queries share one dictionary, is wildcard buckets: group words by patterns like h, star, t, so each word's neighbours are read straight from its buckets.

Underneath, storage matters. In a relational table with an index on the source, one hop is one index range scan, but n hops is n joins whose intermediate results grow by the average degree each step. A native graph database like Neo4j chases pointers per hop, with no index, at the cost of locality and of harder sharding. For one or two hops with a warm cache they are within a small factor; at four or five hops, the join's intermediate results are what you pay for. And when the graph does not fit on one machine, Pregel and its descendants run in supersteps: every vertex reads its messages, updates itself, and sends messages along its edges. BFS is one superstep per level, and PageRank, with its usual damping factor of 0.85, converges in a few dozen.

## In the interview

A follow-up from the lesson. Design "people you may know" for a billion users.

[pause]

Compute two-hop candidates with mutual-friend counts offline, in batches over the sharded adjacency, one pass per hop. Cap the expansion per neighbour to defuse supernodes. Store a ranked list per user and refresh it on a schedule, so online it is one key-value read. The wrong answer is an online BFS to depth 2 per request: 90 thousand candidates for an ordinary user, 10 million for a celebrity's friend.

And the natural next one: why not a graph database for the whole product? Because most product reads are one or two hops of a known type, which a sharded key-value store with a cache serves more cheaply and with higher availability, and reporting needs joins, aggregates and transactions, where relational stores win. A graph engine earns its place for variable-depth pattern queries, like accounts within four hops sharing a device. Saying "graph data needs a graph database" is the wrong answer.

## Recap

Four things to remember. Say the modelling sentence first: vertices, edge rule, size, question, and put everything the answer depends on into the vertex. Size social queries by their supernodes, not the average degree, and precompute anything deeper than a hop or two. Dependency graphs give order, cycles and blast radius by reverse reachability; state machines become testable once they are a transition table. And decide deliberately whether to build the graph or generate neighbours on demand.

At your desk: the puzzle modelling table, the jug trace, the order state machine and its test, the storage internals and trade-off table, and the two exercises.

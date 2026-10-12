---
lesson: graphs-in-the-real-world
source: 6696fe9a5f68a88e
---
## 1

A breadth-first search for the shortest path through a grid, where you may pass through at most one wall, marks cells visited by row and column only, and returns no path even though one exists. What is the bug?

A, breadth-first search finds only shortest paths, so the route through a wall needs depth-first search. B, the state leaves out the walls used, so one arrival at a cell blocks a different, later one. C, the wall cell must be deleted from the grid before searching, not crossed. D, breadth-first search cannot cross walls at all, so the path through one is never explored.

[think]

The answer is B: the state leaves out the walls used, so one arrival at a cell blocks a different, later one.

Two arrivals at the same cell with different remaining budgets are different states. A cell reached first after spending the wall gets marked visited, and blocks a later arrival that still has the wall available. The vertex must be row, column and walls used, so that each is visited independently. Breadth-first search is right for this unweighted problem; the state is what is too small.

## 2

You have 200 thousand accounts, each with a few email addresses, and must group the accounts that belong to the same person, meaning they share an address. What is the efficient model?

A, compare every pair of accounts for a shared address, about n squared comparisons. B, hash each account's full set of emails and group equal hashes, linear in the total emails. C, sort accounts by their first email and merge neighbours that match, n log n. D, a graph of accounts and emails, with components or union-find, linear in the total emails.

[think]

The answer is D: a graph of accounts and emails, with components or union-find, linear in the total emails.

Shared addresses link accounts through the address itself. Visiting each account's emails and joining it with the first account that owns each email touches every email once, and components capture the chains of merges. Pairwise comparison is 20 billion operations. Hashing whole sets, or sorting by first email, only groups accounts whose entire set or first address coincide, and misses accounts that share just one address.

## 3

A package manifest for P lists the dependencies A and B. For a topological install order, which edges should you add?

A, from P to A, and from P to B. B, from A to P, and from B to P. C, undirected edges between P and A, and between P and B. D, from A to B, and from B to P.

[think]

The answer is B: from A to P, and from B to P.

An install-order edge means "must come before". A and B must be installed before P, so the edges point from the dependency to the package that depends on it. Adding them the other way round produces the reverse order, which uninstalls correctly but installs backwards.

## 4

A workflow's state machine has a state with no outgoing transitions, and it is not documented as terminal. In graph terms, what is it?

A, a source vertex, because no transition leaves from it at all. B, an unreachable vertex, because nothing can proceed past it. C, a cycle, because the workflow can never leave that state again. D, a sink vertex, which means the workflow can get stuck there.

[think]

The answer is D: a sink vertex, which means the workflow can get stuck there.

Out-degree zero means no way forward: a sink, found by checking the out-degree. A source is the opposite, in-degree zero, a cycle needs outgoing edges, and the state may well be reachable, which is exactly why it is dangerous. Checking that every non-terminal state has an outgoing edge, and that every state is reachable from the start, are two one-pass graph checks worth having as tests.

## 5

Word ladder runs over a fixed dictionary of 100 thousand words, queried millions of times with different start and end words. What is the best preprocessing?

A, sort the dictionary, so each word's neighbours can be found by binary search. B, build the full adjacency list once, by comparing all pairs of words: quadratic time. C, bucket the words by wildcard pattern, each with one letter blanked out, and read neighbours from the buckets. D, nothing: generate neighbours by substitution, fresh on every query.

[think]

The answer is C: bucket the words by wildcard pattern, each with one letter blanked out, and read neighbours from the buckets.

Pattern buckets give exact neighbour lists, for preprocessing proportional to the word count times the word length, and a constant-time lookup per position. Substitution per query is fine for one search but wastes work across millions. Pairwise comparison is 10 billion operations. Sorting only helps with shared prefixes, and a one-letter change can happen at any position.

## 6

A "friends of friends" endpoint has a median latency of 5 milliseconds and a 99th percentile of 800, and the slow requests come from users connected to the same few accounts. What is the most likely cause?

A, the adjacency list is sharded, so each hop is a network round trip. B, a supernode with millions of edges sits inside the two-hop expansion. C, the graph is stored undirected, so every edge is expanded twice. D, the search marks visited on dequeue, so the queue holds duplicate entries.

[think]

The answer is B: a supernode with millions of edges sits inside the two-hop expansion.

Two-hop cost is the sum of the neighbours' degrees, so one celebrity among a user's friends multiplies the work by their degree, which is why the slow requests cluster around particular accounts. Duplicate queue entries, undirected storage and per-hop round trips would slow every request roughly equally. The fix is a cap per neighbour, sampling, or precomputed candidates for high-degree vertices.

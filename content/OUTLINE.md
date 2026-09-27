# Ascend curriculum outline

Phases order the roadmap. Directory prefixes give order within a phase.
Lesson slugs listed here are the canonical slugs; keep them exactly.

## Phase 1 — Foundations

### Track `01-foundations` → slug `foundations` "Engineering Foundations" (icon: compass)

Module `01-complexity` "Complexity & the cost model"
1. why-big-o — The cost model: counting operations, the RAM model, why constants are dropped and when that lie hurts
2. asymptotic-notation — O, Ω, Θ, common classes, log intuition, comparing growth, reading complexity off code
3. amortized-analysis — Dynamic arrays, aggregate/accounting/potential methods, amortised vs average vs worst
4. space-complexity-and-memory-hierarchy — Space complexity, auxiliary vs total, caches, locality, why arrays beat linked lists in practice
5. recurrences-and-master-theorem — Recurrence trees, substitution, master theorem, solving common recurrences
6. benchmarking-reality — Constant factors, micro-benchmarks, when O(n log n) loses to O(n²), profiling before optimising

Module `02-how-code-runs` "How your code actually runs"
1. stack-heap-and-the-call-stack — Frames, return addresses, recursion depth, stack overflow, heap allocation
2. values-references-and-mutation — Value vs reference semantics across Python/JS/Go/Rust, aliasing bugs, copying costs
3. memory-management — Garbage collection (tracing, generational), reference counting, Rust ownership, leaks in GC languages
4. numbers-strings-unicode — Integer widths & overflow, floats & precision, strings, UTF-8/UTF-16, string building costs
5. from-source-to-execution — Compilers vs interpreters vs JITs, bytecode, why Python is slow, why Rust/Go are fast

Module `03-math-for-engineers` "Math that shows up at work and in interviews"
1. logarithms-and-exponentials — Log rules, halving, doubling, why log n is "free", powers of two you must know
2. modular-arithmetic-and-hashing-math — Mod, overflow-safe arithmetic, polynomial hashing, why primes
3. counting-and-combinatorics — Permutations, combinations, pigeonhole, inclusion-exclusion, counting subsets/paths
4. probability-for-engineers — Expected value, birthday paradox, reservoir sampling, randomised algorithms, load balancing math
5. bit-manipulation — AND/OR/XOR tricks, masks, counting bits, subsets via masks, two's complement
6. number-theory-essentials — GCD/LCM, primes & sieve, fast exponentiation, modular inverse

Module `04-problem-solving` "How to think about problems"
1. the-problem-solving-loop — Understand → examples → brute force → optimise → code → test; the protocol used in every lesson
2. invariants-and-loop-reasoning — Loop invariants, pre/post conditions, arguing correctness of two-pointer and binary search code
3. pattern-recognition — The catalogue of interview patterns and the signals that select each one
4. testing-your-own-code — Edge-case taxonomy, generating tests, tracing by hand, reading error output
5. communicating-while-solving — Thinking aloud, structuring explanations, complexity discussion, handling hints

## Phase 2 — Data structures & algorithms

### Track `02-data-structures` → slug `data-structures` "Core Data Structures" (icon: layers)

Module `01-arrays-strings` "Arrays and strings" (prereq: foundations/complexity)
1. arrays-and-dynamic-arrays — Contiguous memory, indexing, growth strategy, insertion costs, Python list/JS array/Vec internals
2. strings-in-depth — Immutability, builders, slicing costs, common string ops complexity, Unicode pitfalls
3. two-dimensional-arrays — Row-major layout, grids as graphs, matrix traversal patterns, in-place rotation/transposition
4. prefix-sums-and-difference-arrays — Range sums in O(1), 2D prefix sums, difference arrays for range updates
5. in-place-techniques — Two pointers, swap-based partitioning, reverse tricks, Dutch national flag

Module `02-linked-lists` "Linked lists"
1. linked-list-fundamentals — Nodes, pointers, singly/doubly, sentinels, when linked lists win (LRU, allocators)
2. reversal-and-runner-techniques — Iterative/recursive reversal, fast/slow pointers, middle, nth from end
3. cycle-detection — Floyd's algorithm and its proof, finding cycle start, applications beyond lists
4. merging-and-partitioning — Merge sorted lists, k-way merge, partition around value, reorder problems

Module `03-stacks-queues` "Stacks, queues and deques"
1. stacks-and-queues — Array/list implementations, ring buffers, queue via two stacks, complexity
2. monotonic-stack — Next greater element, histogram, stock span; the invariant and why it is O(n)
3. monotonic-deque — Sliding window maximum, the invariant, contrast with heaps
4. stack-applications — Parsing, expression evaluation, undo, DFS without recursion, call stacks

Module `04-hashing` "Hashing" (prereq: foundations/math-for-engineers)
1. hash-functions — What makes a good hash, uniformity, avalanche, hashing compound keys, hash DoS
2. hash-tables — Chaining vs open addressing, load factor, resizing, tombstones, real implementations (Python dict, Swiss tables)
3. hash-maps-in-interviews — Frequency counting, complement lookup, grouping, dedupe; the pattern family
4. ordered-maps-vs-hash-maps — When you need order: TreeMap/BTreeMap, sorted containers, skip lists
5. hashing-at-scale — Consistent hashing, rendezvous hashing, bloom filters preview, sharding keys

Module `05-trees` "Trees" (prereq: data-structures/linked-lists)
1. tree-fundamentals — Terminology, representations, recursion on trees, height/depth/size
2. binary-tree-traversals — Pre/in/post/level order, iterative versions, Morris traversal, choosing a traversal
3. binary-search-trees — Insert/search/delete, in-order property, validation, degenerate trees
4. balanced-trees — Why balance matters, AVL rotations, red-black intuition, B-trees preview
5. tree-recursion-patterns — Height, diameter, path sums, LCA, top-down vs bottom-up, returning tuples
6. n-ary-trees-and-serialization — General trees, serialisation/deserialisation, tries preview, file systems

Module `06-heaps` "Heaps and priority queues"
1. binary-heap-mechanics — Array layout, sift up/down, heapify in O(n), heap sort
2. priority-queues-in-practice — Scheduling, Dijkstra, event simulation, language PQ APIs, stability
3. top-k-and-k-way-merge — Top-k patterns, k-way merge, streaming median with two heaps
4. indexed-heaps-and-decrease-key — Decrease-key, lazy deletion, indexed heaps, when to use a balanced tree instead

Module `07-tries-and-string-structures` "Tries and string structures"
1. tries — Structure, insert/search/prefix, memory trade-offs, compressed tries, autocomplete
2. string-matching — Naive, KMP failure function, Rabin-Karp rolling hash, Z-algorithm
3. suffix-structures — Suffix arrays, LCP, suffix trees intuition, applications

Module `08-graphs` "Graphs" (prereq: data-structures/stacks-queues, data-structures/hashing)
1. graph-representations — Adjacency list/matrix/edge list, implicit graphs, directed/weighted, choosing a representation
2. breadth-first-search — Queue mechanics, levels, shortest path in unweighted graphs, multi-source BFS, grid BFS
3. depth-first-search — Recursive/iterative, discovery/finish times, edge classification, path finding
4. connectivity-and-cycles — Components, cycle detection (directed/undirected), bipartite check
5. topological-sort-and-dags — Kahn's algorithm, DFS ordering, DAG properties, dependency resolution, build systems
6. graphs-in-the-real-world — Social graphs, dependency graphs, state machines as graphs, modelling problems as graphs

### Track `03-algorithms` → slug `algorithms` "Algorithms" (icon: git-branch)

Module `01-sorting-searching` "Sorting and searching" (prereq: data-structures/arrays-strings)
1. comparison-sorts — Insertion, merge, quick (partition schemes, pivot choice), heap sort; stability and memory
2. non-comparison-sorts-and-lower-bounds — Counting, radix, bucket; the Ω(n log n) lower bound; what real sort() uses (Timsort, pdqsort)
3. binary-search — The invariant, first/last occurrence, rotated arrays, floating-point search, off-by-one discipline
4. binary-search-on-the-answer — Monotone predicates, minimise-the-maximum problems, capacity/threshold search
5. selection-and-order-statistics — Quickselect, median of medians, k-th smallest in practice

Module `02-recursion-backtracking` "Recursion and backtracking" (prereq: foundations/how-code-runs)
1. recursion-design — Base cases, trusting the recursive call, converting to iteration, tail calls
2. generating-combinatorial-objects — Subsets, permutations, combinations, handling duplicates
3. constraint-satisfaction — N-queens, sudoku, word search; pruning, ordering, bitmask state
4. from-backtracking-to-memoisation — Recognising overlapping subproblems; the bridge to DP

Module `03-dynamic-programming` "Dynamic programming" (prereq: algorithms/recursion-backtracking)
1. the-dp-mindset — Optimal substructure, overlapping subproblems, state definition, top-down vs bottom-up
2. one-dimensional-dp — Climbing stairs, house robber, coin change, decode ways; state transitions
3. grid-and-two-dimensional-dp — Unique paths, min path sum, obstacle grids, space optimisation
4. string-dp — LCS, edit distance, longest palindromic substring/subsequence, regex matching
5. knapsack-family — 0/1, unbounded, subset sum, partition, bounded; the transition template
6. sequence-dp — LIS (n² and n log n), maximum subarray, best time to buy/sell, state machines
7. interval-and-tree-dp — Matrix chain, burst balloons, DP on trees (rerooting intro), bitmask DP
8. dp-craft — Reconstructing solutions, memory optimisation, recognising DP in disguise, when DP is wrong

Module `04-greedy` "Greedy algorithms"
1. greedy-and-exchange-arguments — When greedy works, proving it, when it fails (coin systems)
2. interval-problems — Scheduling, merging, minimum arrows, meeting rooms; sorting keys that unlock greed
3. classic-greedy-algorithms — Huffman coding, jump game, gas station, task scheduling, Dijkstra as greedy

Module `05-graph-algorithms` "Graph algorithms" (prereq: data-structures/graphs, data-structures/heaps)
1. shortest-paths-dijkstra — Mechanics, proof sketch, heap implementation, 0-1 BFS, negative edges
2. bellman-ford-and-floyd-warshall — Relaxation rounds, negative cycles, all-pairs, when each applies
3. minimum-spanning-trees — Prim, Kruskal, cut property, union-find role
4. union-find — Path compression, union by rank, near-constant time, offline connectivity, Kruskal
5. strongly-connected-components — Tarjan, Kosaraju, condensation DAG, 2-SAT preview
6. bridges-articulation-and-flow — Low-link values, bridges/articulation points, max-flow intuition & bipartite matching
7. a-star-and-heuristic-search — Admissible heuristics, A* on grids, when it beats Dijkstra

Module `06-divide-and-conquer` "Divide and conquer"
1. divide-and-conquer-thinking — Recurrence, master theorem applied, merge sort and inversion counting
2. classic-divide-and-conquer — Closest pair, fast exponentiation, Karatsuba, majority element, Strassen intuition
3. fft-intuition — Polynomial multiplication, why FFT is O(n log n), where it appears in practice

Module `07-technique-mastery` "Technique mastery" (prereq: algorithms/sorting-searching)
1. sliding-window-mastery — Fixed/variable windows, shrink conditions, counts with hash maps, at-most-k trick
2. two-pointers-mastery — Opposite ends, same direction, three pointers, sorted-array assumptions
3. prefix-sums-and-hashing-tricks — Subarray sum equals k, modulo tricks, XOR prefix
4. meet-in-the-middle-and-randomisation — Splitting search spaces, randomised algorithms, reservoir sampling, hashing with random seeds
5. bit-tricks-in-algorithms — Bitmask enumeration, Gray codes, lowbit, bitset optimisations
6. sweep-line-and-geometry — Event sweeps (skyline, interval union, meeting rooms), orientation tests, convex hull (monotone chain), closest pair by sweep, floating-point precision

### Track `04-advanced-data-structures` → slug `advanced-data-structures` "Advanced Data Structures" (icon: box)

Module `01-balanced-trees` "Balanced search trees" (prereq: data-structures/trees)
1. avl-trees — Balance factors, rotations, insert/delete, when AVL beats red-black
2. red-black-trees — Properties, why they are used in std libraries, insertion cases intuition
3. b-trees-and-b-plus-trees — Fan-out, disk pages, why databases use them, range scans
4. treaps-skip-lists-and-splay — Randomised balance, skip lists (Redis), splay trees and locality

Module `02-range-queries` "Range query structures" (prereq: data-structures/trees)
1. segment-trees — Build, point update, range query, iterative implementation
2. lazy-propagation — Range updates, pending values, common bugs
3. fenwick-trees — Binary indexed trees, lowbit, prefix sums and inversions
4. sparse-tables-and-sqrt-decomposition — Idempotent RMQ, offline vs online, block decomposition

Module `03-probabilistic-structures` "Probabilistic data structures" (prereq: foundations/math-for-engineers)
1. bloom-filters — Bits, hash functions, false positive math, sizing, counting bloom filters, real uses (Cassandra, CDNs)
2. count-min-sketch-and-hyperloglog — Frequency estimation, cardinality estimation, error bounds, analytics at scale
3. minhash-and-lsh — Similarity estimation, near-duplicate detection, vector search preview

Module `04-caches-and-eviction` "Caches and eviction policies" (prereq: data-structures/hashing, data-structures/linked-lists)
1. lru-cache — Hash map + doubly linked list, O(1) everything, the classic interview design
2. lfu-and-modern-policies — O(1) LFU, ARC/2Q/TinyLFU intuition, what Redis/Caffeine actually do
3. cache-design-considerations — TTLs, sizing, hit ratio math, thundering herds, negative caching

Module `05-log-structured-and-disk-structures` "Disk-oriented structures" (prereq: advanced-data-structures/balanced-trees)
1. write-ahead-logs — Durability, fsync, group commit, replay, checkpointing
2. lsm-trees-and-sstables — Memtables, compaction strategies, read amplification, bloom filters in LSMs
3. b-tree-vs-lsm — Read/write/space amplification, workload fit, RocksDB vs InnoDB vs Postgres
4. merkle-trees-and-ring-buffers — Integrity verification, anti-entropy, ring buffers, lock-free SPSC queues

Module `06-advanced-strings` "Advanced string algorithms" (prereq: data-structures/tries-and-string-structures)
1. aho-corasick — Multi-pattern matching, failure links, applications (filters, IDS)
2. suffix-arrays-and-lcp — Construction, LCP array, longest repeated substring
3. manacher-and-palindromes — Linear-time palindromes, when to use expand-around-center instead

Module `07-spatial-and-persistent` "Spatial and persistent structures" (prereq: advanced-data-structures/balanced-trees)
1. spatial-indexes — Quadtrees, k-d trees, R-trees, geohash/S2/H3 cells, nearest-neighbour and range queries, how maps and ride-sharing index locations
2. persistent-and-immutable-structures — Path copying, fat nodes, persistent vectors and HAMTs (Clojure/Scala/Immutable.js), Git's object model, snapshots and undo

## Phase 3 — Interview patterns & practice

### Track `05-interview-patterns` → slug `interview-patterns` "Coding Interview Patterns" (icon: activity)
Each pattern lesson: the signal that selects the pattern, the template code, 2–3 fully worked problems with traces, variations, complexity, and pitfalls. Tag each with `pattern:<slug>` and link the problems in `problems:`.

Module `01-array-patterns` "Array & string patterns" (prereq: algorithms/technique-mastery)
1. two-pointers (pattern:two-pointers)
2. sliding-window (pattern:sliding-window)
3. prefix-sum (pattern:prefix-sum)
4. binary-search (pattern:binary-search)
5. sorting-based-patterns (pattern:sorting)
6. intervals (pattern:intervals)
7. cyclic-sort (pattern:cyclic-sort)
8. kadane-and-subarrays (pattern:subarray)
9. matrix-traversal (pattern:matrix)

Module `02-sequence-patterns` "Linked list, stack, heap & hashing patterns" (prereq: data-structures/heaps)
1. hash-map-patterns (pattern:hash-map)
2. fast-slow-pointers (pattern:fast-slow-pointers)
3. in-place-linked-list (pattern:linked-list)
4. stack-patterns (pattern:stack)
5. monotonic-stack-pattern (pattern:monotonic-stack)
6. top-k-elements (pattern:heap)
7. two-heaps (pattern:two-heaps)
8. k-way-merge (pattern:k-way-merge)

Module `03-tree-and-graph-patterns` "Tree & graph patterns" (prereq: algorithms/graph-algorithms)
1. tree-bfs (pattern:tree-bfs)
2. tree-dfs (pattern:tree-dfs)
3. graph-traversal (pattern:graph)
4. topological-sort-pattern (pattern:topological-sort)
5. union-find-pattern (pattern:union-find)
6. shortest-path-pattern (pattern:shortest-path)
7. trie-pattern (pattern:trie)

Module `04-combinatorial-patterns` "Backtracking, DP, greedy & design" (prereq: algorithms/dynamic-programming)
1. backtracking-pattern (pattern:backtracking)
2. dp-patterns (pattern:dynamic-programming)
3. greedy-pattern (pattern:greedy)
4. bit-manipulation-pattern (pattern:bit-manipulation)
5. math-and-geometry (pattern:math)
6. design-problems (pattern:design)

Module `05-interview-execution` "Executing the coding round"
1. the-45-minute-protocol — Minute-by-minute plan, what to say when
2. clarifying-and-scoping — Questions that matter, assumptions, constraints that change the approach
3. testing-live — Choosing test cases, tracing, catching bugs before the interviewer does
4. getting-unstuck — Recognising you are stuck, using hints, switching approaches gracefully
5. senior-signals-in-coding-rounds — What separates senior from mid-level in the same problem

## Phase 4 — Systems, networking & databases

### Track `06-systems-and-concurrency` → slug `systems` "Operating Systems & Concurrency" (icon: cpu)

Module `01-operating-systems` "Operating systems essentials" (prereq: foundations/how-code-runs)
1. processes-and-threads — Address spaces, context switches, scheduling, threads vs processes, containers
2. virtual-memory — Paging, TLB, page faults, mmap, memory-mapped files, OOM
3. io-and-syscalls — Blocking/non-blocking, epoll/kqueue/io_uring, file descriptors, zero-copy
4. filesystems-and-storage — Inodes, journaling, fsync semantics, SSD vs HDD, RAID basics

Module `02-concurrency` "Concurrency and parallelism" (prereq: systems/operating-systems)
1. races-mutexes-and-invariants — Data races, critical sections, mutex mechanics, lock granularity
2. deadlock — The four conditions, lock ordering, detection, timeouts, livelock/starvation
3. condition-variables-and-semaphores — Waiting correctly, spurious wakeups, bounded buffer
4. atomics-and-lock-free — CAS, memory ordering, ABA, lock-free queues, when to avoid them
5. thread-pools-and-work-stealing — Sizing, queues, backpressure, executor design
6. async-and-event-loops — Node's loop, Tokio, cooperative scheduling, blocking the loop, async pitfalls
7. actors-channels-and-csp — Go channels, Rust channels, Erlang actors; message passing vs shared memory
8. concurrency-interview-problems — Bounded buffer, readers-writers, dining philosophers, rate limiter, print in order

Module `03-performance-engineering` "Performance engineering"
1. profiling-and-measurement — Flame graphs, sampling vs instrumentation, p99 thinking, Amdahl's law
2. cpu-caches-and-memory-layout — Cache lines, false sharing, struct layout, SoA vs AoS, branch prediction
3. io-bound-vs-cpu-bound — Diagnosing, scaling strategies, connection pools, batching
4. benchmarking-pitfalls — Warm-up, JIT, noise, statistics, benchmarking in CI

### Track `07-databases` → slug `databases` "Databases Inside Out" (icon: database)

Module `01-relational-fundamentals` "Relational fundamentals" (prereq: data-structures/hashing)
1. the-relational-model — Relations, keys, normalisation (1NF–BCNF), when to denormalise
2. sql-and-query-plans — Joins (nested loop, hash, merge), EXPLAIN, statistics, the optimiser
3. indexes — B-tree/hash/GIN/BRIN, composite & covering indexes, selectivity, index-only scans, write cost
4. transactions-and-acid — Atomicity, durability via WAL, isolation as a spectrum
5. isolation-levels-and-anomalies — Dirty/non-repeatable/phantom reads, write skew, serialisable
6. mvcc-and-locking — Postgres MVCC, vacuum, row locks, deadlocks, advisory locks

Module `02-storage-and-scale` "Storage engines and scaling" (prereq: databases/relational-fundamentals)
1. storage-engine-internals — Pages, heap files, buffer pool, WAL, checkpoints, crash recovery
2. replication — Streaming/logical replication, lag, failover, read-your-writes
3. partitioning-and-sharding — Table partitioning, shard keys, resharding, cross-shard queries
4. connection-management — Pooling, PgBouncer, max connections math, timeouts

Module `03-nosql-and-specialised` "NoSQL and specialised stores"
1. key-value-stores-and-redis — Redis data structures, persistence (RDB/AOF), eviction, cluster mode
2. document-stores — MongoDB modelling, embedding vs referencing, indexes, transactions
3. wide-column-stores — Cassandra/Dynamo: partition keys, LSM, tunable consistency, anti-patterns
4. search-engines — Inverted indexes, Elasticsearch, relevance, analyzers
5. graph-time-series-and-vector-databases — When each fits, storage tricks, vector indexes (HNSW)
6. choosing-a-database — A decision framework: access patterns, consistency, scale, ops cost

Module `04-data-modeling-and-evolution` "Data modelling and schema evolution"
1. modelling-for-access-patterns — Start from queries, denormalisation, materialised views
2. schema-migrations-at-scale — Expand/contract, online DDL, backfills, feature flags for data
3. orms-and-n-plus-one — ORM pitfalls, N+1, lazy loading, raw SQL escape hatches, SeaORM in this app
4. caching-layers — Cache-aside vs read-through, invalidation, consistency with the database

### Track `08-networking` → slug `networking` "Networking from Wire to Web" (icon: network)

Module `01-fundamentals` "Networking fundamentals"
1. layers-and-encapsulation — OSI vs TCP/IP, headers, MTU, why layers exist
2. ip-addressing-and-routing — IPv4/IPv6, subnets, NAT, routing tables, BGP intuition, anycast
3. dns — Resolution path, caching, TTLs, record types, DNS-based load balancing, failure modes
4. udp-vs-tcp — Datagrams vs streams, when UDP wins, QUIC preview
5. tcp-deep-dive — Handshake, sequence/ack, retransmission, flow control, Nagle, teardown, TIME_WAIT
6. congestion-control — Slow start, AIMD, Cubic, BBR, bufferbloat, what latency graphs tell you
7. tls-and-pki — TLS 1.3 handshake, certificates, chains, mTLS, why HTTPS is fast now
8. nat-firewalls-and-cloud-networking — NAT/PAT tables and traversal (STUN/TURN/ICE), stateful firewalls and security groups, VPCs, subnets, private endpoints and peering, zero trust, egress costs

Module `02-application-protocols` "Application protocols" (prereq: networking/fundamentals)
1. http-1-1 — Semantics, headers, caching (ETag, Cache-Control), keep-alive, head-of-line blocking
2. http-2-and-http-3 — Multiplexing, HPACK, server push, QUIC, 0-RTT, when to adopt
3. real-time-transports — WebSockets, SSE (as used in this app), long polling, WebRTC intro
4. grpc-and-protobuf — Binary encoding, streaming, deadlines, versioning, when REST is better
5. api-styles — REST vs GraphQL vs RPC, idempotency, pagination, error design
6. cdns-and-edge — Caching hierarchy, cache keys, invalidation, edge compute, Netflix Open Connect
7. load-balancing — L4 vs L7, algorithms, health checks, sticky sessions, global LB

Module `03-network-algorithms` "Network algorithms" (prereq: algorithms/graph-algorithms)
1. routing-algorithms — Link-state (Dijkstra/OSPF), distance-vector (Bellman-Ford/RIP), path-vector (BGP)
2. reliable-delivery-algorithms — Sliding window, go-back-n, selective repeat, sequence numbers
3. error-detection — Checksums, CRC, hashes; what each layer verifies
4. rate-limiting-algorithms — Token bucket, leaky bucket, sliding window log/counter, distributed limiting
5. consistent-hashing-and-routing — Ring, virtual nodes, rendezvous hashing, request routing in meshes

Module `04-networking-in-practice` "Networking in practice"
1. latency-bandwidth-and-math — RTT, bandwidth-delay product, tail latency, back-of-envelope estimates
2. timeouts-retries-and-backoff — Timeout budgets, exponential backoff with jitter, idempotency, retry storms
3. connection-pooling-and-keep-alive — Pool sizing, connection reuse, DNS + pool interactions
4. debugging-the-network — curl, dig, tcpdump, mtr, reading a packet capture
5. service-meshes-and-proxies — Reverse proxies, sidecars, mTLS, observability at L7

## Phase 5 — System design & big data

### Track `09-system-design` → slug `system-design` "System Design" (icon: server)

Module `01-building-blocks` "System design building blocks" (prereq: databases/relational-fundamentals, networking/application-protocols)
1. the-design-interview-method — Requirements, estimates, API, data model, high-level, deep dive, wrap-up
2. back-of-envelope-estimation — Latency numbers, throughput, storage, QPS, cost; worked estimates
3. scalability-primitives — Stateless services, horizontal scaling, load balancers, autoscaling
4. caching-strategies — Levels, cache-aside/read-through/write-through/write-behind, invalidation, stampedes
5. database-scaling — Read replicas, sharding strategies, hot keys, secondary indexes across shards
6. consistency-models — Linearizability, sequential, causal, eventual; read-your-writes; what clients see
7. cap-and-pacelc — What CAP actually says, PACELC, choosing per operation
8. idempotency-and-retries — Idempotency keys, exactly-once illusions, deduplication
9. queues-and-async-processing — Kafka vs RabbitMQ vs SQS, delivery guarantees, DLQs, ordering
10. event-driven-architecture — Events vs commands, choreography vs orchestration, schema evolution
11. microservices-vs-monolith — Boundaries, data ownership, the distributed monolith trap
12. api-design-and-versioning — Contracts, backwards compatibility, pagination, rate limits
13. observability — Metrics, logs, traces, SLOs/SLIs, alerting, what to instrument
14. resilience-patterns — Timeouts, circuit breakers, bulkheads, backpressure, load shedding, chaos
15. security-in-design — AuthN/AuthZ, OAuth/OIDC, secrets, encryption, rate limiting, threat modelling

Module `02-distributed-systems` "Distributed systems" (prereq: system-design/building-blocks, systems/concurrency)
1. time-and-ordering — Physical clocks, NTP, Lamport clocks, vector clocks, happens-before
2. replication-strategies — Leader/follower, multi-leader, leaderless, quorums, conflict resolution
3. consensus-raft — Leader election, log replication, safety, membership changes, real Raft (etcd)
4. paxos-and-zab-intuition — Why consensus is hard, Paxos roles, ZooKeeper's ZAB
5. distributed-transactions — 2PC, its failure modes, sagas, transactional outbox
6. partitioning-and-rebalancing — Consistent hashing, rebalancing without downtime, hot spots
7. failure-detection-and-leases — Heartbeats, timeouts, leases, fencing tokens
8. distributed-locks-and-coordination — Redlock debate, ZooKeeper/etcd locks, leader election patterns
9. exactly-once-semantics — Idempotent producers, transactional messaging, dedupe stores
10. gossip-and-anti-entropy — Membership, Merkle-based repair, SWIM
11. crdts-and-collaboration — CRDT types, OT vs CRDT, Google Docs-style systems

Module `03-case-studies` "Case studies" (prereq: system-design/distributed-systems)
Each: requirements → estimates → API → data model → high-level design (Mermaid) → deep dives → failure modes → senior follow-ups.
1. url-shortener
2. rate-limiter
3. distributed-key-value-store
4. news-feed
5. chat-system
6. video-streaming-netflix — Encoding pipeline, Open Connect CDN, adaptive bitrate, playback telemetry, personalisation pipeline
7. video-upload-pipeline
8. search-autocomplete
9. notification-system
10. ride-sharing
11. payment-system
12. distributed-cache
13. metrics-and-logging-platform
14. web-crawler
15. collaborative-editing
16. ticket-booking
17. ad-click-aggregation
18. netflix-microservices-and-resilience — Zuul/Eureka/Hystrix lineage, chaos engineering, regional failover

Module `04-senior-design-skills` "Designing like a senior"
1. articulating-trade-offs — Frameworks for comparing options, saying what you would not do
2. designing-for-failure — Failure taxonomy, blast radius, graceful degradation, DR and multi-region
3. capacity-planning-and-cost — Growth modelling, cost per request, reserved vs on-demand thinking
4. migrations-and-evolution — Strangler fig, dual writes, backfills, deprecations
5. presenting-a-design — Whiteboard flow, time management, driving the conversation, the senior bar

### Track `10-big-data` → slug `big-data` "Big Data & Streaming" (icon: workflow)

Module `01-batch-processing` "Batch processing" (prereq: system-design/building-blocks)
1. mapreduce — The model, shuffles, combiners, why it mattered, why it was replaced
2. distributed-file-systems — HDFS/S3 semantics, blocks, replication, consistency of object stores
3. spark — RDDs/DataFrames, lazy execution, shuffles, partitioning, joins, skew
4. columnar-formats-and-lakehouses — Parquet/ORC, predicate pushdown, Iceberg/Delta, table formats
5. olap-engines — ClickHouse/BigQuery/Presto/Trino architectures, vectorised execution

Module `02-streaming` "Stream processing" (prereq: big-data/batch-processing)
1. kafka-internals — Partitions, replication/ISR, consumer groups, offsets, retention, exactly-once
2. stream-processing-model — Event time vs processing time, windows, watermarks, late data
3. stateful-streaming — State backends, checkpoints, Flink/Kafka Streams, rescaling
4. lambda-vs-kappa — Architectures, reprocessing, stream-table duality
5. change-data-capture — Debezium, outbox, keeping caches and search in sync

Module `03-data-platforms` "Data platforms"
1. etl-elt-and-orchestration — Pipelines, Airflow/Dagster, idempotent jobs, backfills
2. dimensional-modelling — Star/snowflake schemas, slowly changing dimensions
3. data-quality-lineage-and-governance — Contracts, tests, lineage, privacy at scale
4. ml-data-pipelines — Feature stores, training/serving skew, Netflix's data platform patterns

## Phase 6 — AI, modern tooling & senior craft

### Track `11-ai-and-llms` → slug `ai-and-llms` "AI, LLMs & RAG" (icon: brain)

Module `01-ml-foundations` "Machine learning foundations" (prereq: foundations/math-for-engineers)
1. what-a-model-is — Functions, parameters, loss, gradient descent, worked linear regression
2. neural-networks — Neurons, layers, activations, forward pass, backprop intuition with numbers
3. training-and-generalisation — Train/val/test, overfitting, regularisation, evaluation metrics
4. classical-ml-you-should-know — Trees/forests/boosting, kNN, k-means, logistic regression, when not to use deep learning
5. embeddings-and-similarity — Vectors, cosine similarity, learned embeddings, nearest-neighbour search
6. vector-search-internals — Brute force vs IVF vs HNSW vs product quantisation, recall/latency/memory trade-offs, filtered search, index build and update costs, pgvector vs dedicated stores

Module `02-how-llms-work` "How LLMs work" (prereq: ai-and-llms/ml-foundations)
1. tokenization — BPE, vocabularies, why tokens matter for cost and behaviour
2. the-transformer — Attention, multi-head, MLP, residuals, positional encoding; walk through one block
3. generation-and-sampling — Next-token prediction, temperature, top-p, beam search, stopping
4. context-windows-and-kv-cache — Why context is quadratic, KV cache, long-context tricks
5. training-llms — Pretraining, SFT, RLHF/DPO, scaling laws, data
6. capabilities-and-failure-modes — Hallucination, reasoning, tool use, evaluation, what to trust
7. inference-serving — Batching, quantisation, speculative decoding, latency/cost engineering

Module `03-building-with-llms` "Building with LLMs" (prereq: ai-and-llms/how-llms-work)
1. prompt-engineering-that-works — Structure, examples, constraints, system prompts, what does not work
2. structured-outputs-and-tool-use — JSON schemas, function calling, agent loops, validation
3. retrieval-augmented-generation — Chunking, embeddings, vector DBs, hybrid search, reranking, evaluation
4. agents — Planning, memory, tools, MCP, guardrails, when agents are the wrong tool
5. evals-and-observability — Building eval sets, LLM-as-judge, regression testing prompts, tracing
6. llm-security — Prompt injection, data exfiltration, sandboxing, least privilege for tools
7. llm-system-design — Designing a docs chatbot and a coding copilot: latency, cost, caching, budgets (this app's coach as a case)

### Track `12-ai-assisted-engineering` → slug `ai-assisted-engineering` "AI-Assisted Engineering" (icon: sparkles)

Module `01-tools-and-workflows` "Tools and workflows"
1. the-landscape — Claude Code, OpenAI Codex, GitHub Copilot, Cursor, Gemini CLI: what each is good at
2. agentic-coding-workflow — Plan → implement → verify loops, scoping tasks, reviewing diffs
3. writing-effective-specs — Task specs, CLAUDE.md/AGENTS.md, constraints, acceptance criteria
4. context-management — What to give the model, repo maps, memory files, avoiding context rot
5. mcp-and-integrations — MCP servers, tool permissions, connecting to your infra safely
6. verifying-ai-code — Tests, property checks, reading generated code critically, security review
7. ai-tool-security-and-policy — Secrets, data handling, licensing, what to never paste

Module `02-senior-engineering-with-ai` "Senior engineering with AI"
1. ai-in-design-and-review — Design docs, code review, ADRs with AI assistance
2. ai-assisted-debugging-and-incidents — Log analysis, hypothesis generation, guardrails on prod actions
3. learning-without-atrophy — Using AI to learn deeper, not shallower; deliberate practice
4. the-ai-native-interview — How companies evaluate AI-assisted coding; what to demonstrate (this app's assisted mock interview)
5. what-to-still-do-by-hand — Skills that must stay sharp and why

### Track `13-senior-craft` → slug `senior-craft` "Senior Engineer Craft" (icon: briefcase)

Module `01-software-craft` "Software craft"
1. architecture-and-boundaries — Layers, dependency direction, hexagonal architecture; this app's core/api split
2. api-and-error-design — Contracts, error taxonomies, pagination, versioning, this app's AppError
3. testing-strategy — Pyramid, contract tests, property-based tests, test data, flaky tests
4. security-fundamentals — OWASP top 10, authn/authz, sessions vs JWTs, CSRF, secrets; this app's choices
5. ci-cd-and-deployment — Pipelines, environments, blue/green, canary, rollbacks, migrations in deploys
6. containers-and-infrastructure-as-code — Docker, images, Kubernetes basics, Terraform, GitOps
7. observability-in-code — Structured logs, metrics, tracing, request IDs (this app)
8. documentation-and-adrs — READMEs, ADRs, runbooks, writing for future engineers
9. authentication-and-authorization — OAuth 2 flows and PKCE, OIDC, sessions vs JWTs in depth, refresh tokens and revocation, RBAC/ABAC, SSO/SAML basics, key rotation

Module `02-languages-for-senior-engineers` "Languages"
1. rust-essentials — Ownership, borrowing, lifetimes, traits, enums, async; reading this app's backend
2. go-essentials — Goroutines, channels, interfaces, errors, when Go wins
3. typescript-deep-dive — Type system, generics, narrowing, discriminated unions, this app's frontend
4. python-idioms-for-interviews — Data structures, comprehensions, itertools, gotchas, performance
5. jvm-essentials — Memory model, GC, concurrency utilities, why it matters at Netflix
6. choosing-an-interview-language — Trade-offs, what interviewers expect, switching languages safely

Module `03-technical-leadership` "Technical leadership"
1. what-senior-means — Scope, ambiguity, ownership, leverage; the ladders at FAANG and Netflix
2. leading-without-authority — Influence, alignment, driving decisions, disagreement
3. code-review-as-mentorship — Reviewing for design, teaching through review, tone
4. design-docs-and-rfcs — Structure, alternatives, decision records, gathering feedback
5. incidents-and-postmortems — Incident command, communication, blameless postmortems, action items
6. estimation-planning-and-prioritisation — Breaking down work, risk, saying no, roadmaps
7. cross-team-and-organisational-impact — Platforms, standards, working with product and leadership

Module `04-getting-the-job` "Getting the senior job"
1. the-faang-loop — Stages, what each round measures, how decisions are made, hiring committees
2. behavioral-interviews-for-seniors — STAR+, story bank, senior-level stories, follow-up handling
3. netflix-culture-and-interviews — Freedom & responsibility, keeper test, senior-only hiring, what the loop looks like
4. resume-and-screens — Senior resumes, recruiter screens, phone screens, referrals
5. negotiation — Levelling, compensation structures, negotiating an offer
6. the-first-90-days — Landing as a senior, building trust, early wins, avoiding traps

### Track `14-case-study-ascend` → slug `case-study-ascend` "Case Study: How Ascend Is Built" (icon: shield, phase 6)
Walks through this repository as a production reference. Every lesson cites real files and line-level
patterns, explains the alternatives that were rejected, and ends with "what we would change at 100x".

Module `01-the-system` "The system end to end" (prereq: senior-craft/software-craft)
1. tour-of-the-repository — Layout, the core/api boundary, how to read an unfamiliar codebase in an hour
2. anatomy-of-a-request — Middleware order, extractors and per-request caching, thin routes, AppError to HTTP
3. the-content-engine — Content as code, include_dir, block extraction, answer stripping, validation as CI, ETags, search
4. authentication-and-security — Argon2id, hashed opaque sessions, timing, layered CSRF, CSP, rate limiting, secrets
5. data-and-migrations — Schema walk-through, composite keys, single-statement upserts, cascades, append-only migrations

Module `02-product-systems` "Product systems" (prereq: case-study-ascend/the-system)
1. building-the-ai-coach — The typed Anthropic client, SSE streaming through a channel, prompt caching order, budgets
2. designing-mock-interviews — Solo vs assisted, transcripts, JSON-schema rubrics, locking the coach
3. running-code-in-the-browser — Web Workers, Pyodide, the test harness, time limits by termination, trust model
4. the-visualisation-engine — Frames as snapshots, pure generators, the DSL families, testing 250 animations

Module `03-shipping` "Shipping and operating" (prereq: case-study-ascend/product-systems)
1. testing-the-system — Unit, API integration against real Postgres, Vitest, Playwright, validators that execute content
2. build-and-deploy — Multi-stage Docker with cargo-chef, distroless, infrastructure as code, health-gated rollouts
3. what-we-would-change-at-scale — The scaling roadmap, the known weaknesses, and a design review of this codebase

## Practice problems — the Ascend 150

Lists: `core-75` (a subset) and `ascend-150`. Patterns must match the
`pattern:` slugs above. Difficulty in parentheses; `*` marks core-75.

hash-map: two-sum* (e), contains-duplicate* (e), valid-anagram* (e), group-anagrams* (m), top-k-frequent* (m), encode-decode-strings (m), product-except-self* (m), longest-consecutive-sequence* (m), valid-sudoku (m), first-missing-positive (h)
two-pointers: valid-palindrome* (e), two-sum-sorted (m), three-sum* (m), container-with-most-water* (m), trapping-rain-water (h), remove-duplicates-sorted (e), move-zeroes (e), sort-colors (m)
sliding-window: best-time-to-buy-sell* (e), longest-substring-no-repeat* (m), longest-repeating-replacement* (m), permutation-in-string (m), minimum-window-substring* (h), sliding-window-maximum (h), max-consecutive-ones-iii (m)
stack: valid-parentheses* (e), min-stack* (m), evaluate-rpn (m), generate-parentheses* (m), daily-temperatures (m), car-fleet (m), largest-rectangle-histogram (h), decode-string (m)
monotonic-stack: next-greater-element (e), remove-k-digits (m)
binary-search: binary-search-basic (e), search-2d-matrix (m), koko-eating-bananas (m), find-min-rotated* (m), search-rotated* (m), time-based-kv (m), median-two-sorted (h), first-bad-version (e), sqrt-x (e)
linked-list: reverse-linked-list* (e), merge-two-sorted-lists* (e), reorder-list* (m), remove-nth-from-end* (m), copy-random-list (m), add-two-numbers (m), lru-cache* (m), merge-k-sorted-lists* (h), reverse-nodes-k-group (h), palindrome-linked-list (e)
fast-slow-pointers: linked-list-cycle* (e), find-duplicate-number (m), middle-of-linked-list (e), happy-number (e)
tree-dfs: invert-binary-tree* (e), max-depth-binary-tree* (e), diameter-binary-tree (e), balanced-binary-tree (e), same-tree* (e), subtree-of-another (e), lowest-common-ancestor-bst* (m), validate-bst* (m), kth-smallest-bst* (m), construct-from-preorder-inorder* (m), max-path-sum* (h), path-sum-ii (m), count-good-nodes (m)
tree-bfs: level-order-traversal* (m), right-side-view (m), zigzag-level-order (m), min-depth (e), serialize-deserialize* (h)
trie: implement-trie* (m), design-add-search-words* (m), word-search-ii* (h), replace-words (m)
heap: kth-largest-stream (e), last-stone-weight (e), k-closest-points (m), kth-largest-array (m), task-scheduler (m), design-twitter (m), reorganize-string (m)
two-heaps: find-median-data-stream* (h), sliding-window-median (h)
k-way-merge: kth-smallest-sorted-matrix (m), smallest-range-k-lists (h)
backtracking: subsets* (m), combination-sum* (m), permutations (m), subsets-ii (m), combination-sum-ii (m), word-search* (m), palindrome-partitioning (m), letter-combinations (m), n-queens (h), sudoku-solver (h)
graph: number-of-islands* (m), clone-graph* (m), max-area-island (m), pacific-atlantic* (m), surrounded-regions (m), rotting-oranges (m), walls-and-gates (m), graph-valid-tree* (m), count-components (m), word-ladder (h)
topological-sort: course-schedule* (m), course-schedule-ii (m), alien-dictionary (h), minimum-height-trees (m)
union-find: redundant-connection (m), accounts-merge (m), number-of-provinces (m)
shortest-path: network-delay-time (m), cheapest-flights-k-stops (m), min-cost-connect-points (m), swim-in-rising-water (h), reconstruct-itinerary (h)
dynamic-programming: climbing-stairs* (e), min-cost-climbing-stairs (e), house-robber* (m), house-robber-ii (m), longest-palindromic-substring* (m), palindromic-substrings (m), decode-ways* (m), coin-change* (m), max-product-subarray (m), word-break* (m), longest-increasing-subsequence* (m), partition-equal-subset (m), unique-paths* (m), longest-common-subsequence* (m), best-time-cooldown (m), coin-change-ii (m), target-sum (m), interleaving-string (m), edit-distance (h), burst-balloons (h), regular-expression-matching (h), distinct-subsequences (h), longest-increasing-path (h)
greedy: maximum-subarray* (m), jump-game* (m), jump-game-ii (m), gas-station (m), hand-of-straights (m), partition-labels (m), valid-parenthesis-string (m)
intervals: insert-interval* (m), merge-intervals* (m), non-overlapping-intervals* (m), meeting-rooms* (e), meeting-rooms-ii* (m), minimum-interval-query (h)
prefix-sum: subarray-sum-equals-k (m), range-sum-query-immutable (e), find-pivot-index (e)
matrix: rotate-image* (m), spiral-matrix* (m), set-matrix-zeroes* (m), happy-number-matrix-placeholder (skip)
math: pow-x-n (m), multiply-strings (m), detect-squares (m), plus-one (e), spiral-matrix-ii (m)
bit-manipulation: single-number (e), number-of-1-bits (e), counting-bits (e), reverse-bits (e), missing-number* (e), sum-of-two-integers (m), reverse-integer (m)
design: lru-cache (listed above), time-based-kv (listed above), min-stack (listed above), design-hashmap (e), design-circular-queue (m), insert-delete-getrandom (m), kth-largest-stream (listed above)

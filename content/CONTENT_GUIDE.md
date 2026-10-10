# Ascend content authoring guide

This is the contract between curriculum authors and the platform. The loader
(`crates/core/src/content`) validates every file at build time; a lesson that
violates this guide fails `cargo test`.

## Who we are writing for

A working software engineer with a bachelor's degree and 3–6 years of
industry experience. They ship code every day but have never had to reason
rigorously about complexity, distributed consistency, or interview-grade
algorithm design. They are aiming for a **senior** role at a top-tier company
(Netflix is the reference bar). They are smart, busy, and allergic to fluff.

## The quality bar (non-negotiable)

1. **Mechanism over vocabulary.** Every concept is explained by *how it works*
   and *why it works*, not by a definition. If you write "a hash table gives
   O(1) lookups", the next sentence must explain the hashing → bucket → probe
   mechanics and when the O(1) lies.
2. **One level deeper than GeeksforGeeks/NeetCode.** Include the trade-off, the
   failure mode, the production consequence, and the interview follow-up
   question a senior interviewer would ask. Name the thing that experienced
   engineers know and juniors don't.
3. **Show, don't summarise.** Worked examples with concrete numbers. Small code
   snippets (Python by default; add Rust/Go/TypeScript when the language
   matters). Tables for comparisons. Mermaid for structure.
4. **Honest about reality.** Say when the textbook answer is wrong in practice
   (constant factors, cache effects, "eventually consistent" meaning seconds).
5. **No filler.** No "In this lesson we will learn…", no motivational padding,
   no restating the title. Open with the problem the concept solves.
6. **Senior framing.** Each lesson ends with a "Senior signals" section: what a
   senior engineer would say about this topic in an interview or design review
   that a mid-level engineer wouldn't.

Target length: 2,500–4,500 words of prose per lesson plus code/diagrams,
and never above 5,000. Length is a consequence of the depth bar below, not a
target to pad towards: every paragraph carries a mechanism, a number, a
worked example or a decision. Minutes in front matter ≈ words/120 + 10 per
exercise (`make minutes` recomputes it).

## The depth bar (every lesson, checked in review)

A lesson is done when a reader can answer "yes" to each of these:

1. **Hand-traceable.** For each mechanism the lesson names, there is a
   step-by-step trace on concrete data (a numbered walk or a state table)
   that the reader could reproduce with pen and paper.
2. **Every promised subtopic covered.** The lesson's line in `OUTLINE.md`
   lists its subtopics; each one has a section that explains it, not a
   sentence that mentions it.
3. **Quantified.** At least three numbers with provenance (a latency, a
   size, a threshold, a constant), and where a number is an estimate, the
   sentence says what it depends on.
4. **Worked examples.** At least one full input → output example, plus one
   that exercises an edge case or a failure.
5. **Failure modes.** At least three ways it goes wrong in production, each
   with the symptom you would observe, how you would diagnose it, and the
   fix.
6. **Trade-offs table.** Alternatives compared on three or more axes.
7. **Complete code.** Snippets are runnable (not fragments) in Python by
   default, plus a systems language where the language changes the point;
   the non-obvious lines are explained.
8. **Under the hood.** What the runtime, library, kernel or network actually
   does (Python's dict layout, the kernel's socket buffers, the planner's
   choice), with claims that are version-honest.
9. **Interviewer follow-ups.** Three to five questions a senior interviewer
   asks next, each with a model answer and the common wrong answer.
10. **What mid-level engineers get wrong.** A short list, each item a
    specific mistake and its consequence.
11. **Connections.** Cross-links to at least two other lessons, and where
    the topic appears in a real system at scale.
12. **No hand-waving.** "Simply", "just", "obviously", "clearly", "it can be
    shown" and "beyond the scope" are replaced by the explanation itself or
    a link to the lesson that has it.
13. **Exercise and visualisation** where the topic is implementable or the
    catalogue covers it (see the block formats below).
14. **Senior signals** closes the lesson, before the quiz.

## File layout

```
content/tracks/<nn>-<track>/track.md
content/tracks/<nn>-<track>/<nn>-<module>/module.md
content/tracks/<nn>-<track>/<nn>-<module>/<nn>-<lesson>.md
content/problems/<slug>.md
```

`<nn>` is a two-digit ordering prefix. Slugs are lowercase kebab-case, stable
forever (progress is keyed by `track/module/lesson`).

## Front matter

### track.md
```yaml
---
slug: data-structures
title: Core Data Structures
description: One sentence. What you can do after this track.
icon: layers            # lucide icon name (see below)
phase: 2                # 1..6, see OUTLINE.md
---
Intro paragraph(s) in Markdown: what this track covers, why it matters for
the senior bar, how it connects to other tracks.
```

Icons: `compass, layers, cpu, git-branch, network, database, server, workflow,
brain, sparkles, briefcase, book, shield, activity, box`.

### module.md
```yaml
---
slug: hashing
title: Hashing
description: One sentence.
prerequisites: [data-structures/arrays-strings]   # full module slugs, optional
---
Short intro (2–4 paragraphs). What the module builds up to.
```

### lesson
```yaml
---
slug: hash-tables
title: Hash tables: from hash function to O(1)
description: One sentence that a search result can show.
minutes: 35
difficulty: easy | medium | hard | expert | intro
tags: [hashing, hash-map, pattern:hash-map]     # `pattern:<slug>` marks this
                                                 # as the teaching lesson for
                                                 # a problem pattern
problems: [two-sum, group-anagrams]              # practice problem slugs
---
```

## Lesson body structure

```markdown
Open with the problem (1–3 paragraphs). No heading before this.

## Section heading (h2 only; h3 for sub-points)
...

## Senior signals
- Bullet list of 3–8 things a senior engineer says/knows, each distinct (merge
  bullets that make the same point; more than eight means the list is a summary).

## Check yourself
```quiz
...
```
```

Rules:
- Headings: `##` and `###` only. The lesson title is the h1 (rendered by the app).
- Use GitHub-flavoured Markdown. Tables, task lists and footnotes are fine.
- Math: inline `$O(n \log n)$`, display `$$ ... $$` (KaTeX).
- Code fences always have a language: `python`, `javascript`, `typescript`,
  `rust`, `go`, `sql`, `bash`, `json`, `yaml`, `text`.
- Mermaid diagrams: ```` ```mermaid ```` (flowchart, sequenceDiagram,
  classDiagram, stateDiagram-v2, erDiagram, gantt). Keep them small.
- Links to other lessons: `[Binary search](/learn/algorithms/sorting-searching/binary-search)`.
- Links to problems: `[Two Sum](/practice/two-sum)`.

## Interactive blocks

### Visualisation — ```` ```viz ````

A JSON object. The frontend has a registry of step-by-step visualisers; you
pick one and provide its input. Every visualiser is animated, steppable and
explains each step in prose. **Only use the types and algorithms listed
here.** Unknown types fail the build.

Common optional fields on every viz: `"title": "…"`, `"caption": "…"`.

| type | algorithm / scenario | required input |
|---|---|---|
| `array` | `linear-search`, `binary-search`, `two-pointers-sum`, `sliding-window-max-sum`, `sliding-window-longest-unique`, `prefix-sum`, `kadane`, `dutch-flag`, `bubble-sort`, `insertion-sort`, `selection-sort`, `merge-sort`, `quick-sort`, `counting-sort`, `reverse`, `rotate`, `move-zeroes`, `remove-duplicates`, `monotonic-stack-next-greater`, `binary-search-first-true` | `values: number[]`; `target` for searches/sums; `k` for windows; `two-pointers-sum` takes `closest: true`; `binary-search-first-true` takes `predicate` (a name shown in probes); `prefix-sum` takes `leadingZero`, `query: [l, r]`, `peak`, `k` (subarray sum) or `mod` |
| `linked-list` | `traverse`, `reverse`, `cycle-detect`, `middle`, `merge-sorted`, `remove-nth-from-end`, `insert-sorted` | `values: number[]` (+ `values2` for merge, `cycleAt` index for cycle, `n`) |
| `stack-queue` | `stack-ops`, `queue-ops`, `deque-ops`, `balanced-parentheses`, `queue-via-two-stacks`, `min-stack`, `sliding-window-max` | `operations: [["push",3],["pop"]]` or `input: string`/`values`; `min-stack` takes `"variant": "parallel"` (min pushed on every push) |
| `hash-table` | `chaining`, `open-addressing`, `resize` | `buckets: number`, `operations: [["set","k",1],["get","k"],["delete","k"],["append","k","v"]]` (append makes list values); `"hash": "fnv1a"` (default Java hashCode); `resize` takes `growth` (new bucket count) |
| `tree` | `bst-insert`, `bst-search`, `bst-delete`, `inorder`, `preorder`, `postorder`, `level-order`, `height`, `diameter`, `lca`, `validate-bst`, `avl-insert`, `invert`, `serialize` | `values: number[]` (inserted in order), `target`, `a`/`b` for lca, or `levelOrder` (with nulls) for an exact shape; `"heightUnit": "nodes"` (default edges) for bst-insert, avl-insert, diameter; `"thenInorder": true` on bst-insert; `"iterative": true` on inorder; `"order": "level"` on serialize |
| `heap` | `push-pop`, `heapify`, `heap-sort`, `top-k`, `two-heaps-median` | `values: number[]` or `operations`, `kind: "min"|"max"`, `k`; push ops may name the item (`["push",3,"A"]`) and `"lazy": true` shows stale entries discarded |
| `trie` | `insert-search`, `prefix-autocomplete`, `word-break` | `operations: [["insert","cat"],["search","car"],["prefix","ca"]]` |
| `graph` | `bfs`, `dfs`, `dijkstra`, `bellman-ford`, `topo-sort-kahn`, `topo-sort-dfs`, `dag-build`, `connected-components`, `cycle-detect`, `bipartite`, `prim`, `kruskal`, `union-find`, `a-star`, `floyd-warshall`, `tarjan-scc`, `bridges`, `grid-islands`, `grid-bfs` | `nodes: [{"id":"A"}]` (x/y optional 0–100), `edges: [{"from":"A","to":"B","w":3}]`, `directed: bool`, `start`, `goal`; `cycle-detect` takes `"method": "floyd"` for the tortoise-and-hare run over a functional graph, and `grid-islands` takes `"method": "bfs"` (default DFS flood fill); grid algorithms take `grid: number[][]` |
| `dp` | `fibonacci`, `climbing-stairs`, `coin-change`, `house-robber`, `lis`, `lcs`, `edit-distance`, `knapsack-01`, `unique-paths`, `min-path-sum`, `word-break`, `palindrome-substrings`, `max-subarray` | problem-specific: `n`, `coins`, `amount`, `values`, `a`, `b`, `weights`, `capacity`, `grid`; `coin-change` takes `"order": "coin-outer"`; `word-break` takes `"direction": "suffix"` |
| `recursion` | `factorial`, `fibonacci`, `hanoi`, `permutations`, `subsets`, `combinations`, `n-queens`, `binary-search-recursive`, `merge-sort-tree`, `flood-fill` | `n` or `values`/`items`; `fibonacci` takes `name` and `bases` (e.g. ways with both bases 1); `merge-sort-tree` takes `"split": "even-odd"` (FFT) |
| `string` | `kmp`, `rabin-karp`, `z-algorithm`, `expand-palindrome`, `anagram-window`, `reverse-words`, `run-length` | `text`, `pattern`; `rabin-karp` takes `base` and `mod` |
| `bits` | `and-or-xor`, `shift`, `count-bits`, `single-number`, `power-of-two`, `subset-mask` | `values`, `a`, `b`; `shift` takes `left`/`right` shift lists; `and-or-xor` takes `ops` and `carry` (addition by carries); `count-bits` takes `"mode": "leading-zeros"` |
| `network` | `osi-encapsulation`, `tcp-handshake`, `tcp-data-transfer`, `tcp-retransmit`, `tcp-teardown`, `udp-send`, `dns-resolution`, `http-request`, `https-tls-handshake`, `http2-multiplexing`, `websocket-upgrade`, `packet-routing`, `nat`, `load-balancer-round-robin`, `load-balancer-least-conn`, `cdn-cache`, `congestion-slow-start`, `sliding-window-protocol`, `distance-vector`, `link-state`, `bgp-path`, `arp`, `traceroute`, `grpc-stream`, `long-polling-vs-sse` | mostly none; `packets`, `loss: number` where sensible; `cdn-cache` takes per-lesson labels, asset, lifetime, timings, readouts and closing (see `network.tsx`); `load-balancer` least connections takes a slow-replica mode |
| `system` | `request-flow`, `cache-aside`, `write-through`, `write-behind`, `cache-stampede`, `consistent-hashing`, `sharding-range`, `sharding-hash`, `replication-leader-follower`, `replication-multi-leader`, `quorum`, `raft-election`, `raft-log-replication`, `two-phase-commit`, `saga`, `outbox`, `message-queue`, `pubsub`, `token-bucket`, `leaky-bucket`, `sliding-window-log`, `circuit-breaker`, `retry-backoff`, `bulkhead`, `backpressure`, `lsm-tree`, `b-tree-index`, `wal`, `mvcc`, `bloom-filter`, `lru-cache`, `lfu-cache`, `mapreduce`, `stream-windowing`, `watermarks`, `kafka-partitions`, `cdc`, `event-sourcing`, `crdt-counter`, `lamport-clock`, `vector-clock`, `gossip`, `distributed-lock`, `leader-lease`, `idempotency-key`, `strangler-fig`, `blue-green`, `canary`, `service-mesh` | mostly none; `nodes`, `replicas`, `keys`, `requests` where sensible |
| `concurrency` | `race-condition`, `mutex`, `deadlock`, `producer-consumer`, `readers-writers`, `semaphore`, `condition-variable`, `event-loop`, `thread-pool`, `channels`, `cas-loop`, `false-sharing`, `dining-philosophers` | `threads: number` optional |
| `memory` | `stack-heap`, `call-stack`, `gc-mark-sweep`, `reference-counting`, `ownership-borrowing`, `virtual-memory-paging`, `cache-lines`, `dynamic-array-growth` | none required; `call-stack` takes `fn` (`factorial` with `base` 0 or 1 and `name`, `ways`, `reverse` over `values`, or `calls` with `sample: true` for a profiler snapshot); `reference-counting` takes `lang` (`python` or `rust`); `dynamic-array-growth` takes `gc: true` (stale alias, not dangling); `stack-heap` takes `threads` (2 or 3: one stack per thread over a shared heap) |
| `ml` | `linear-regression`, `gradient-descent`, `logistic-regression`, `neural-net-forward`, `backprop`, `decision-tree`, `k-means`, `knn`, `embeddings-similarity`, `tokenization`, `attention`, `transformer-block`, `next-token-sampling`, `kv-cache`, `rag-pipeline`, `agent-loop`, `fine-tuning`, `rlhf`, `speculative-decoding`, `vector-search-hnsw` | scenario-specific; `text`, `points`, `k`. `agent-loop` takes the task, tools and per-call steps (harness check, refusals, untrusted results, token counts) and a final answer or stop reason; `kv-cache` has paged and prompt-cache modes; see the documented input types in `web/src/viz/families/ml.tsx` |

**System scenario inputs.** Every input below is optional; leaving it out gives the default run. Use them so
a block shows the lesson's own system (its services, numbers and mechanism) rather than a generic one; a
title must never promise something the frames do not show.

- `request-flow`: `variant` `redirect`, `latency`, `aggregate`, `chain` (`nodes` 2–6), `trace`, `trace-ascend`,
  `trust`, `layers`. No variant is the textbook read path.
- `consistent-hashing`: `keys` (count or names, up to 16), `positions` (node angles), `added` (new node's
  angle), `replicas`. `sharding-hash`: `keys` count; `variant` `fixed` (`partitions`) or `shuffle` (hot key).
  `sharding-range`: `keys` count.
- `idempotency-key`: `requests` (3+ shows a concurrent duplicate's 409); `store` `db` (same transaction),
  `cache` (SET NX) or `unique` (event ID as primary key); labels `key`, `client`, `service`, `request`,
  `effect`, `record`, `response`, `db`, `target`, `changed`, `effects`, `downstream`.
- `quorum`: `variant` `partition` or `paxos`. `raft-log-replication`: `nodes` 3 or 5.
- `replication-leader-follower`: `mode: "async"`, `pull`, labels `leader`, `follower`, `log`; `variant`
  `kafka` (acks, ISR, high watermark) or `zones`.
- `outbox`: labels `service`, `entity`, `event`, `relay`, `consumer`. `saga`: `steps`
  (`[{service, step, undo, ok, undone, why}]`, 2–4, the last fails).
- `lsm-tree`: labels `log`, `client`; `grace` (tombstone grace period); `checkpoint`; `variant: "parts"`
  (ClickHouse). `bloom-filter`: labels `app`, `store`; `keys`; `variant: "digest"` (anti-entropy).
  `b-tree-index`: `variant: "composite"`. `mvcc`: `variant: "table"` (table-format snapshots).
- `gossip`: `fanout`, `mode: "push-pull"`, `variant: "suspicion"` (SWIM). `leader-lease`: `fencing`
  (labels `holders`, `resource`, `epoch`, `writes`) or `variant: "raft"`. `distributed-lock`: labels `holders`,
  `resource`, `item`, `state`; `fence: "conditional"` (labels `check`, `writeA`, `writeB`).
- `token-bucket`: `capacity`, `refill` with `unit` (`s` or `min`), `times`, `keys` (a bucket per key),
  `requests` (up to 20); `mode: "retry-budget"` (`capacity`, `ratio`, `attempts`).
- `circuit-breaker`: labels `caller`, `dependency`, `fallback`; `timeoutMs`, `openFor`; `contract: true`
  (4xx not counted, 5xx counted); `mode: "spend"` (`threshold`).
- `cdc`: `sink` `search`, `read-model`, `new-store`, `cache`, `topic` or `seat-map`.
  `kafka-partitions`: `mode` `lag` (`topic`, `effect`) or `idempotent` (producer IDs, epochs, sequence numbers). `message-queue`: `flavor: "lease"`, `effect`,
  `dedupe`. `pubsub`: `flavor` `log` or `presence`. `bulkhead`: `slow`, `slowMs`, `normalMs`. `backpressure`: `mode` `reject` or `spool`.
- `retry-backoff`: `deadlineMs`, `attemptMs`, `example`. `lru-cache`, `lfu-cache`: `capacity`.
  `stream-windowing`: `size` (window seconds).

Examples:

```viz
{"type": "graph", "algorithm": "bfs", "directed": false, "start": "A",
 "nodes": [{"id":"A"},{"id":"B"},{"id":"C"},{"id":"D"},{"id":"E"}],
 "edges": [{"from":"A","to":"B"},{"from":"A","to":"C"},{"from":"B","to":"D"},{"from":"C","to":"D"},{"from":"D","to":"E"}]}
```

```viz
{"type": "array", "algorithm": "binary-search", "values": [1,3,4,7,9,12,15,20], "target": 12}
```

```viz
{"type": "network", "scenario": "tcp-handshake"}
```

```viz
{"type": "dp", "algorithm": "edit-distance", "a": "kitten", "b": "sitting"}
```

Use 1–4 viz blocks per lesson where a mechanism benefits from being watched.
Every algorithm/data-structure lesson must have at least one. Networking,
system design, concurrency and AI lessons should have at least one where the
catalogue covers the topic.

### Exercise — ```` ```exercise ```` (YAML)

Live coding, run in the browser. The learner implements `entry` in Python
and/or JavaScript; the platform calls it with `args` and deep-compares to
`expected`.

```exercise
id: implement-binary-search          # unique within the lesson
title: Implement binary search
prompt: |
  Return the index of `target` in the sorted array `nums`, or -1.
  Aim for O(log n). Handle the empty array.
languages: [python, javascript]
entry: binary_search                  # function name; JS uses the same name
starter:
  python: |
    def binary_search(nums, target):
        # your code here
        return -1
  javascript: |
    function binary_search(nums, target) {
      // your code here
      return -1;
    }
tests:
  - args: [[1,3,5,7,9], 7]
    expected: 3
  - args: [[], 1]
    expected: -1
    label: empty input
  - args: [[2], 2]
    expected: 0
    hidden: true
hints:
  - Track `lo` and `hi` as an inclusive range and stop when `lo > hi`.
  - Compute `mid` as `lo + (hi - lo) // 2`.
```

Rules: 3–8 tests, at least one edge case, at least one `hidden: true`.
`any_order: true` on a test compares as multisets. Return values must be
JSON-serialisable (numbers, strings, booleans, null, arrays, plain objects).
For classes (e.g. `MinStack`) set `entry` to the class name and make each test
`args: [["push",1],["push",2],["getMin"]]` with `expected` being the list of
return values (`[null, null, 1]`); the runner instantiates and replays.
1–2 exercises per DS/algorithm lesson; optional elsewhere.

### Quiz — ```` ```quiz ```` (YAML list)

```quiz
- q: >-
    Which operation on a Python list is O(n)?
  options: ["append", "pop()", "insert(0, x)", "len()"]
  answer: 2
  explanation: >-
    insert(0, x) shifts every element right; append/pop at the end are
    amortised O(1); len is stored.
- q: >-
    ...
```

YAML rules that bite: **always** write `q:` and `explanation:` as `>-`
folded block scalars (as above) so colons, quotes and `#` inside the text
are safe. Write `options` as a flow list of double-quoted strings and escape
inner double quotes as `\"`. The same applies to `prompt:` in exercises (use
`|`) and to `hints` (quote each string).

4–6 questions per lesson, exactly one `quiz` block, placed under
`## Check yourself` at the end. Options: 3–5. Test understanding and
trade-offs, not recall. Explanations say why the right answer is right and
why the tempting wrong one is wrong.

Options must not give the answer away by shape. Keep them parallel in length
and grammatical form (within roughly ±30%); trim the correct option to its
core claim and put the nuance in the explanation; give distractors the same
kind of qualifier ("because…", a number, a mechanism) with a wrong reason.
Never refer to an option by position ("the first option", "option C") in an
explanation, because option order is not yours to choose: after editing, run
`make quizzes`, which puts every quiz in its canonical shuffled order and
prints how often the correct answer is the longest option. CI fails if a quiz
is not in that order.

## Practice problems — `content/problems/<slug>.md`

Original problem statements (do not copy LeetCode text). Classic problems
are fine; write the statement in your own words with your own examples.

```yaml
---
slug: two-sum
title: Two Sum
difficulty: easy                     # easy | medium | hard
patterns: [hash-map]                 # pattern slugs from OUTLINE.md
lists: [core-75, ascend-150]
companies: [netflix, google, amazon]
order: 1                             # display order within the list
lesson: interview-patterns/sequence-patterns/hash-map-patterns
hints:
  - What do you need to remember about elements you've already seen?
  - A single pass with a dictionary from value → index is enough.
signatures:
  python:
    name: two_sum
    starter: |
      def two_sum(nums: list[int], target: int) -> list[int]:
          pass
  javascript:
    name: two_sum
    starter: |
      function two_sum(nums, target) {
      }
tests:
  - args: [[2, 7, 11, 15], 9]
    expected: [0, 1]
  - args: [[3, 3], 6]
    expected: [0, 1]
  - args: [[-1, 0, 4, 9], 8]
    expected: [0, 3]
    hidden: true
time_limit_ms: 4000
---
Statement in Markdown: the task, 2–3 worked examples with input/output,
constraints, and a "Follow-up" question a senior interviewer would ask.

## Solution

Editorial: the naive approach and its complexity, the key insight, the
optimal approach with complexity analysis, a Python reference solution in a
```python fence, common mistakes, and how to discuss it in an interview.
The reference solutions **must pass every test**. The graded copies live in
`solutions/` (`solutions/problems/<slug>.js`, `solutions/exercises/<lesson>/<id>.py|.js`)
and the server's sandbox grades them: `cargo run -q -p ascend-api -- --grade-solutions <slug>`.
`python3 scripts/validate_problems.py content/problems/<slug>.md` checks the structure.
```

Tests: 6–12 per problem, covering edge cases (empty, single element,
duplicates, negatives, max sizes within reason), at least 2 hidden.
Problems whose answer can be returned in any order set `any_order: true`.

## Voice

Second person, present tense, direct. Short paragraphs. Prefer "the hash
table probes the next slot" to "probing is performed". No exclamation marks.
British or American spelling is fine; be consistent within a lesson.

## Linked lists, trees and graphs in tests

Test values are JSON. Linked-list, binary-tree and graph arguments/results
use tagged objects that the runner converts to real node objects before
calling your function, and back again for comparison:

- `{"$list": [1, 2, 3]}` → a singly linked list; the harness defines
  `ListNode(val, next)` (Python) / `class ListNode { constructor(val, next) }` (JS).
- `{"$tree": [1, null, 2, 3]}` → a binary tree in level order with `null`
  gaps (LeetCode convention); harness defines `TreeNode(val, left, right)`.
- `{"$graph": [[2,4],[1,3],[2,4],[1,3]]}` → an undirected graph of nodes
  valued 1..n, each entry listing neighbour values; harness defines
  `Node(val, neighbors)`.

Functions receive node objects and may return node objects (the harness
re-encodes them). Reference solutions in the editorial must use the same
class names (`ListNode`, `TreeNode`, `Node`). Do not define those classes in
the starter code; the harness injects them.

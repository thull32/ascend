---
lesson: crdts-and-collaboration
source: 4a06aa34ff255a84
fit: great
desk:
  - "The G-Counter, observed-remove set and transform code, with their traces as tables"
  - "The RGA trace step by step, including the tombstone anchor at step 7"
  - "The state-based, op-based and delta comparison table, and the OT versus CRDT table"
  - "The collaborative editor architecture diagram"
  - "Exercises: merge PN-Counter states, and integrate concurrent inserts into an RGA"
---
## Introduction

Alice is on a train with no signal, fixing a typo in paragraph two of a shared document. Bob is at his desk rewriting the heading of the same document. Both hit save. A single-leader database with locks cannot serve Alice at all: offline, she cannot take the lock. A multi-leader database with last-writer-wins accepts both writes and silently discards one, because each saved "the document", and only one document can win.

What you want is for every replica, each browser tab, phone or datacenter, to accept writes locally with no coordination, and for replicas that exchange what they have to converge on a state that keeps every user's intent. Two families deliver this. Conflict-free replicated data types, CRDTs, make the data type itself mergeable. Operational transformation, OT, rewrites concurrent operations against each other through a central server. Google Docs is built on OT. Yjs, Automerge and Riak's data types are CRDTs.

Four ideas, then. The merge contract. Counters, registers and sets, and how each one keeps or loses intent. Text, where positions shift. And when OT, CRDTs, or neither, is the right tool.

## The merge contract

Plain eventual consistency only says that if writes stop, replicas converge. Often that is done with last-writer-wins, which converges by throwing data away. CRDTs promise more: strong eventual consistency. Any two replicas that have received the same set of updates are in the same state, whatever the order, with no rollback and no consensus.

A state-based CRDT gets that from a merge function with three properties, each neutralising one network fault. Commutative: merging a with b equals merging b with a, which absorbs reordering. Associative: grouping does not matter, which absorbs relaying and batching through intermediaries. And idempotent: merging a state with itself changes nothing, which absorbs duplicates. Taking the maximum of two numbers, or the union of two sets, has all three. Every CRDT encodes richer intent into a structure that still merges like a maximum. That is why CRDTs pair so well with gossip, which delivers state at least once, in any order.

## Counters

A like counter replicated across three regions. One shared integer merged with maximum loses concurrent increments. Adding incoming values counts a duplicated message twice. The G-Counter fixes both: each replica gets its own slot, increments only its own slot, merges by taking the maximum per slot, and the value is the sum of the slots.

Trace it. A adds 3 and B adds 2, concurrently. C receives B's state, then A's state twice, because of a retry. The second merge of A's slot is the maximum of 3 and 3, still 3. C reads 5. A naive shared integer would have read 3 with maximum, or 8 with adding. No two replicas write the same slot, so concurrent increments add instead of colliding, and per-slot maximum absorbs duplicates and stale copies.

A PN-Counter pairs two G-Counters, one for increments and one for decrements. Now a design review question. Inventory has one unit in stock. Region A sells it. Region B, partitioned, also sells it. What does the merged counter say?

[pause]

Minus one. Both sales were valid locally, and the merge faithfully sums them into something invalid. A CRDT has no invariants: "stock never below zero" needs coordination, like a home region per product that owns decrements, or stock escrowed between regions. And one more limit: one slot per replica, forever. Use a small, stable set of replica ids, a region or a server, never one per browser tab, or the state grows with every client that ever connected.

## Registers and sets

A last-writer-wins register stores a value with a timestamp and keeps the highest. It converges, and it discards data. Trace a document title with Bob's clock 500 milliseconds behind. Alice sets the title to "Q3 plan". Bob receives it, reads it, and changes it to "Q3 roadmap". But his clock stamps his edit lower than hers. After merging, both replicas say "Q3 plan".

Bob's edit was causally after Alice's and still lost, with no error. A hybrid logical clock fixes the causal case: on receiving Alice's write, Bob's clock advances past her timestamp, so his edit wins. Truly concurrent writes still lose one of the two. A multi-value register instead tags each write with a version vector and keeps concurrent writes as siblings for someone to resolve, as in Dynamo's shopping cart. Last-writer-wins is fine for a "last seen" time or a presence status. Anywhere a person typed something, prefer siblings or a richer CRDT.

Sets. Adding is easy, because union is a merge. Removal is where designs differ. The observed-remove set gives every add a unique tag, and a remove deletes only the tags it has observed. In a shopping cart: A adds milk with tag a1, and B learns of it. Alice, on A, removes milk, which removes tag a1. Concurrently Bob, on B, adds milk again, with a fresh tag b1. When they exchange, milk has tags a1 and b1, minus the removed a1, which leaves b1. Milk stays. Alice's remove applied to the add she had seen; it cannot cancel an add she never saw. That is the principled fix for Dynamo's carts, where deleted items could resurface.

## What each flavour needs from the network

State-based CRDTs ship the whole state, and tolerate loss, duplication and reordering. Their cost is size: a counter touched by a thousand replicas ships a thousand slots. Operation-based CRDTs ship each operation, small, but they need every operation delivered exactly once, in causal order. Delta CRDTs ship small fragments of state and tolerate faults like state-based ones.

Why op-based needs both halves. Exactly once: an op-based counter ships "plus 3", and a duplicate adds 3 twice. Causal order: a replica receives "remove tag a1" before it has received the add of milk with tag a1. What happens?

[pause]

The remove finds nothing and is dropped. When the add arrives, milk appears on this replica, and nothing will ever remove it, while the others do not have it. Permanent divergence. Implementations tag each operation with its replica and sequence number, deduplicate on that, and buffer an operation until the version vector says its dependencies have arrived. "Operations commute, so any order works" is the wrong answer.

## Text: RGA

Text is the hard case, because positions shift. Take "cat". Alice inserts h at index 1, making "chat", while Bob deletes index 2, the t, making "ca". Applied naively, Alice's replica deletes index 2 of "chat" and gets "cht". Bob's inserts at index 1 of "ca" and gets "cha". They diverge, and one deleted the wrong character.

One way out is to give characters identities that do not shift. RGA, the replicated growable array, gives every character an id: a counter, which is a Lamport clock, plus the replica name. Ids compare by counter, then by name. An insert names its anchor, the character it goes after. To place it, a replica starts right after the anchor, skips every element whose id is greater, and inserts before the first smaller one.

The tiny example: the document is A B. Alice inserts X after A, with id 3 alice. Bob concurrently inserts Y after A, with id 3 bob. The counters tie, so the name decides, and bob is greater. On Alice's replica, Y arrives, sees X is smaller, and stops before it. On Bob's, X arrives, skips the greater Y, and stops before B. Both show A Y X B, regardless of arrival order.

And deletes leave tombstones. If Bob deletes B while Alice concurrently inserts Z after B, Bob's replica still needs B as the anchor to know where Z goes.

That metadata has a cost. Naively, each character carries its own id and its anchor's id, 32 bytes before the character itself. A 100 thousand character document where 30 percent of everything typed was later deleted carries about 4.6 megabytes of metadata for 100 kilobytes of text: 46 times the text. Libraries close most of that gap by merging runs of consecutive typing into one item, encoding ids compactly, and discarding deleted content while keeping tombstone ids as ranges. Some sequence CRDTs also interleave concurrent typing: two people typing "ab" and "xy" into the same gap can get "xayb", both words shredded. RGA keeps forward-typed runs together. Ask about interleaving before adopting a library.

## Operational transformation

OT keeps positional operations and fixes them up. An operation that arrives after a concurrent one is transformed: rewritten so that, applied second, it does what its author intended. Back to "cat". On Alice's side, Bob's delete at 2 arrives after her insert at 1, so it is shifted to delete at 3. Result: "cha". On Bob's side, Alice's insert at 1 is before his delete, so it is unchanged. Result: "cha". Converged.

That property, applying a then transformed b equals b then transformed a, is called TP1. It is enough only when one authority decides the order. Peer-to-peer OT also needs a second property, TP2, which proved notoriously hard: several published algorithms were later shown to violate it. So practical OT is client-server. The server assigns each accepted change a revision number, and every client rebases onto it.

Figma is the instructive middle case: server-authoritative, with each property of each object behaving like a last-writer-wins register ordered by the server. Two people moving different rectangles never conflict. Choosing the smallest unit of conflict is often worth more than choosing an algorithm.

## The editor, and where CRDTs fail

A collaborative editor has one live owner per document, chosen by consistent hashing or a lease. Each operation is appended to a replicated log before the client is acknowledged, a few milliseconds, well under the 50 to 100 milliseconds at which a remote cursor feels laggy. Opening loads the latest snapshot and replays the log since. Client operations carry a client id and sequence number, so resends after a reconnect are idempotent. Cursors and presence go over ephemeral pub-sub, never into the log. And a new owner after failover takes the lease, and log appends check a fencing token so a paused old owner cannot interleave.

CRDTs are the wrong tool for global invariants: unique usernames, non-negative balances, one booking per seat. They do not solve semantic conflicts: if Alice replaces "Tuesday" with "Wednesday" while Bob replaces it with "Thursday", you get "WednesdayThursday". Converged, and wrong. And they merge any well-formed operation, so the server still validates access and rejects pathological operations.

## In the interview

"You are building the editing layer for a Google Docs competitor. OT or CRDT?"

[pause]

Ask first whether offline editing or peer-to-peer sync is needed. Default to a mature CRDT library such as Yjs behind a thin server that authenticates, persists and fans out, because offline and reconnection come for free. Never hand-write OT for rich text, where transform pairs multiply with every block type. The wrong answer is "CRDTs, because they need no server", which ignores durability, access control and fan-out.

## Recap

Four things to remember. A CRDT merge is commutative, associative and idempotent, absorbing reordering, relaying and duplicates. Converging is not preserving intent: last-writer-wins converges and loses even causally later edits under clock skew, while observed-remove sets, siblings and sequence CRDTs keep intent; and no CRDT enforces an invariant like non-negative stock. State and delta CRDTs tolerate any delivery; op-based ones need exactly-once causal delivery. And practical OT needs a central server because one total order means only TP1 is required.

At your desk: the counter, set and transform code with their traces, the RGA trace, the comparison tables, the editor architecture, and the two exercises.

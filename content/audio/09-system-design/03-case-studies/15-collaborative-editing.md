---
lesson: collaborative-editing
source: 86dde81528733ab2
fit: great
desk:
  - "The keystroke timeline from London to Virginia and back"
  - "The OT and CRDT traces of the same two edits, side by side"
  - "The CRDT metadata table and the hot-document fan-out arithmetic"
  - "Exercise: transform one operation against a concurrent one"
---
## Introduction

Alice in London and Bob in New York are editing the same sentence. Alice types an X after the first letter at the same instant Bob deletes the third. Each sees their own change immediately, because an editor that waits a network round trip to show a keystroke feels broken. Then each receives the other's change, a few tens of milliseconds late, and applies it to a document that has already moved. If Bob's "delete the character at position 2" is applied literally to Alice's copy, it deletes the wrong character, and the two copies have silently diverged.

That is the whole problem in one keystroke. Locking paragraphs is unacceptable, last-writer-wins on the document throws away someone's work, and merging at save time is what people did before real-time collaboration. The system must accept concurrent edits optimistically, make every copy converge, preserve each author's intent, and never lose an edit the user was told was saved.

Three deep dives after the numbers: one keystroke end to end, the same two edits through operational transformation and through a CRDT, and how to guarantee there is exactly one owner per document, including the hot one with fifty thousand viewers.

## Requirements and the numbers

Instant local echo, remote edits within a fraction of a second, presence and cursors, offline editing that merges on reconnect, version history, and roles. Convergence always: replicas that applied the same edits show identical content. Remote echo under 300 milliseconds at the 99th percentile in the document's home region. And an edit acknowledged as saved is never lost, which means acknowledging only after a replicated append.

Scale: 100 million documents and 10 million daily users, up to about 100 simultaneous editors and 50 thousand viewers on one document. At a threefold peak that is 625 thousand concurrent editors and about a million open sockets. With keystrokes coalesced into batches every 100 milliseconds or so, about 375 thousand operations a second come in.

Here is the number that shapes the design. One busy document, 50 people typing, is 150 operations a second. Trivial for one process. The aggregate is large, but it is hundreds of thousands of independent small streams with no cross-document transaction. So each document gets a single owner that orders all its operations, documents are sharded across owners, and consensus disappears from the hot path.

## The architecture and one keystroke

A client opens the document over REST, getting a snapshot and a version, then opens a WebSocket. A gateway finds the document's owner in a shard map and forwards messages. The owner holds the document in memory. For each incoming operation, it transforms or merges it against operations the client had not seen, assigns the next version, appends it to an op log partitioned by document, and only then acknowledges the sender and broadcasts to everyone else. Every thousand operations or so it writes a snapshot to object storage.

Three fields in the message carry the design. A base version says which state the operation was written against. A client ID and client sequence number make resends idempotent. And reconnecting with "since version N" fetches only missed operations instead of a snapshot.

Now the keystroke. The document lives in Virginia. Alice types X in London. Her editor applies it locally at time zero; that is why typing feels instant. The frame arrives in Virginia at about 35 milliseconds, mostly the speed of light over 5,900 kilometres. The owner transforms it in microseconds, assigns version 1210, and appends to the log with a quorum across zones, 2 to 5 milliseconds. Bob in New York sees the X at about 44 milliseconds. Alice's "Saved" arrives at about 76, a full transatlantic round trip.

The edge case: Alice's Wi-Fi drops after the append but before the acknowledgement reaches her. On reconnect she asks for operations since 1208, receives her own 1210 among them, and resends her pending operation with the same client sequence number. A unique constraint on document, client and sequence recognises it, and the owner re-acknowledges 1210 instead of appending a second X. Generate a new sequence number on resend and a lost acknowledgement becomes a duplicated paragraph.

## OT versus CRDT, on the same two edits

The text is "a b c". Alice inserts X at position 1. Bob, concurrently, deletes position 2, the c.

Operational transformation rewrites an incoming operation so it applies after the ones it did not know about. The owner got Bob's delete first, as version 1209. Alice's insert at position 1 is before the deleted position, so it is unchanged, and becomes 1210. Now Bob's delete lands at Alice's replica. What must it become?

[pause]

Delete at position 3. Alice's insert shifted every later character right, so the c is now at index 3. Every replica reads "a X b". Both intents survive. For a tie, two inserts at the same position, a deterministic rule decides, here the lower client ID goes first.

The pairwise transform function is easy; the lesson checked 200 thousand random pairs and they all converged. OT's reputation comes from what surrounds it. Rich text multiplies the cases. And OT without a central order needs a second transformation property that several published algorithms claimed and were later shown by counter-example to violate. A single server order means you only need the simple pairwise property.

A CRDT avoids transformation by making every edit commute. Each character gets an immutable ID, a counter and a replica name, and an insert says "after this ID" instead of "at position 1". Deletes leave tombstones, so later operations that name a deleted character still resolve. Ties are broken by ordering siblings by ID, so every replica places them the same way, whatever order they arrive in. Merging is commutative, associative and idempotent, so replicas converge in any causal delivery order, with or without a server.

What does the CRDT cost? Metadata. Computed on simulated sessions of 30 thousand keystrokes, a naive layout costs 35 to 39 bytes per live character, against one byte of text. Run-length encoding, one ID per run of consecutively typed characters, brings that to 4.6 bytes for careful typists and about 14 for heavy editing. That is 23 to 72 terabytes for 100 million documents, against 5 as plain text. And tombstones can only be discarded once every replica has seen the delete.

Where the CRDT wins is offline. Alice returns from three hours on a plane with 5 thousand pending operations; 7,792 were committed meanwhile. Server-ordered OT transforms each pending operation against each missed one, about 39 million transforms. A CRDT integrates about 12,800 operations, each located by ID.

So the choice: with central servers, permissions and history, either works. If offline and local-first are real requirements, a mature CRDT library behind a server that orders, persists and fans out. If documents are huge and offline is rare, OT's lower memory wins. The senior move is naming the requirement that decides.

## One owner, fenced, and the hot document

Gateways find the owner through a shard map with a lease per document in a coordination service. When an owner fails, its lease expires within seconds, a new owner loads the snapshot plus the log tail, and clients reconnect and resend.

But a lease alone is not enough. An owner that pauses longer than its lease, a long garbage collection or a VM migration, wakes up still believing it owns the document. The protection is in storage. The op log's primary key is document plus version, with dense versions, so appending version N plus one succeeds only if nobody has written it. A stale owner's append fails and it steps down. The log position is the fencing token.

Now the hot document: a company all-hands doc with a thousand editors present and 50 thousand viewers. 10 percent typing is 300 operations a second. Broadcast every one to every session and you send 15.3 million messages a second. Batch on a 50 millisecond tick and it is about a million. Send editors updates every 50 milliseconds but viewers every second, and it is 70 thousand. Put 50 relays between the owner and the sockets, and the owner sends a thousand. Batching cuts message count, not bytes, so relays scale out bandwidth while the owner only sequences. Presence is throttled to a few updates a second, showing the nearest few dozen cursors.

## Failure modes

Owner crash: "Saving" stalls for seconds and recovers. Acknowledged operations are in the log, unacknowledged ones are in clients' pending buffers, and the unique constraint dedupes the resends.

Silent divergence: two users see different text and both think they are right. Do not assume the algorithm is bug-free. Clients periodically send a hash of their document at a version, the owner compares, and on mismatch the client reloads and re-merges. Every mismatch is a correctness bug.

Reconnect storm: a gateway deploy drops 50 thousand sockets at once. Drain gateways with a "reconnect in N seconds" message, add jitter, and reconnect with "since version" so clients fetch only what they missed. And validate every operation before sequencing, so one buggy client cannot crash every other replica.

## In the interview

If CRDTs converge without a server, why keep one?

[pause]

Convergence is one requirement of several. The server authorises every edit, makes it durable before "saved", fans out without a peer mesh, produces one history for versioning and audit, and can compact tombstones because it knows what every client has seen. The wrong answer is "with a CRDT you can drop the backend".

And: how does undo work when others are editing? Undo is local: my undo reverts my last change. The client keeps the inverse of each of its operations, transforms it against everything applied since, and sends it as a new operation. "Revert the document one version" is the wrong answer; it destroys other people's work.

## Recap

Four things to remember. One owner per document is enough, because even a busy document is 150 operations a second, and that takes consensus off the hot path. "Saved" means durably appended, and client sequence numbers make resends idempotent. OT with a server order and a CRDT both converge; choose by the deciding requirement: offline favours the CRDT, metadata and huge documents favour OT. And fence the owner with the log's conditional append, not the lease alone.

At your desk: the keystroke timeline, the OT and CRDT traces side by side, the metadata and fan-out tables, and the transform exercise.

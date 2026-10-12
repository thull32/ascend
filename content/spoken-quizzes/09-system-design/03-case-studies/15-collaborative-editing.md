---
lesson: collaborative-editing
source: 72f255de4c182d29
---
## 1

On the text a b c, Alice inserts X at position 1, while Bob concurrently deletes position 2. Positions count from zero. What must Bob's delete become when it is applied at Alice's replica?

A, delete at 2. B, drop the operation. C, delete at 3. D, delete at 1.

[think]

The answer is C: delete at 3.

Alice's insert at position 1 shifts every later character right, so the c that Bob meant is now at index 3. Applying "delete at 2" literally removes the b, and the replicas diverge. Alice's insert, transformed against Bob's delete, is unchanged, because it comes before the deleted position.

## 2

In a sequence CRDT, Alice inserts X with the ID 4 A, and Bob inserts Y with the ID 4 B, both right after the character a in the text a b c. Siblings are ordered by descending ID. What do both replicas show?

A, whichever insert arrives last at each replica wins. B, a Y X b c on both replicas, whatever the order of arrival. C, a X Y b c on Alice's replica, and a Y X b c on Bob's. D, a X Y b c on both, because Alice's operation was sent first.

[think]

The answer is B: a Y X b c on both replicas, whatever the order of arrival.

Each character's position is decided by its ID relative to its siblings, not by arrival order, so every replica places 4 B before 4 A, and reads a Y X b c. That the tie rule is arbitrary does not matter; that every replica applies the same one is what guarantees convergence.

## 3

Why does the design give each document a single owner process that orders all its operations?

A, one process can handle a document's operation rate, and gives one order. B, because the CRDT merge requires a single owner per document. C, to cut storage costs, by keeping one copy of each document. D, because WebSocket connections cannot be load-balanced.

[think]

The answer is A: one process can handle a document's operation rate, and gives one order.

Even a busy document produces around 150 operations a second. Load is sharded across owners by document, and within a document one owner imposes a total order, which keeps transformation simple and history linear, without consensus on every keystroke. CRDTs are precisely the approach that does not need a single owner.

## 4

A document's owner pauses for 20 seconds, its lease expires, a new owner takes over, and then the old owner wakes and tries to append version 5001. What prevents two different operations being stored as version 5001?

A, the expired lease stops the old owner from running more code. B, clients reject messages from the old owner's connection. C, a primary key on document and version makes the append conditional. D, nothing, because the CRDT merge resolves the conflict afterwards.

[think]

The answer is C: a primary key on document and version makes the append conditional.

A lease cannot stop a paused process from acting on stale beliefs, but a conditional write in storage can: the log accepts one operation per version, so whichever writer comes second fails and steps down. The log position acts as a fencing token.

## 5

A client's connection drops after the server durably appended its operation, but before the acknowledgement arrived. What prevents the operation being applied twice when the client resends it?

A, insert and delete operations are idempotent by nature. B, a unique constraint on the document, the client ID and the client's sequence number. C, TCP retransmission, which drops duplicate segments. D, the client waits for the acknowledgement before applying locally.

[think]

The answer is B: a unique constraint on the document, the client ID and the client's sequence number.

Insert operations are not idempotent: applying one twice inserts the text twice. Client sequence numbers act as idempotency keys, so the server recognises the resend, and re-acknowledges it with the original version. TCP deduplication does not span a dropped connection, and waiting for the acknowledgement would destroy local echo.

## 6

A user returns from three hours offline with 5,000 pending operations, while 7,792 operations were committed meanwhile. Why does this favour a CRDT over server-ordered operational transformation?

A, transformation must rewrite each pending operation against each missed one. B, a CRDT resolves the conflicts by keeping the newest edit. C, a CRDT has no per-character metadata to transfer back. D, transformation cannot merge offline edits at all, and must drop them.

[think]

The answer is A: transformation must rewrite each pending operation against each missed one.

Server-ordered transformation rewrites each of the 5,000 operations against each of the 7,792 it missed, about 39 million pairwise transforms, and long divergent histories are where its merges look strangest. A CRDT integrates the 12,792 operations by ID. Transformation can merge them; it is just expensive. CRDTs do carry per-character metadata, and they converge by ID order, not by newest wins.

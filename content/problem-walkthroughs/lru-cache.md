---
problem: lru-cache
args: [["__init__", 2], ["put", 1, 1], ["put", 2, 2], ["get", 1], ["put", 3, 3], ["get", 2]]
frames: 87
source: 4c81a8c2f66db03b
---
@0-14
A cache with room for two entries. When it is full and a new key arrives, it evicts the least recently used one. A hash map alone finds keys fast but cannot tell which is oldest without a scan. A list ordered by recency knows the oldest but cannot find a key fast. So we use both: a map from each key to its node in a doubly linked list, kept in order from most recent, just after the head, to least recent, just before the tail. The constructor builds two sentinel nodes, head and tail, and links them to each other, so the list is never empty and no insert or unlink needs a null check.

@15-30
Put key one, value one. It is not in the map, so we make a node holding both the key and the value, store it in the map, and insert it at the front: four pointer writes splice it in right after the head. The map now has one entry, which is within capacity.

@31-46
Put key two, value two. Same steps. Two goes in at the front, so the list now runs two, then one. One is the least recently used.

@47-60
Get key one. The map hands us its node directly, with no search. Reading is a use, so we unlink the node, two pointer writes because each node knows its neighbours, and reinsert it at the front. The order is now one, then two. We return one's value: one.

@61-75
Put key three, value three. It is new, so it goes in at the front: three, one, two. Now the map holds three entries, one more than capacity.

@76-82
Evict. The least recently used node is the one just before the tail sentinel: key two. We unlink it, and then delete it from the map. This is why each node stores its own key. Without it, we would know which node to drop from the list but not which map entry to delete. The map now holds keys one and three.

@83-86
Get key two. It is no longer in the map, so we return minus one. Had get not counted as a use, key one would have been evicted instead, and this sequence would have gone wrong.

Every operation is a map lookup plus a constant number of pointer changes, so each is constant time, and space is the capacity. The classic mistakes: forgetting that get refreshes recency; storing only the value in the node, so eviction cannot clean up the map; evicting before checking whether the key already exists, which throws out a live entry on a plain overwrite; and a singly linked list, which needs a linear search for the predecessor on every move.

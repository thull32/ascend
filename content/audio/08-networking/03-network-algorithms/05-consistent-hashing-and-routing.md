---
lesson: consistent-hashing-and-routing
source: c24203e29fdf3d7a
fit: partial
desk:
  - "The virtual-node trace and the rendezvous scoring table for the sample keys"
  - "The Maglev table built by hand, and rebuilt after removing a backend"
  - "The bounded-loads trace on the one-point ring"
  - "The measured balance, disruption and lookup-cost tables, and the scheme comparison"
  - "Exercises: a hash ring with virtual nodes, and rendezvous hashing"
---
## Introduction

You run ten cache servers. Clients pick one with the key's hash modulo 10, the hit rate is 95 percent, and the database behind the cache sees 5 percent of reads. Traffic grows, so you add an eleventh server, and the clients now compute modulo 11. A key stays put only if its hash leaves the same remainder modulo 10 and modulo 11, which is true for one hash value in eleven. About 91 percent of keys now map to a server that does not have them. The hit rate falls to roughly 9 percent within a minute, the database receives nearly twenty times its normal read load, and adding capacity has caused an outage. Losing a server does the same in reverse, at exactly the moment you are already down a machine.

The requirement is minimal disruption: going from N servers to N plus one, only about one key in N plus one should move, and only to the new server. Every scheme here achieves that. They differ in how evenly they spread load, what a lookup costs, and what happens when the server that leaves is not the one you expected. The same algorithms decide which cache node holds a key, which Cassandra replica owns a row, and which backend a load balancer sends a flow to.

## The hash ring

Map the hash space onto a circle. Hash each server's name to a point on it, and each key too. A key belongs to the first server clockwise from it.

Adding a server takes over exactly the arc between it and the previous server point: those keys move to the new server, and no other key moves. Removing a server hands its arc to its clockwise neighbour. A lookup is a binary search over the sorted points.

That is the textbook diagram, and deployed as drawn it is wrong. Drop ten points at random on a circle and the arcs are far from equal: the unluckiest server expects about 29 percent of the keys instead of its fair 10. Your tier's capacity is set by its busiest node, so you pay for ten servers and get the headroom of about three and a half. And when a server dies, its whole arc goes to one successor, which suddenly carries two servers' load, may fall over, and hands both arcs to its own successor. A cascade.

## Virtual nodes

The fix is virtual nodes. Hash each physical server to many points, say 100, so it owns many small arcs scattered around the ring. Its share becomes a sum of many arcs, and the spread shrinks like one over the square root of the number of points. A dead server's arcs now have many different successors. And a server with twice the memory can take twice the points.

The lesson measured it with ten servers, over 50 different sets of server names. With one point each, the busiest server averaged three times its fair share. With 10 points, about one and a half times. With 100 points, 15 percent above fair. With a thousand, 5 percent. That is the number to remember: 100 virtual nodes, 15 percent; a thousand, 5.

The cost is memory and rebuild time: a thousand servers with 200 points each is 200 thousand entries, a few megabytes, rebuilt on every membership change. That is fine for a cache client, which is why memcached's ketama clients place 160 points per server, and why Netflix's EVCache uses a ketama-style ring in the client, so nodes come and go without flushing the tier.

Mature systems stop placing points at random. Cassandra lowered its default from 256 random tokens per node to 16 in version 4.0, and switched on an algorithm that chooses token positions to balance ownership. The limit of that idea is fixed slots: Redis Cluster maps every key to one of 16,384 slots and keeps an explicit map from slot to node, so moving a slot moves exactly its keys and balancing is editing the map. Kafka's partitions are the same design.

## Rendezvous hashing

Rendezvous hashing, also called highest random weight, needs no ring. For each key, score every server by hashing the server's name together with the key. The highest score owns the key.

Its properties fall straight out of that. Add a server, and a key moves only if the new server's score beats the current winner, which happens for one key in N plus one, drawn evenly from every existing server. Remove a server, and each of its keys goes to that key's runner-up. So here is the question: when a server dies, where does its load end up?

[pause]

Spread evenly across all the survivors, with no virtual nodes, because runners-up are independent across keys. And replication comes free: a key's top three scores are its three replicas, stable as membership changes.

The cost is one hash per server per lookup. In pure Python, 10 microseconds over 10 servers and 77 over 100. So rendezvous shows up where N is modest: choosing replicas, assigning shards to workers, CDN and load-balancer routing. Twenty hash computations cost several orders of magnitude less than a single network round trip.

## Jump hash and Maglev

Two specialists. Jump hash uses no memory at all. A short loop jumps a key forward through bucket numbers in logarithmic time, balances perfectly, and moved exactly 9.1 percent of keys going from 10 buckets to 11. The catch is that buckets are numbers, not named servers, so you can only add or remove the last one. It suits numbered shards that never disappear, not hosts that fail at random.

Maglev comes from Google's software network load balancer. It builds a lookup table of prime size, 65,537 slots being typical, far more than the number of backends. Each backend has its own preference order over the slots, and the backends take turns, each claiming its next preferred empty slot, until the table is full. A lookup is one array index.

The trade shows when a backend leaves. The table is rebuilt, and the departed backend's slots go to survivors, as they must. But a few slots also move between survivors that are still alive. Maglev gives up strictly minimal disruption in exchange for near-perfect balance and constant-time lookup. At realistic sizes the extra movement is small: with ten backends, every backend got 6,553 or 6,554 slots, and removing one moved its own 10 percent of slots plus 0.19 percent between survivors. Connection tracking keeps established flows on their old backend while new ones use the new table.

## Routing by key, and its limits

Most load balancing does not care which backend gets a request, and round-robin or least-connections is right. You route by key when locality is worth something. Cache affinity, so every request for one product reaches the instance that has it cached. Stateful sessions, like WebSocket servers, game servers and chat rooms. And ordering, so all events for one account go to one worker. NGINX, HAProxy and Envoy all offer it.

The catch is that hashing balances keys, not traffic. A celebrity's profile or a viral video lands on one node however many virtual nodes you have. The fixes live above the hash: replicate the hot key to several nodes and read from one at random, split a hot counter into several keys and sum on read, coalesce identical in-flight requests, or put a small in-process cache in front.

For a node that is simply unlucky or slow, there is consistent hashing with bounded loads. Cap every node at, say, 1.25 times the average load, rounded up. If a key's owner is at the cap, the request walks clockwise to the next node with room. In the lesson's trace, on a ring where one server owned 57 percent of the circle, that server's load fell from 6 requests to 4, and the server that had none took 2. Two of eight requests lost their cache affinity, and no node exceeded the cap. Vimeo contributed this to HAProxy after using it in front of its video caches.

And one warning for service meshes. Every sidecar computes the same ring from the same endpoint list, so they agree without talking, but only given the same membership. During a rollout, endpoint updates reach different sidecars seconds apart, and for a short window two clients route the same key to different instances. Treat routing by key as a performance optimisation, never as the only thing between you and a correctness bug. If two instances must never both own a key, that is a job for leases and fencing.

## In the interview

A follow-up the lesson expects. Why does a ring need virtual nodes, if the hash is uniform?

[pause]

Because the hash places the points uniformly at random, and random arcs are uneven: for ten nodes, the largest expected arc is about three times the fair share. Virtual nodes sum many arcs, so the spread falls with the square root of their number. The wrong answer is "a better hash function would fix it".

And: design client-side routing for a 50-node cache tier that autoscales. A ring with a few hundred virtual nodes per server, or rendezvous at 50 nodes, rebuilt from the service-discovery view; bounded loads to protect hot nodes; and warm-up for new nodes, so a scale-out does not become a miss storm. The wrong answer is modulo N with a longer TTL, which moves 98 percent of keys on every scaling event.

## Recap

Four things to remember. Modulo N moves nearly every key when N changes, and for a cache that is an outage; consistent schemes move about one key in N plus one. A ring without virtual nodes leaves the busiest of ten servers at about three times its share; 100 points gets that to 15 percent above fair, a thousand to 5. Rendezvous sends a dead server's keys to each key's runner-up, jump hash suits numbered shards, and Maglev trades a little extra movement for balance and constant-time lookup. And hashing balances keys, not traffic: hot keys need replication or splitting, and routing by key is only as consistent as the membership view.

At your desk: the virtual-node and rendezvous traces, the Maglev table built by hand, the bounded-loads trace, the measured tables, and the ring and rendezvous exercises.

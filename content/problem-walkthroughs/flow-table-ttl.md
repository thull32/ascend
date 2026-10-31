---
problem: flow-table-ttl
args: [["__init__", 10], ["add", "pg", 1500, 0], ["add", "dns", 80, 2], ["add", "pg", 1500, 6], ["expire", 12], ["add", "pg", 500, 16], ["get", "pg", 17], ["expire", 30]]
frames: 79
source: d61e48be14434de1
---
@0-5
A flow table with a timeout of ten seconds. Every packet needs a fast lookup by flow key, and the sweep needs the flow that expires soonest. So we keep a store of records, each with its own id; a map from each flow key to its newest record's id; and a min heap of entries holding an expiry time, a key and a record id. The trick is that we never update the heap. When a packet refreshes a flow, we push a new entry and leave the old one behind, stale, for the sweep to recognise and throw away. The constructor starts all three empty.

@6-13
A Postgres packet, key p g, fifteen hundred bytes, at time zero. The map has no record for p g, so we take id zero, store a record of fifteen hundred bytes, first seen and last seen both zero, point p g at it, and push an entry: expires at ten, key p g, record zero.

@14-21
A DNS packet of eighty bytes at time two. Also new: record one, and an entry that expires at twelve.

@22-24
Another Postgres packet of fifteen hundred bytes at time six. Now the map points p g at record zero, and that record is live: last seen zero plus ten is ten, which is later than six.

@25-28
So we refresh it in place. The bytes become three thousand and last seen becomes six. Then we push a second entry for the same record, expiring at sixteen. The old entry at ten stays where it is.

@29-34
Sweep at time twelve. The top of the heap expires at ten, which is due, so we pop it: key p g, record zero. The record still exists, but its real expiry is last seen six plus ten, sixteen, not ten. The entry is stale, so we skip it. A stale entry is always earlier than the real one, so it surfaces first and does no harm.

@35-45
The next entry expires at twelve, also due. Record one exists, and two plus ten is twelve, so this entry is real. We copy the DNS record into the output, delete it from the store, and, since the map still points d n s at record one, clear that too. The top now expires at sixteen, past twelve, so the sweep returns just the DNS record.

@46-53
Now the interesting case. A Postgres packet of five hundred bytes arrives at time sixteen. The map still points p g at record zero, but six plus ten is sixteen, and sixteen is not later than sixteen. The record timed out at exactly this moment, though no sweep has removed it, so we must not revive it. We start record two, five hundred bytes, first and last seen sixteen, point p g at the new record, and push an entry expiring at twenty six. Record zero stays in the store, owned by its entry at sixteen.

@54-59
Get p g at seventeen. Record two is live, so we return five hundred, not thirty five hundred.

@60-67
Final sweep at thirty. The top entry expires at sixteen: record zero. Its real expiry is six plus ten, sixteen, so it matches and the record is reported: three thousand bytes, first seen zero, last seen six. We delete it from the store, but the map now points p g at record two, so we leave the map alone.

@68-78
The next entry expires at twenty six: record two, and sixteen plus ten matches. It is reported with five hundred bytes, and this time the map does point at it, so p g leaves the map. The sweep returns two records for one key, in expiry order.

Each add is one heap push, logarithmic in the heap size; get is constant; and each entry is popped at most once. The price is space: a busy flow leaves one stale entry per packet until its old expiry passes. The classic mistakes: trusting a popped entry without checking the record, which exports a refreshed flow early; and treating the late packet as a refresh, which merges two conversations into one record of thirty five hundred bytes, or overwriting the old record so its three thousand bytes are never exported.

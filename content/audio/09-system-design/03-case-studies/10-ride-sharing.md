---
lesson: ride-sharing
source: 1547353d8fa3a30f
fit: great
desk:
  - "The API, the data model, the trip state machine and the architecture diagram"
  - "The geohash code, the geohash, S2 and H3 comparison, and the H3 index layout"
  - "The location-update and matching-request traces, hop by hop"
  - "The compare-and-set statements and the two-matcher race table"
  - "The road-graph example and the greedy versus batched simulation"
  - "Exercise: the eight geohash neighbours"
---
## Introduction

A rider opens the app outside a stadium at 10:40 on a Friday night. Within a second the map shows the cars around them. Within a few seconds of tapping "request", one specific driver has been offered the trip, accepted it, and is visible crawling toward the pickup. Fifty thousand other people near the stadium are doing the same, and every one of a million and a half online drivers reports its position every four seconds, whether or not anyone is looking.

Two properties make this interesting. The data that drives matching is huge in rate and tiny in size: a firehose of positions that are worthless after a few seconds. And the one decision that must be exactly right, this driver is assigned to this trip and no other, is made on top of that deliberately approximate data. The senior answer keeps the two worlds apart: a fast, lossy geospatial index that proposes candidates, and a small, strongly consistent store that decides.

So: requirements and numbers, the architecture, then three deep dives. A location update traced into the index. A matching request, and the write that makes it correct. And ETAs on a road graph.

## Requirements and the numbers

Riders see nearby cars, get a fare estimate including surge, and request a trip. The trip is offered to one driver, who has 15 seconds to accept before the next candidate is tried. Both sides see each other live until pickup. The targets: a position used for matching is at most 5 seconds old. The first offer reaches the driver's screen within 2 seconds at the 95th percentile. A driver is never assigned two trips, and a request never creates two trips. And an accepted trip is never lost.

Then say which data may be stale and which may not. Positions, nearby-car maps and surge may be stale. Assignment and trip state may not. That sentence is the design.

Now the numbers. A million and a half drivers every 4 seconds is 375 thousand location updates a second, flat through the evening. At about 100 bytes each, that is only 37 megabytes a second: the problem is message rate, not bytes. And the live state of every driver in the world is about 150 megabytes. One server's RAM holds the world.

Trips are modest: 20 million a day is about 230 a second, so design for a thousand, concentrated in a few cities. Connections are not modest: 1.5 million drivers plus about a million riders on live trips is 2.5 million persistent connections, so connections, not CPU, set the gateway count: about 60 nodes across three zones.

The consequences. The geo index lives in memory and is sharded for write rate and blast radius, not size. And routing needs a precomputed speed-up, because textbook Dijkstra for every fare estimate costs hundreds of cores.

## The architecture

Drivers hold a persistent connection to a gateway. Each update carries a per-driver sequence number, so out-of-order updates can be dropped. The gateway validates the update and publishes it to a stream partitioned by coarse cell. Geo index shards consume their partitions and keep each driver's latest position, and the same stream feeds the trip history store and surge.

A trip request goes to the trip service, which creates the trip with an idempotency key, because a rider tapping "request" on a flaky connection must not summon two cars. It asks the city's matcher for a driver. The matcher reads candidates from the index, ranks them by ETA, claims one with a compare-and-set, and sends the offer through the driver's gateway.

Two keys carry the design. Driver state and trips are sharded by city, because accepting an offer changes a driver row and a trip row atomically, and co-located by city that is one local commit. The geo index is keyed by cell, not by driver, because "who is near here" must become "who is in these few cells".

## Deep dive one: a location update, into the index

The naive query asks for latitude between two values and longitude between two values. One B-tree range is used efficiently, so it scans a whole latitude band across the city and filters longitude. The fix is a key that turns "near" into "equal or adjacent": a hash map from cell to the drivers in that cell.

Geohash is the classic cell. It interleaves longitude and latitude bits and writes them as characters, so seven characters make a cell about 150 metres across. And it has a trap. Before I tell you: two riders are 18 metres apart. Do their geohashes share a long prefix?

[pause]

Not necessarily. In the lesson's example, a point 17.6 metres east of another sits in a seven-character cell that shares only five characters with its neighbour's. A shared prefix implies proximity; proximity does not imply a shared prefix. So every geohash query searches the cell and its eight neighbours.

S2 projects the sphere onto a cube and orders cells along a Hilbert curve. Its strength is turning a circle or an airport polygon into a few ranges of cell IDs, for range scans. H3, open-sourced by Uber, tiles the sphere with hexagons. All six neighbours of a hexagon sit at the same distance from its centre, so a ring of cells around a pickup is a near-circle: 7 cells for one ring, 19 for two. The costs: a parent's seven children only approximately cover it, and each resolution has 12 pentagons. For dispatch, the lesson picks H3 resolution 9, hexagons of about a tenth of a square kilometre with edges of about 200 metres, for the index, and resolution 7 for surge.

Trace one update. Driver 17 is near the stadium. The phone sends one 100-byte frame on an already open connection; no handshake, which is why the connection is persistent. That takes 50 to 150 milliseconds of radio. The gateway checks the sequence number and plausibility, and keys the message by its coarse parent cell. The stream replicates it to three brokers in different zones in a few milliseconds. The index shard applies it. Visible to matching after about 60 to 170 milliseconds; add the 4 second interval, and the worst-case age stays inside the 5 second target.

Why is the common case a single hash-map write? A driver at 10 metres a second moves 40 metres between updates. Simulated, 14 percent of those steps cross into another hexagon; in a geohash cell, 35 percent. Bigger cells mean fewer moves, at the cost of scanning more drivers per query. And because a phone that dies in a tunnel sends no "offline" message, stale entries are skipped at query time and swept after about 30 seconds.

Why not Postgres for live positions? The lesson measured it. With 100 thousand drivers and a spatial index, durable updates ran at 6,450 a second from 32 connections, 13,500 from 64. With asynchronous commit, 89,400 a second, and after just 30 seconds of that, the index had grown 27 times, from 6.5 megabytes to 178, with 2.7 million dead rows waiting for vacuum. Each update that changes an indexed column writes a new row version and a new index entry. The nearest-ten query took 0.18 milliseconds, so reads are not the problem. 375 thousand writes a second of data that is useless four seconds later is. Postgres with PostGIS stays the right tool for static geometry, like service areas and airports.

## Deep dive two: a matching request

A rider requests a trip at the stadium. The trip service inserts the trip with its idempotency key: about 3 milliseconds. The matcher asks for one ring of hexagons around the pickup: 7 cells, 4 drivers, too few. Two rings: 19 cells, 14 fresh, available drivers, spread over two index shards. The ETA service ranks them in about 2 milliseconds. The matcher claims the best, driver 17, with a compare-and-set, and pushes the offer. About 12 milliseconds of server work in all; the rest of the 2 second budget is radio and, if the city batches, the batch window.

Now the key idea. The index can list a driver who went offline two seconds ago, or who was offered another trip a moment ago. So the index only proposes. The decision is a conditional write. The claim says: set driver 17 to "offered" for this trip, with an expiry 15 seconds from now, but only if the driver is available, or holds an offer that has already expired. The accept says: set the driver to "on trip", but only if the offer is for this trip and still live, in the same transaction as the trip update.

Picture two matcher threads, both seeing driver 17 as the best candidate. What happens when they both run the claim?

[pause]

The first commits and updates one row. The second blocks on the row lock, re-checks its condition after the first commits, finds the driver already offered, and updates zero rows. It moves on to driver 23. If driver 17 never answers, the expiry clause makes the driver claimable again 15 seconds later with no sweeper at all. The database's own clock decides expiry, so application clocks never matter. That is the whole guarantee: one statement, a server-side expiry, and no distributed lock held across a 15 second human decision. And since each city has one matcher holding a lease, every write carries the lease's epoch, so a matcher that paused and woke up still believing it owns the city is rejected.

Greedy or batched? Take two riders and two drivers. Rider one to driver one is 2 minutes, to driver two 3. Rider two to driver one is 3, to driver two 8. Greedy serves rider one first with driver one, and leaves rider two an 8 minute wait: 10 minutes in total. The swap costs 6. Batched matching collects a zone's requests for a second or two and solves the assignment problem across them.

The lesson simulated 10 riders at a time. With 11 drivers, tight supply, batching cut mean pickup time by 14 percent. With 15 drivers, 10 percent. With 30, only 4.5. Batching pays most when supply is scarce, which is exactly the stadium at 10:40. In a quiet suburb it only adds delay, so the window is set per zone.

## Deep dive three: ETAs on a road graph

Straight-line distance lies. A driver 300 metres away across a river may be twelve minutes away by road. So rank by road ETA. Dijkstra settles nodes in order of distance from one source, so the matcher runs one search from the pickup on the reversed road graph, and stops once every candidate is settled. On a synthetic grid of a million intersections, finding 15 drivers within 2 kilometres settled about 2 thousand nodes in 1.2 milliseconds.

The expensive query is the fare estimate. A route across the grid settled 444 thousand nodes in 365 milliseconds. Thousands of estimates a second at that cost is hundreds of cores. Production engines precompute. Contraction hierarchies order nodes by importance and add shortcut edges, so a query only climbs toward more important nodes and settles hundreds of nodes instead of hundreds of thousands. Live traffic changes edge weights, so engines separate a slow topology step from a fast re-weighting step rerun every few minutes. And a model then corrects the engine's estimate with its historical error by area and time of day.

## Failure modes

A geo index shard crashes. Nothing to restore: a replacement consumes from "now", and every driver reports within 4 seconds. Do not add persistence. Stream lag makes ETAs and offers wrong in a region: scale consumers, and widen freshness tolerance explicitly, showing a less certain ETA, rather than silently using 20 second old data. A reconnect storm after a deploy saturates gateways with TLS handshakes: drain gradually, and clients reconnect with jittered backoff. A hot cell during a concert pins one index shard: cache nearby results per cell per second, and give the hot coarse cell its own shard.

## In the interview

A follow-up the lesson expects. A city's matching database fails on a Friday night. What happens?

[pause]

It fails over to its synchronous standby in another zone in tens of seconds. In-flight offers complete or expire and are retried, because all the state is in the driver state table, not in matcher memory. A standby matcher takes the city lease with a higher epoch. Riders see "finding your driver" for longer. The wrong answer is "the matchers keep assignments in memory and replay them".

## Recap

Four things. Separate soft, lossy location state, in memory and rebuilt from the stream in seconds, from hard assignment state, a conditional write in a consistent store, and say which may be stale. Do the arithmetic: 375 thousand updates a second is only 150 megabytes of state, and a relational table is the wrong home for it. Know the geohash boundary problem, and why H3's equal-distance rings suit dispatch. And guarantee one trip per driver with a compare-and-set, a server-side expiry and a fencing epoch, never a lock across a human decision; then rank by road ETA, and batch only where supply is tight.

At your desk: the API, data model and diagrams, the cell-system comparison and code, the two traces, the compare-and-set statements, the road-graph and batching simulations, and the geohash neighbours exercise.

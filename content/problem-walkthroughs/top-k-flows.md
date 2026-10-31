---
problem: top-k-flows
args: [[["web", "db", 300], ["app", "cache", 500], ["web", "db", 400], ["db", "web", 100], ["app", "dns", 700]], 2]
frames: 63
source: e4387f91f398b79c
---
@0-2
Five flow records, and we want the two heaviest flows. The records are web to db with 300 bytes, app to cache with 500, web to db again with 400, db to web with 100, and app to dns with 700. Two jobs hide in this problem. First, a flow is an ordered pair of source and destination, and one flow can appear in many records, so we must add up its bytes before ranking anything. Second, we only need k flows, not a full sort, so we keep a min heap of size k whose root is the weakest flow we are still keeping. A k of zero returns at once; here k is two, so we start an empty totals map.

@3-6
The first record adds 300 bytes to web to db. The second puts app to cache at 500.

@7-8
The third record is web to db again. The map already has it, so its 400 bytes join the 300: web to db is now 700. Ranking raw records would have seen two middling entries here and missed that this flow is one of the heaviest.

@9-12
The fourth record is db to web, 100 bytes. It is the reply direction, and it gets its own entry, because flow records are one way. The last record puts app to dns at 700. Four distinct flows: web to db 700, app to cache 500, db to web 100, app to dns 700.

@13-20
Now the selection. Each flow gets wrapped in a small object whose less than means is worse than: fewer bytes is worse, and on equal bytes the larger source and destination pair is worse, because ties go to the smaller key. Web to db, 700, is wrapped. The heap holds fewer than two, so it goes straight in.

@21-29
App to cache, 500. The heap still has room, so it is pushed. The push compares it with web to db, and 500 is fewer bytes, so app to cache is worse and rises to the root. The heap is full, and its root is the weakest flow we keep.

@30-38
Db to web, 100. The heap is full, so the flow must beat the root to get in. Is the root, at 500, worse than this flow at 100? No. The flow is skipped without touching the heap. That is the saving: most flows cost one comparison.

@39-47
App to dns, 700. Is the root, at 500, worse than 700? Yes. So heap replace pops app to cache out and puts app to dns in, in a single step.

@48-51
Here is where the tie lives. The heap now restores order between app to dns and web to db, both at 700. The byte counts are equal, so the comparison falls to the keys. Is app to dns the larger pair? No: app sorts before web. So app to dns is not the worse one, and web to db becomes the root. That is the right direction. The root is what gets evicted next, so it must be the flow that loses the tie.

@52-59
Now we drain the heap. Pops come out worst first: web to db, then app to dns.

@60-62
Reversing gives heaviest first, and on the tie the smaller key first: app to dns 700, then web to db 700.

Summing is linear in the records. Selection costs at most one log k heap operation per distinct flow, and draining is k log k. Space is dominated by the totals map, not the heap. When k is close to the number of flows, sorting is just as fast and simpler. The classic mistakes: ranking records instead of summed flows; merging the two directions into one key; ordering the tie the wrong way, so the min heap evicts the very flow the problem says to keep; and forgetting to reverse the drained heap.

---
lesson: news-feed
source: 0c313e25cd06f08d
fit: great
desk:
  - "The estimates and tier-sizing tables"
  - "The fan-out simulation and the threshold sweep, with their spread across samples"
  - "The home-candidates merge code, and the post and read-path traces"
  - "Exercise: merge feed streams with dedupe and filters"
---
## Introduction

Every social product has the same screen: recent posts from the people you follow. It looks like a query: posts where the author is in my followees, newest first, limit 20. At small scale, it is one. At 120 thousand feed loads a second with 300 followees each, it is 36 million index lookups a second, plus a merge.

So the design problem is where to move that work. And the answer differs for an account with 200 followers and one with 100 million.

Three deep dives. Where exactly the celebrity threshold sits and why. How a post travels from write to feed, and how the read path fits in 200 milliseconds without rewriting 100 million timelines for every delete. And what the feed does when fan-out is ten minutes behind during a live event.

## Requirements and the numbers

The requirements. Post. Follow and unfollow, a directed graph. A home feed, reverse-chronological with light ranking, infinite scroll, and an "N new posts" indicator. Your own post appears in your own feed immediately, and deletes, blocks and mutes take effect on the next load. Search, notifications and ads are out of scope.

The non-functional targets. A feed load under 200 milliseconds at the 99th percentile. Fan-out lag under 5 seconds at the 99th percentile for ordinary accounts. 99.95 percent availability for feed reads, and a slightly stale feed is acceptable while an empty one is not. And never show a deleted post or a blocked author.

The scale. 200 million daily users, each posting half a time and loading the feed 20 times a day, following 300 accounts on average. That is 3 thousand posts a second at peak, and 120 thousand feed loads a second.

Pure pull is out immediately: 36 million lookups a second. Pure push has its own problem. One post from a 100 million follower account, pushed, would take 111 seconds of the entire fan-out fleet.

Here is the number that surprises people. Push inserts are estimated with about 600 followers per pushed post, not 300. Why not the average? Hold that thought; it is the first deep dive. At 600 followers, half of them active, push is about 900 thousand timeline inserts a second at peak.

The timeline cache holds the most recent 800 post IDs for every daily user, at 20 bytes each. That is 3.2 terabytes raw, about 5 with Redis overhead, 10 with a replica, on about 160 nodes. Its throughput is light, about 11 thousand commands a second per node. So the sentence is this: the timeline cache is sized by memory and is the single largest cost, and the fan-out fleet must be sized from measured fan-out per post, not from the average follower count.

The architecture, in words. An author posts to the post service, which writes the post and the author's own post list, publishes a "post created" event to Kafka keyed by author, and returns. About 30 fan-out workers consume the event, page through the author's followers 5 thousand at a time, and push the post ID into each active follower's timeline list in Redis. On the read side, about 300 feed service instances take the viewer's timeline, merge in celebrity posts and the viewer's own, filter, hydrate, rank and return a page.

## Deep dive one: push, pull, and the threshold

In a directed graph, every edge is one follower and one followee, so the average follower count equals the average following count: 300. But fan-out is paid per post, and accounts with large audiences post more. Before I give you the simulation's answer: how far off can the average be?

[pause]

Up to 30 times. The lesson simulated a million accounts with heavy-tailed follower counts averaging 300, where bigger accounts post somewhat more often. Depending on how heavy the tail is, the real fan-out per post came out between 1.7 and 31 times the average. That is why the answer to "how big is fan-out?" is "measure it".

Now the threshold. "Celebrities are pulled" is usually hand-waved. Derive it from burst and lag, not total cost. If no single post may take more than 10 percent of the 900 thousand inserts a second, and the lag target is 5 seconds, one post can reach 90 thousand times 5, 450 thousand active followers, in time. Accounts above that are pulled at read time. The number is a policy tuned from lag metrics; saying where it comes from is the senior move.

The pull side is cheap because the celebrity set is small. At this threshold that is about 5 thousand accounts, and their last 50 post IDs take about 4 megabytes, held in every feed process, refreshed by subscribing to their post events. A viewer following 20 celebrities costs 20 in-memory list reads and a merge. The merge is k sorted lists, because post IDs are time-sortable 64-bit IDs in the style Twitter published as Snowflake. Measured, it took about 50 microseconds.

So why not pull more aggressively, at 10 thousand followers? The lesson swept it. Going from 450 thousand down to 100 thousand removes only another 16 percent of push work, for a sevenfold larger celebrity set. At 10 thousand, the celebrity lists are 620 megabytes, too big for every process, so they move to a shared cache and every load makes about 61 network reads. That is 7.3 million key reads a second into a new tier you have to buy. The threshold should be as high as the lag target allows.

And the threshold's biggest effect is predictability. Across samples of the same distribution, pure push needed anywhere from 1.1 to 2.5 million inserts a second, depending on how large the largest few accounts happened to be. With the threshold, it stayed between 850 and 980 thousand. A threshold caps what one account can cost, which is what makes the fan-out fleet sizeable at all.

## Deep dive two: the write path and the read path

A post, traced. An author with 3 thousand followers posts. The post is written, the event is produced, and the author gets a success at about 6 milliseconds. A worker picks it up, reads a page of followers, drops inactive ones using an in-memory bitmap, and pipelines the inserts to Redis. About 30 milliseconds after the post, every active follower has it. An author with 300 thousand followers posting at the same moment is split into 60 page tasks across the worker fleet, and is done in about a second. Both inside the 5 second target.

Three edge cases fall out of that trace. First, the author refreshes at 7 milliseconds, before fan-out has done anything. So the feed service merges the viewer's own recent posts into every load, and read-your-writes holds by construction. Second, a worker that crashes after its insert but before committing its offset replays the page, so a timeline can hold an ID twice. Deduplicating 300 IDs at read time is cheaper than a structure that prevents it, which would roughly triple memory. Third, a new follow: until a backfill job runs, the followee's posts are merged at read time, exactly like a celebrity.

Why does the timeline hold IDs and not post bodies? Bodies change, with edits, deletes and like counts. Storing a kilobyte instead of 20 bytes would multiply the 10 terabyte cache by fifty, and every like would rewrite millions of timelines.

The read path. Fetch 300 timeline IDs, about 2 milliseconds. Merge celebrities and own posts, under 1. Filter blocks and mutes, 3. Fetch features for the 300 candidates, 15. Rank, 30 to 60. Hydrate the 20 winners, 10. About 70 to 90 milliseconds in total, against a 200 millisecond budget.

Deletes are filtered at read time, not fanned out. Mark the post deleted, invalidate its cache entry, and hydration drops it, with a small synchronous denylist for legal takedowns. Blocks and unfollows are filtered the same way. Pagination is by cursor, never offset: rank a snapshot of about 300 candidates, keep it for about 30 minutes, and the cursor points into it, so page 2 continues exactly where page 1 ended. And every dependency has a fallback. Ranker late: serve reverse-chronological. One post fails to hydrate: drop the post, not the page.

## Deep dive three: the live event

A final, at a quiet hour. The post rate jumps from a thousand a second to 10 thousand a second for five minutes. Each post costs about 307 inserts, so demand is about 3 million inserts a second, three times the fleet's capacity of a million.

After five minutes, the backlog is about 620 million inserts. A post made at the end of the spike reaches feeds about ten minutes later, and the backlog takes about 15 minutes to drain. A goal posted at minute five shows up at minute fifteen, when everyone watching has moved on.

Adding workers does not help. A fleet three times larger costs three times as much all year for five minutes of it, and new workers take minutes to start. The fix is to choose which inserts matter. Split fan-out into two lanes by whether the follower was active in the last five minutes. If a quarter of active followers are online, the priority lane needs about 770 thousand inserts a second, inside capacity, so the people watching see posts within seconds. The offline lane is better skipped entirely: mark those timelines stale and rebuild them when each user opens the app.

And monitor lag as the SLO it is, per lane, measured from post creation to the timeline write. Consumer offset lag tells you how many events are waiting, not how old the oldest one is.

## When it breaks

A timeline shard lost with no replica. A 160th of users, 1.25 million people, get empty timelines, and rebuilding each from 300 followees is 375 million lookups at once. Keep replicas, rate-limit rebuilds, and meanwhile serve a degraded feed from celebrities, own posts, and the accounts each user interacts with most. Thinner, never empty.

A viral post saturates one post-cache shard at 500 thousand hydrations a second. Hold the hottest posts in an in-process cache for a few seconds, and accept like counts a few seconds stale. And a poison event that a worker retries forever: retry with backoff, then park it on a dead-letter topic.

At ten times the users, the timeline cache reaches 100 terabytes, and memory becomes the problem. Tighten the activity window from 7 days to 2, cap infrequent users at 200 entries, and move to a compact purpose-built store. At a hundred times the items, likes and comments and group activity rather than only posts, push collapses and the design flips to pull-first.

## In the interview

A follow-up the lesson expects. A user who follows 5 thousand accounts comes back after three months. What happens?

[pause]

Dormant users have no maintained timeline, and pulling 5 thousand lists is too slow for page 1. Build page 1 from the in-process celebrity lists plus the 50 accounts they interacted with most, about 50 lookups. Meanwhile rebuild the full timeline asynchronously with a k-way merge, capped at 800, and mark them active. By page 2 the feed is complete. The wrong answer is "their timeline is still in the cache", which means paying to maintain timelines nobody reads.

And another: the timeline cache costs too much, halve it. The levers, in order. Shrink the activity window from 7 days to 2. Cap infrequent users at 200 entries. Pack entries in a compact binary store instead of Redis list nodes. Drop the replica, since timelines are rebuildable, accepting degraded feeds after a node loss. The wrong answer is "compress the values", which does little to 20-byte entries.

## Recap

Five things to remember. The average follower count equals the average following count, and fan-out per post can still be 30 times larger, so measure it. Derive the pull threshold from fleet capacity and the lag target, about 450 thousand active followers here, and keep it high, because the lists must fit in every process. Store IDs, not bodies, and filter deletes and blocks at read time. Merge the viewer's own posts at read time so they never wait for fan-out. And during a spike, fan out in lanes by attention: online followers first, offline ones rebuilt on open.

At your desk: the sizing tables, the fan-out simulation and threshold sweep, the merge code and traces, and the feed-merge exercise.

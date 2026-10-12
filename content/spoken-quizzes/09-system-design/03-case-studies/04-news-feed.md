---
lesson: news-feed
source: b9e9585189141360
---
## 1

Peak is 3,000 posts a second, with an average of 300 followers per account. A single account has 100 million followers. What does the arithmetic say about pure fan-out on write?

A, it is fine, because 900,000 inserts a second fits a Redis cluster's capacity. B, the post store, not fan-out, is the bottleneck at 3,000 writes a second. C, the average is fine, but one post from the top account swamps the fleet. D, push is always cheaper than pull, so fan out on write for every account.

[think]

The answer is C: the average is fine, but one post from the top account swamps the fleet.

The average hides the tail. One post from the largest account is 100 million inserts, about 111 seconds of the entire fan-out capacity, which blows the lag target for everyone else. That is why accounts above a derived threshold are pulled at read time. Storing 3,000 posts a second is the easy part.

## 2

Every follow edge has one follower and one followee, so average followers equals average following: 300. Why can fan-out per post still be far above 300?

A, inactive followers are counted in fan-out, even though their feeds are skipped. B, the equality only holds for undirected graphs, not for directed follow graphs. C, accounts with large audiences post more, so each post's reach is weighted up. D, fan-out counts each follower twice, once for the post and once for the reply.

[think]

The answer is C: accounts with large audiences post more, so each post's reach is weighted up.

Fan-out is paid per post, so the relevant average weights each account by how often it posts, and heavy posters skew toward big audiences. In the simulation, the per-post fan-out ranged from 1.7 to 31 times the average, depending on the tail. The equality itself holds in directed graphs, and skipping inactive followers reduces fan-out rather than inflating it.

## 3

Why is the celebrity pull path cheap on the read side in the hybrid design?

A, the celebrity set is small enough to hold in every instance's memory. B, each celebrity's list sits in one shared cache key that all readers hit. C, celebrity posts are served from the CDN, so the feed service skips them. D, celebrities post rarely, so their lists almost never need refreshing.

[think]

The answer is A: the celebrity set is small enough to hold in every instance's memory.

50,000 accounts, times 50 post IDs, times 16 bytes, is about 40 megabytes: small enough to replicate into every feed-service process. The pull becomes an in-memory merge, with no network hop. A single shared cache key per celebrity is exactly the hot key the design avoids.

## 4

A post is deleted. What is the right way to remove it from followers' feeds?

A, let it age out of the 800-entry cap, since timelines hold only IDs. B, fan out a delete that removes the ID from every follower's timeline. C, rebuild every follower's timeline from the author's posts, without it. D, mark it deleted, and invalidate the post cache so hydration drops it.

[think]

The answer is D: mark it deleted, and invalidate the post cache so hydration drops it.

Filtering at hydration is one write plus a cache invalidation, and a small synchronous denylist covers urgent takedowns. Removing an ID from millions of timelines is a fan-out for every delete, and it races with the original fan-out. Ageing out alone would show deleted content for days.

## 5

A user posts and refreshes 7 milliseconds later, before fan-out has run. How does the design guarantee they see their own post?

A, the client caches the post locally, and prepends it until fan-out lands. B, the feed service merges the viewer's own recent posts into every load. C, fan-out writes to the author's own timeline synchronously, before replying. D, it cannot: with asynchronous fan-out, the user must wait for the lag to pass.

[think]

The answer is B: the feed service merges the viewer's own recent posts into every load.

Merging your own recent posts at read time makes read-your-writes hold by construction, for one extra small partition read. A synchronous self-insert is a second write path that can fail independently, and client-only caching breaks across devices.

## 6

During a live event, the post rate rises tenfold, and fan-out demand reaches three times capacity for five minutes. Which change keeps feeds fresh for the people watching?

A, fan out first to followers who were online in the last few minutes. B, lower the pull threshold, so that fewer accounts are pushed at all. C, raise the partition count of the post topic, to add parallelism. D, add fan-out workers when consumer lag crosses an alert threshold.

[think]

The answer is A: fan out first to followers who were online in the last few minutes.

One queue builds about 600 million inserts of backlog, so posts land ten minutes late. A priority lane for followers who are online now fits inside capacity, and offline followers can be rebuilt when they open the app. New workers arrive after the moment, lowering the threshold saved only 16 percent in the sweep, and partitions add parallelism, not insert capacity.

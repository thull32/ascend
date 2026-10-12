---
problem: design-twitter
args: [["post_tweet", 1, 5], ["follow", 1, 2], ["post_tweet", 2, 6], ["post_tweet", 1, 7], ["get_news_feed", 1]]
frames: 48
source: 923af2a047071f8d
---
@0-3
User 1 posts tweet 5, follows user 2, user 2 posts tweet 6, user 1 posts tweet 7, and then we ask for user 1's feed. The insight: each user's own tweets are already in time order, because we only ever append. So a feed is the ten newest across several sorted lists, which is the first ten steps of a k-way merge with a heap. The class keeps a clock, a list of tweets per user, and a set of followees per user. All start empty.

@4-6
Post tweet 5 for user 1. It is stored with the clock's current time, zero, and the clock moves to one. The time, not the tweet id, is what orders the feed: ids are unique, but nothing says they increase.

@7-9
User 1 follows user 2. The check guards against following yourself, which would make your own tweets appear twice in the merge. User 1's followee set is now just 2.

@10-15
User 2 posts tweet 6 at time one, and user 1 posts tweet 7 at time two. User 1's list is now 5 then 7, oldest first, and user 2's list holds 6.

@16-18
Now the feed for user 1. The sources are the people user 1 follows, plus user 1 themselves. Dropping that second part is the most common bug: users always see their own tweets. The sources are 1 and 2.

@19-28
We seed the heap with each source's newest tweet, the last item of their list. User 1's newest is tweet 7, at time two, at position 1 in the list. User 2's newest is tweet 6, at time one, at position zero. Python's heap gives the smallest first, so the time is stored negated: minus 2 sorts before minus 1, which makes the newest come out first.

@29-37
Heapify, and start an empty feed. Pop the newest: tweet 7 from user 1. Into the feed. Then the key step of the merge: user 1 has an older tweet before position 1, so we push it, tweet 5 at time zero. The heap now holds tweet 6 and tweet 5. Each user has at most one entry in the heap at a time.

@38-41
Pop again: tweet 6, from user 2, at time one. User 2 has nothing older, so nothing is pushed. The feed is 7, 6.

@42-47
Pop tweet 5. Nothing older from user 1, and the heap is empty, so the loop stops before reaching ten. The feed is 7, 6, 5, newest first.

Posting, following and unfollowing are constant time. A feed costs the number of followees to build the heap, plus ten pops and pushes, each logarithmic in that number. We never touch tweets that do not make the cut. For a user following ten thousand accounts, that heap seeding is the cost, which is why real systems precompute feeds when tweets are posted, except for celebrities, whose tweets are merged in when the feed is read.

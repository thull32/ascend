---
slug: design-twitter
title: Design Twitter
difficulty: medium
patterns: [heap]
lists: [ascend-150]
companies: [amazon, twitter, meta, snap]
order: 6
lesson: interview-patterns/sequence-patterns/top-k-elements
hints:
  - "Each user's own tweets form a list already sorted by time. A news feed is the ten most recent across several such sorted lists."
  - "Merging k sorted lists to get the first ten elements is a heap problem: seed a max-heap with the latest tweet of each followee (and the user), pop the newest, and push the next-older tweet from the same list."
  - "Use a global counter as the timestamp; store `(time, tweet_id)` pairs. A user implicitly follows themselves, and `follow`/`unfollow` on sets is idempotent."
signatures:
  python:
    name: Twitter
    starter: |
      class Twitter:
          def __init__(self):
              pass

          def post_tweet(self, user_id: int, tweet_id: int) -> None:
              pass

          def get_news_feed(self, user_id: int) -> list[int]:
              pass

          def follow(self, follower_id: int, followee_id: int) -> None:
              pass

          def unfollow(self, follower_id: int, followee_id: int) -> None:
              pass
  javascript:
    name: Twitter
    starter: |
      class MinHeap {
        constructor(compare = (a, b) => a - b) { this.a = []; this.cmp = compare; }
        size() { return this.a.length; }
        peek() { return this.a[0]; }
        push(x) {
          const a = this.a; a.push(x);
          let i = a.length - 1;
          while (i > 0) {
            const p = (i - 1) >> 1;
            if (this.cmp(a[i], a[p]) >= 0) break;
            [a[i], a[p]] = [a[p], a[i]]; i = p;
          }
        }
        pop() {
          const a = this.a; const top = a[0]; const last = a.pop();
          if (a.length) {
            a[0] = last;
            let i = 0;
            for (;;) {
              const l = 2 * i + 1, r = l + 1; let m = i;
              if (l < a.length && this.cmp(a[l], a[m]) < 0) m = l;
              if (r < a.length && this.cmp(a[r], a[m]) < 0) m = r;
              if (m === i) break;
              [a[i], a[m]] = [a[m], a[i]]; i = m;
            }
          }
          return top;
        }
      }

      class Twitter {
        constructor() {
        }
        post_tweet(user_id, tweet_id) {
        }
        get_news_feed(user_id) {
        }
        follow(follower_id, followee_id) {
        }
        unfollow(follower_id, followee_id) {
        }
      }
tests:
  - args: [["post_tweet", 1, 5], ["get_news_feed", 1], ["follow", 1, 2], ["post_tweet", 2, 6], ["get_news_feed", 1], ["unfollow", 1, 2], ["get_news_feed", 1]]
    expected: [null, [5], null, null, [6, 5], null, [5]]
  - args: [["get_news_feed", 1]]
    expected: [[]]
    label: unknown user has an empty feed
  - args: [["post_tweet", 1, 1], ["post_tweet", 1, 2], ["post_tweet", 1, 3], ["post_tweet", 1, 4], ["post_tweet", 1, 5], ["post_tweet", 1, 6], ["post_tweet", 1, 7], ["post_tweet", 1, 8], ["post_tweet", 1, 9], ["post_tweet", 1, 10], ["post_tweet", 1, 11], ["post_tweet", 1, 12], ["get_news_feed", 1]]
    expected: [null, null, null, null, null, null, null, null, null, null, null, null, [12, 11, 10, 9, 8, 7, 6, 5, 4, 3]]
    label: feed is capped at ten
  - args: [["follow", 1, 1], ["post_tweet", 1, 10], ["get_news_feed", 1], ["unfollow", 1, 3], ["get_news_feed", 1]]
    expected: [null, null, [10], null, [10]]
    label: following yourself and unfollowing a stranger are no-ops
  - args: [["post_tweet", 1, 1], ["post_tweet", 2, 2], ["post_tweet", 1, 3], ["post_tweet", 3, 4], ["follow", 1, 2], ["follow", 1, 3], ["get_news_feed", 1], ["get_news_feed", 2], ["unfollow", 1, 3], ["get_news_feed", 1]]
    expected: [null, null, null, null, null, null, [4, 3, 2, 1], [2], null, [3, 2, 1]]
    hidden: true
    label: interleaved timelines merge by time
  - args: [["post_tweet", 1, 100], ["post_tweet", 1, 101], ["post_tweet", 1, 102], ["post_tweet", 1, 103], ["post_tweet", 1, 104], ["post_tweet", 1, 105], ["post_tweet", 2, 200], ["post_tweet", 2, 201], ["post_tweet", 2, 202], ["post_tweet", 2, 203], ["post_tweet", 2, 204], ["post_tweet", 2, 205], ["post_tweet", 2, 206], ["follow", 1, 2], ["get_news_feed", 1], ["get_news_feed", 2]]
    expected: [null, null, null, null, null, null, null, null, null, null, null, null, null, null, [206, 205, 204, 203, 202, 201, 200, 105, 104, 103], [206, 205, 204, 203, 202, 201, 200]]
    hidden: true
    label: ten newest across two users
  - args: [["follow", 2, 1], ["post_tweet", 1, 7], ["get_news_feed", 2], ["get_news_feed", 1]]
    expected: [null, null, [7], [7]]
  - args: [["follow", 1, 2], ["follow", 1, 2], ["post_tweet", 2, 9], ["get_news_feed", 1]]
    expected: [null, null, null, [9]]
    hidden: true
    label: duplicate follow does not duplicate tweets
time_limit_ms: 4000
---
Design a minimal social feed. Implement a class `Twitter` with:

- `post_tweet(user_id, tweet_id)` — user `user_id` publishes a tweet with a unique `tweet_id`.
- `get_news_feed(user_id)` — return the ids of the ten most recent tweets by `user_id` or by anyone they follow, newest first. Fewer than ten if fewer exist; an empty list if none.
- `follow(follower_id, followee_id)` — `follower_id` starts following `followee_id`.
- `unfollow(follower_id, followee_id)` — `follower_id` stops following `followee_id`.

Users always see their own tweets. Following yourself, following someone twice, or unfollowing someone you do not follow are all harmless no-ops.

Tests are given as a sequence of method calls; the expected output is the list of return values in order, with `null` for methods that return nothing.

### Examples

| Calls | Returns | Why |
|---|---|---|
| `post_tweet(1, 5), get_news_feed(1)` | `null, [5]` | Own tweets appear |
| `follow(1, 2), post_tweet(2, 6), get_news_feed(1)` (continuing) | `null, null, [6, 5]` | Newest first |
| `unfollow(1, 2), get_news_feed(1)` (continuing) | `null, [5]` | Tweets of unfollowed users vanish from the feed |

### Constraints

- `1 ≤ user_id, tweet_id ≤ 500`, tweet ids are unique
- At most `3 × 10⁴` calls in total

### Follow-up

The interviewer asks: "A user follows ten thousand accounts. What does `get_news_feed` cost, and how do real systems avoid it?" Then: "How do you handle a celebrity with fifty million followers?"

## Solution

### The naive approach

Keep one global list of `(time, user, tweet)`; `get_news_feed` scans it from the end, keeping tweets from the user or their followees until it has ten. `O(T)` per feed in the worst case (a user who follows nobody active must scan every tweet ever posted). Correct, and the right thing to say first, because it makes clear what the heap buys.

### The insight

Each user's own tweets are already in time order. A news feed is "the ten newest across `k` sorted lists", which is the first ten steps of a k-way merge. Seed a max-heap with the newest tweet of each relevant user; pop the newest overall, then push the next-older tweet from that same user's list. Ten pops give the feed, and the heap never holds more than `k` entries, so you never touch a user's tweets beyond the few that make the cut.

### The optimal approach

```python
class Twitter:
    def __init__(self):
        self.time = 0
        self.tweets: dict[int, list[tuple[int, int]]] = collections.defaultdict(list)
        self.following: dict[int, set[int]] = collections.defaultdict(set)

    def post_tweet(self, user_id: int, tweet_id: int) -> None:
        self.tweets[user_id].append((self.time, tweet_id))
        self.time += 1

    def get_news_feed(self, user_id: int) -> list[int]:
        heap: list[tuple[int, int, int, int]] = []
        sources = self.following[user_id] | {user_id}
        for uid in sources:
            lst = self.tweets.get(uid)
            if lst:
                t, tid = lst[-1]
                heap.append((-t, tid, uid, len(lst) - 1))
        heapq.heapify(heap)
        feed: list[int] = []
        while heap and len(feed) < 10:
            neg_t, tid, uid, idx = heapq.heappop(heap)
            feed.append(tid)
            if idx > 0:
                t, prev_tid = self.tweets[uid][idx - 1]
                heapq.heappush(heap, (-t, prev_tid, uid, idx - 1))
        return feed

    def follow(self, follower_id: int, followee_id: int) -> None:
        if follower_id != followee_id:
            self.following[follower_id].add(followee_id)

    def unfollow(self, follower_id: int, followee_id: int) -> None:
        self.following[follower_id].discard(followee_id)
```

`post_tweet`, `follow` and `unfollow` are `O(1)`. `get_news_feed` is `O(k + 10 log k)` for `k` followees: `O(k)` to heapify the seeds, then ten pops and pushes. Space is `O(total tweets + total follow edges)`.

### Common mistakes

- Forgetting that a user sees their own tweets; the `| {user_id}` is easy to drop.
- Letting `follow(1, 1)` insert a self-edge, which then double-counts the user's own tweets in the merge.
- Storing tweets newest-first with `insert(0, ...)`, which makes posting `O(n)`. Append and walk backwards.
- Using the tweet id as the timestamp. Ids are unique, not ordered.

### How to discuss it

Frame the feed as a k-way merge and say why: "each user's list is sorted, and I only need the first ten of the merge, so the heap holds one candidate per followee and does ten rounds." For the ten-thousand-followee follow-up, the `O(k)` seeding dominates; real systems precompute feeds on write (fan-out on write: when you tweet, push it into every follower's materialised feed), which makes reads `O(1)` at the cost of `O(followers)` per post. The celebrity follow-up is exactly the pathological case for fan-out on write, so production systems use a hybrid: fan out on write for normal accounts and merge in celebrities' tweets at read time, which is this heap again. Being able to derive that hybrid from the two costs is the senior answer.

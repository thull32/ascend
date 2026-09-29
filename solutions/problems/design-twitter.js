// Each user keeps their own tweet log (time, id); a news feed merges the
// most recent tweet from each followed user (plus self) with a heap-like
// k-way merge, pulling in the next tweet from a source whenever it wins.
class Twitter {
  constructor() {
    this.time = 0;
    this.tweets = new Map(); // user_id -> [[time, tweet_id], ...]
    this.following = new Map(); // user_id -> Set(followee_id)
  }

  post_tweet(user_id, tweet_id) {
    if (!this.tweets.has(user_id)) this.tweets.set(user_id, []);
    this.tweets.get(user_id).push([this.time, tweet_id]);
    this.time += 1;
  }

  get_news_feed(user_id) {
    const sources = new Set(this.following.get(user_id) || []);
    sources.add(user_id);
    const heap = [];
    for (const uid of sources) {
      const lst = this.tweets.get(uid);
      if (lst && lst.length) {
        const [t, tid] = lst[lst.length - 1];
        heap.push([t, tid, uid, lst.length - 1]);
      }
    }
    const feed = [];
    while (heap.length && feed.length < 10) {
      // pick the entry with the largest time (most recent)
      let bestIdx = 0;
      for (let i = 1; i < heap.length; i++) {
        if (heap[i][0] > heap[bestIdx][0]) bestIdx = i;
      }
      const [t, tid, uid, idx] = heap[bestIdx];
      heap.splice(bestIdx, 1);
      feed.push(tid);
      if (idx > 0) {
        const [pt, ptid] = this.tweets.get(uid)[idx - 1];
        heap.push([pt, ptid, uid, idx - 1]);
      }
    }
    return feed;
  }

  follow(follower_id, followee_id) {
    if (follower_id !== followee_id) {
      if (!this.following.has(follower_id)) this.following.set(follower_id, new Set());
      this.following.get(follower_id).add(followee_id);
    }
  }

  unfollow(follower_id, followee_id) {
    const s = this.following.get(follower_id);
    if (s) s.delete(followee_id);
  }
}

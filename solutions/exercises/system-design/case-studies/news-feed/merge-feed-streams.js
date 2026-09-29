function merge_feed(streams, blocked, deleted, k) {
  const blockedSet = new Set(blocked);
  const deletedSet = new Set(deleted);

  // simple array-based priority queue; keep it sorted by post_id descending
  const heap = [];
  function push(item) {
    // item: [postId, streamIdx, pos]
    let i = 0;
    while (i < heap.length && heap[i][0] > item[0]) i++;
    heap.splice(i, 0, item);
  }
  function pop() {
    return heap.shift();
  }

  for (let sIdx = 0; sIdx < streams.length; sIdx++) {
    if (streams[sIdx].length > 0) {
      push([streams[sIdx][0][0], sIdx, 0]);
    }
  }

  const result = [];
  const seen = new Set();

  while (heap.length > 0 && result.length < k) {
    const [postId, sIdx, pos] = pop();
    const authorId = streams[sIdx][pos][1];

    if (pos + 1 < streams[sIdx].length) {
      push([streams[sIdx][pos + 1][0], sIdx, pos + 1]);
    }

    if (seen.has(postId) || blockedSet.has(authorId) || deletedSet.has(postId)) {
      continue;
    }
    seen.add(postId);
    result.push(postId);
  }

  return result;
}

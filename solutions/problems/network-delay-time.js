// Network Delay Time: Dijkstra with a min-heap and lazy deletion of stale entries.

class MinHeap {
  constructor() {
    this.items = [];
  }

  size() {
    return this.items.length;
  }

  // items are [time, node]; ordered by time ascending (heapq default tuple order).
  _less(a, b) {
    if (a[0] !== b[0]) return a[0] < b[0];
    return a[1] < b[1];
  }

  push(item) {
    const items = this.items;
    items.push(item);
    let i = items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this._less(items[i], items[parent])) {
        [items[i], items[parent]] = [items[parent], items[i]];
        i = parent;
      } else {
        break;
      }
    }
  }

  pop() {
    const items = this.items;
    const top = items[0];
    const last = items.pop();
    if (items.length > 0) {
      items[0] = last;
      let i = 0;
      const n = items.length;
      while (true) {
        const left = 2 * i + 1;
        const right = 2 * i + 2;
        let smallest = i;
        if (left < n && this._less(items[left], items[smallest])) smallest = left;
        if (right < n && this._less(items[right], items[smallest])) smallest = right;
        if (smallest === i) break;
        [items[i], items[smallest]] = [items[smallest], items[i]];
        i = smallest;
      }
    }
    return top;
  }
}

function network_delay_time(times, n, k) {
  const graph = new Map();
  for (const [u, v, w] of times) {
    if (!graph.has(u)) graph.set(u, []);
    graph.get(u).push([v, w]);
  }

  const dist = new Map();
  const heap = new MinHeap();
  heap.push([0, k]);

  while (heap.size() > 0) {
    const [t, u] = heap.pop();
    if (dist.has(u)) {
      continue;
    }
    dist.set(u, t);
    const neighbors = graph.get(u) || [];
    for (const [v, w] of neighbors) {
      if (!dist.has(v)) {
        heap.push([t + w, v]);
      }
    }
  }

  if (dist.size !== n) {
    return -1;
  }
  let maxDist = 0;
  for (const d of dist.values()) {
    if (d > maxDist) maxDist = d;
  }
  return maxDist;
}

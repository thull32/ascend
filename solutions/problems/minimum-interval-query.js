// Minimum Interval to Include Each Query: sweep queries in order, min-heap by size with lazy expiry.

class MinHeap {
  constructor() {
    this.items = [];
  }

  size() {
    return this.items.length;
  }

  peek() {
    return this.items[0];
  }

  // items are [size, right]; ordered by size ascending (heapq default tuple order).
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

function min_interval(intervals, queries) {
  const sortedIntervals = [...intervals].sort((a, b) => a[0] - b[0]);
  const order = queries.map((_, k) => k).sort((a, b) => queries[a] - queries[b]);
  const answers = new Array(queries.length).fill(-1);
  const heap = new MinHeap();
  let i = 0;
  for (const k of order) {
    const q = queries[k];
    while (i < sortedIntervals.length && sortedIntervals[i][0] <= q) {
      const [left, right] = sortedIntervals[i];
      heap.push([right - left + 1, right]);
      i += 1;
    }
    while (heap.size() > 0 && heap.peek()[1] < q) {
      heap.pop();
    }
    if (heap.size() > 0) {
      answers[k] = heap.peek()[0];
    }
  }
  return answers;
}

// Min-heap of size k: after processing every element the smallest thing in
// the heap is the kth largest overall.
class MinHeap {
  constructor() {
    this.data = [];
  }
  get size() {
    return this.data.length;
  }
  push(x) {
    const d = this.data;
    d.push(x);
    let i = d.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (d[i] < d[p]) {
        [d[i], d[p]] = [d[p], d[i]];
        i = p;
      } else break;
    }
  }
  pop() {
    const d = this.data;
    const top = d[0];
    const last = d.pop();
    if (d.length) {
      d[0] = last;
      let i = 0;
      while (true) {
        const l = 2 * i + 1, r = 2 * i + 2;
        let smallest = i;
        if (l < d.length && d[l] < d[smallest]) smallest = l;
        if (r < d.length && d[r] < d[smallest]) smallest = r;
        if (smallest === i) break;
        [d[i], d[smallest]] = [d[smallest], d[i]];
        i = smallest;
      }
    }
    return top;
  }
}

function find_kth_largest(nums, k) {
  const heap = new MinHeap();
  for (const x of nums) {
    heap.push(x);
    if (heap.size > k) heap.pop();
  }
  return heap.data[0];
}

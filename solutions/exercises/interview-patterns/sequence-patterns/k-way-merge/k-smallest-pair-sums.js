class MinHeap {
  constructor(cmp = (a, b) => a - b) { this.a = []; this.cmp = cmp; }
  size() { return this.a.length; }
  peek() { return this.a[0]; }
  push(x) { this.a.push(x); this.siftUp(this.a.length - 1); }
  pop() {
    const a = this.a;
    if (a.length === 0) return undefined;
    const top = a[0], last = a.pop();
    if (a.length > 0) { a[0] = last; this.siftDown(0); }
    return top;
  }
  siftUp(i) {
    const a = this.a, x = a[i];
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.cmp(x, a[p]) >= 0) break;
      a[i] = a[p]; i = p;
    }
    a[i] = x;
  }
  siftDown(i) {
    const a = this.a, n = a.length, x = a[i];
    for (;;) {
      let c = 2 * i + 1;
      if (c >= n) break;
      if (c + 1 < n && this.cmp(a[c + 1], a[c]) < 0) c++;
      if (this.cmp(a[c], x) >= 0) break;
      a[i] = a[c]; i = c;
    }
    a[i] = x;
  }
}

function k_smallest_pairs(a, b, k) {
  if (a.length === 0 || b.length === 0 || k === 0) return [];

  const cmp = (x, y) => (x[0] - y[0]) || (x[1] - y[1]) || (x[2] - y[2]);
  const heap = new MinHeap(cmp);
  for (let i = 0; i < Math.min(k, a.length); i++) {
    heap.push([a[i] + b[0], i, 0]);
  }

  const result = [];
  while (heap.size() && result.length < k) {
    const [, i, j] = heap.pop();
    result.push([a[i], b[j]]);
    if (j + 1 < b.length) {
      heap.push([a[i] + b[j + 1], i, j + 1]);
    }
  }
  return result;
}

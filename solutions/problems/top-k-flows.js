// Top K Flows: sum bytes per (src, dst), then keep the best k in a min-heap
// whose root is the worst kept flow.

// worse(a, b) < 0 when a is worse than b: fewer bytes, or equal bytes and a
// larger (src, dst) key, because ties go to the smaller key.
function worse(a, b) {
  if (a.total !== b.total) return a.total < b.total ? -1 : 1;
  if (a.src !== b.src) return a.src > b.src ? -1 : 1;
  if (a.dst !== b.dst) return a.dst > b.dst ? -1 : 1;
  return 0;
}

class MinHeap {
  constructor(compare) { this.a = []; this.cmp = compare; }
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
  siftDown(i) {
    const a = this.a;
    for (;;) {
      const l = 2 * i + 1, r = l + 1; let m = i;
      if (l < a.length && this.cmp(a[l], a[m]) < 0) m = l;
      if (r < a.length && this.cmp(a[r], a[m]) < 0) m = r;
      if (m === i) break;
      [a[i], a[m]] = [a[m], a[i]]; i = m;
    }
  }
  replaceTop(x) { this.a[0] = x; this.siftDown(0); }
  pop() {
    const a = this.a; const top = a[0]; const last = a.pop();
    if (a.length) { a[0] = last; this.siftDown(0); }
    return top;
  }
}

function top_k_flows(records, k) {
  if (k <= 0) return [];
  const totals = new Map(); // src -> Map(dst -> total); nested, so no key collisions
  for (const [src, dst, bytes] of records) {
    let inner = totals.get(src);
    if (!inner) { inner = new Map(); totals.set(src, inner); }
    inner.set(dst, (inner.get(dst) || 0) + bytes);
  }

  const heap = new MinHeap(worse);
  for (const [src, inner] of totals) {
    for (const [dst, total] of inner) {
      const flow = { src, dst, total };
      if (heap.size() < k) heap.push(flow);
      else if (worse(heap.peek(), flow) < 0) heap.replaceTop(flow);
    }
  }

  const ranked = [];
  while (heap.size()) {
    const f = heap.pop(); // worst first
    ranked.push([f.src, f.dst, f.total]);
  }
  return ranked.reverse(); // heaviest first
}

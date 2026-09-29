// Running median via two heaps: low is a max-heap for the lower half, high
// is a min-heap for the upper half, kept within one of each other in size.
// Push-then-move never needs balance-case branching.
class BinHeap {
  constructor(cmp) { this.a = []; this.cmp = cmp; }
  push(x) {
    const a = this.a, cmp = this.cmp;
    a.push(x);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (cmp(a[i], a[p]) >= 0) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop() {
    const a = this.a, cmp = this.cmp;
    const top = a[0];
    const last = a.pop();
    if (a.length > 0) {
      a[0] = last;
      let i = 0;
      const n = a.length;
      for (;;) {
        const l = 2 * i + 1, r = 2 * i + 2;
        let s = i;
        if (l < n && cmp(a[l], a[s]) < 0) s = l;
        if (r < n && cmp(a[r], a[s]) < 0) s = r;
        if (s === i) break;
        [a[i], a[s]] = [a[s], a[i]];
        i = s;
      }
    }
    return top;
  }
  peek() { return this.a[0]; }
  size() { return this.a.length; }
}

function stream_medians(nums) {
  const low = new BinHeap((a, b) => b - a);  // max-heap
  const high = new BinHeap((a, b) => a - b); // min-heap
  const out = [];
  for (const x of nums) {
    low.push(x);
    high.push(low.pop());
    if (high.size() > low.size()) {
      low.push(high.pop());
    }
    if (low.size() > high.size()) {
      out.push(low.peek());
    } else {
      out.push((low.peek() + high.peek()) / 2);
    }
  }
  return out;
}

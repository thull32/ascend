// Last Stone Weight — max-heap via negation, repeatedly smash the two heaviest stones.
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

function last_stone_weight(stones) {
  const heap = new MinHeap();
  for (const s of stones) heap.push(-s);
  while (heap.size() > 1) {
    const y = -heap.pop();
    const x = -heap.pop();
    if (y !== x) heap.push(-(y - x));
  }
  return heap.size() ? -heap.peek() : 0;
}

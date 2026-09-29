class MinHeap {
  constructor() { this.a = []; }
  size() { return this.a.length; }
  push(x) {
    const a = this.a; a.push(x);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[i] >= a[p]) break;
      [a[i], a[p]] = [a[p], a[i]]; i = p;
    }
  }
  pop() {
    const a = this.a, top = a[0], last = a.pop();
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < a.length && a[l] < a[m]) m = l;
        if (r < a.length && a[r] < a[m]) m = r;
        if (m === i) break;
        [a[i], a[m]] = [a[m], a[i]]; i = m;
      }
    }
    return top;
  }
}

function connect_ropes(lengths) {
  if (lengths.length <= 1) return 0;
  const heap = new MinHeap();
  for (const len of lengths) heap.push(len);
  let total = 0;
  while (heap.size() > 1) {
    const a = heap.pop();
    const b = heap.pop();
    total += a + b;
    heap.push(a + b);
  }
  return total;
}

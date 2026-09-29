class MinHeap {
  constructor(cmp = (a, b) => a - b) { this.a = []; this.cmp = cmp; }
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
    const a = this.a, top = a[0], last = a.pop();
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < a.length && this.cmp(a[l], a[m]) < 0) m = l;
        if (r < a.length && this.cmp(a[r], a[m]) < 0) m = r;
        if (m === i) break;
        [a[i], a[m]] = [a[m], a[i]]; i = m;
      }
    }
    return top;
  }
}

function merge_k_sorted(arrays) {
  const cmp = (x, y) => (x[0] - y[0]) || (x[1] - y[1]) || (x[2] - y[2]);
  const heap = new MinHeap(cmp);
  for (let i = 0; i < arrays.length; i++) {
    if (arrays[i].length) heap.push([arrays[i][0], i, 0]);
  }

  const result = [];
  while (heap.size()) {
    const [value, i, pos] = heap.pop();
    result.push(value);
    if (pos + 1 < arrays[i].length) {
      heap.push([arrays[i][pos + 1], i, pos + 1]);
    }
  }
  return result;
}

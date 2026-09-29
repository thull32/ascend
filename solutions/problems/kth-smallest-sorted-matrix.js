// Kth Smallest Element in a Sorted Matrix — k-way merge with a min-heap over row heads.
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

function kth_smallest(matrix, k) {
  const rows = matrix.length;
  const cols = matrix[0].length;
  const cmp = (a, b) => a[0] - b[0];
  const heap = new MinHeap(cmp);
  for (let r = 0; r < Math.min(rows, k); r++) {
    heap.push([matrix[r][0], r, 0]);
  }
  let val = 0;
  for (let i = 0; i < k; i++) {
    const [v, r, c] = heap.pop();
    val = v;
    if (c + 1 < cols) heap.push([matrix[r][c + 1], r, c + 1]);
  }
  return val;
}

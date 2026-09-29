// Min-heap of one pointer per list, always advancing the list that owns the
// current minimum; track the running max to know the window's high end.
class MinHeap {
  constructor(less) {
    this.less = less;
    this.data = [];
  }
  push(x) {
    const d = this.data;
    d.push(x);
    let i = d.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.less(d[i], d[p])) {
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
        let s = i;
        if (l < d.length && this.less(d[l], d[s])) s = l;
        if (r < d.length && this.less(d[r], d[s])) s = r;
        if (s === i) break;
        [d[i], d[s]] = [d[s], d[i]];
        i = s;
      }
    }
    return top;
  }
}

function smallest_range(nums) {
  const heap = new MinHeap((a, b) => a[0] < b[0]);
  let hi = -Infinity;
  for (let i = 0; i < nums.length; i++) {
    heap.push([nums[i][0], i, 0]);
    hi = Math.max(hi, nums[i][0]);
  }
  let bestLo = heap.data[0][0], bestHi = hi;
  while (true) {
    const [lo, i, j] = heap.pop();
    if (hi - lo < bestHi - bestLo) {
      bestLo = lo;
      bestHi = hi;
    }
    if (j + 1 === nums[i].length) return [bestLo, bestHi];
    const nxt = nums[i][j + 1];
    hi = Math.max(hi, nxt);
    heap.push([nxt, i, j + 1]);
  }
}

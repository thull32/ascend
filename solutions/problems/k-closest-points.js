// Max-heap of size k keyed by squared distance: keep the k smallest by
// evicting the current farthest whenever the heap grows past k.
class MaxHeap {
  constructor() {
    this.data = []; // [distSq, x, y]
  }
  get size() {
    return this.data.length;
  }
  push(item) {
    const d = this.data;
    d.push(item);
    let i = d.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (d[i][0] > d[p][0]) {
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
        let largest = i;
        if (l < d.length && d[l][0] > d[largest][0]) largest = l;
        if (r < d.length && d[r][0] > d[largest][0]) largest = r;
        if (largest === i) break;
        [d[i], d[largest]] = [d[largest], d[i]];
        i = largest;
      }
    }
    return top;
  }
}

function k_closest(points, k) {
  const heap = new MaxHeap();
  for (const [x, y] of points) {
    heap.push([x * x + y * y, x, y]);
    if (heap.size > k) heap.pop();
  }
  return heap.data.map(([, x, y]) => [x, y]);
}

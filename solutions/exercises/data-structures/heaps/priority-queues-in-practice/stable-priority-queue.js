// Stable priority queue: hand-rolled binary heap with a monotonic sequence
// number as the tiebreaker, compared via less(i, j) so items themselves
// are never compared.
class StablePQ {
  constructor() { this.h = []; this.seq = 0; }
  // entries: [priority, seq, item]
  less(i, j) {
    const a = this.h[i], b = this.h[j];
    return a[0] < b[0] || (a[0] === b[0] && a[1] < b[1]);
  }
  push(item, priority) {
    const h = this.h;
    h.push([priority, this.seq, item]);
    this.seq += 1;
    let i = h.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (!this.less(i, parent)) break;
      [h[parent], h[i]] = [h[i], h[parent]];
      i = parent;
    }
  }
  pop() {
    const h = this.h;
    if (h.length === 0) return null;
    const top = h[0];
    const last = h.pop();
    if (h.length > 0) {
      h[0] = last;
      let i = 0;
      const n = h.length;
      for (;;) {
        const left = 2 * i + 1, right = 2 * i + 2;
        let smallest = i;
        if (left < n && this.less(left, smallest)) smallest = left;
        if (right < n && this.less(right, smallest)) smallest = right;
        if (smallest === i) break;
        [h[i], h[smallest]] = [h[smallest], h[i]];
        i = smallest;
      }
    }
    return top[2];
  }
}

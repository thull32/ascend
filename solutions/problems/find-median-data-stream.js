// Two heaps split the stream at the median: `low` (max-heap) holds the
// smaller half, `high` (min-heap) the larger half, kept balanced so their
// tops border the median.
class BinaryHeap {
  constructor(less) {
    this.less = less;
    this.data = [];
  }
  get size() {
    return this.data.length;
  }
  peek() {
    return this.data[0];
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
        let smallest = i;
        if (l < d.length && this.less(d[l], d[smallest])) smallest = l;
        if (r < d.length && this.less(d[r], d[smallest])) smallest = r;
        if (smallest === i) break;
        [d[i], d[smallest]] = [d[smallest], d[i]];
        i = smallest;
      }
    }
    return top;
  }
}

class MedianFinder {
  constructor() {
    this.low = new BinaryHeap((a, b) => a > b); // max-heap
    this.high = new BinaryHeap((a, b) => a < b); // min-heap
  }

  add_num(num) {
    this.low.push(num);
    this.high.push(this.low.pop());
    if (this.high.size > this.low.size) {
      this.low.push(this.high.pop());
    }
  }

  find_median() {
    if (this.low.size > this.high.size) return this.low.peek();
    return (this.low.peek() + this.high.peek()) / 2;
  }
}

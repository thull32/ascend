// Hand-rolled binary min-heap over a plain array: push/pop/peek via
// explicit sift-up and sift-down, per the lesson's array-mechanics focus.
class MinHeap {
  constructor() { this.a = []; }
  push(x) {
    const a = this.a;
    a.push(x);
    let i = a.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (a[parent] <= a[i]) break;
      [a[parent], a[i]] = [a[i], a[parent]];
      i = parent;
    }
  }
  pop() {
    const a = this.a;
    if (a.length === 0) return null;
    const top = a[0];
    const last = a.pop();
    if (a.length > 0) {
      a[0] = last;
      let i = 0;
      const n = a.length;
      for (;;) {
        const left = 2 * i + 1, right = 2 * i + 2;
        let smallest = i;
        if (left < n && a[left] < a[smallest]) smallest = left;
        if (right < n && a[right] < a[smallest]) smallest = right;
        if (smallest === i) break;
        [a[i], a[smallest]] = [a[smallest], a[i]];
        i = smallest;
      }
    }
    return top;
  }
  peek() {
    return this.a.length ? this.a[0] : null;
  }
  size() { return this.a.length; }
}

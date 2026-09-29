class MinHeap {
  constructor(cmp = (a, b) => a - b) { this.a = []; this.cmp = cmp; }
  size() { return this.a.length; }
  peek() { return this.a[0]; }
  push(x) { this.a.push(x); this.siftUp(this.a.length - 1); }
  pop() {
    const a = this.a;
    if (a.length === 0) return undefined;
    const top = a[0], last = a.pop();
    if (a.length > 0) { a[0] = last; this.siftDown(0); }
    return top;
  }
  siftUp(i) {
    const a = this.a, x = a[i];
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.cmp(x, a[p]) >= 0) break;
      a[i] = a[p]; i = p;
    }
    a[i] = x;
  }
  siftDown(i) {
    const a = this.a, n = a.length, x = a[i];
    for (;;) {
      let c = 2 * i + 1;
      if (c >= n) break;
      if (c + 1 < n && this.cmp(a[c + 1], a[c]) < 0) c++;
      if (this.cmp(a[c], x) >= 0) break;
      a[i] = a[c]; i = c;
    }
    a[i] = x;
  }
}

function top_k_frequent_words(words, k) {
  const counts = new Map();
  for (const w of words) counts.set(w, (counts.get(w) || 0) + 1);

  const heap = new MinHeap((a, b) => {
    if (a[0] !== b[0]) return a[0] - b[0];
    return a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0;
  });
  for (const [word, count] of counts) heap.push([-count, word]);

  const result = [];
  for (let i = 0; i < k; i++) {
    const [, word] = heap.pop();
    result.push(word);
  }
  return result;
}

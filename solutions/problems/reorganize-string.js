// Reorganize String: feasibility check + greedy max-heap (most-remaining-copies first),
// holding back the just-used character for one round.
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

function reorganize_string(s) {
  const counts = new Map();
  for (const ch of s) {
    counts.set(ch, (counts.get(ch) || 0) + 1);
  }
  let maxCount = 0;
  for (const c of counts.values()) {
    if (c > maxCount) maxCount = c;
  }
  if (maxCount > Math.floor((s.length + 1) / 2)) return "";

  const heap = new MinHeap((a, b) => a[0] - b[0]);
  for (const [ch, c] of counts) {
    heap.push([-c, ch]);
  }

  const out = [];
  let held = null;
  while (heap.size() > 0) {
    const [c, ch] = heap.pop();
    out.push(ch);
    if (held !== null && held[0] < 0) {
      heap.push(held);
    }
    held = [c + 1, ch]; // one fewer copy remains; re-enters next round
  }
  return out.join("");
}

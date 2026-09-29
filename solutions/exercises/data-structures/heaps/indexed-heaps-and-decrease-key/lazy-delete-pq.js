// Min-priority queue with lazy deletion: remove() never touches the heap
// array, it just adjusts live/pending counts; pop() discards stale roots
// whose pending count is still positive before returning a live value.
class LazyMinPQ {
  constructor() {
    this.h = [];
    this.live = new Map();      // value -> live copies
    this.pending = new Map();   // value -> copies to discard
    this.n = 0;                 // live size
  }
  _push(x) { const a = this.h; a.push(x); let i = a.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (a[p] <= a[i]) break; [a[p], a[i]] = [a[i], a[p]]; i = p; } }
  _pop() { const a = this.h; const top = a[0]; const last = a.pop(); if (a.length) { a[0] = last; let i = 0; for (;;) { const l = 2*i+1, r = 2*i+2; let s = i; if (l < a.length && a[l] < a[s]) s = l; if (r < a.length && a[r] < a[s]) s = r; if (s === i) break; [a[i], a[s]] = [a[s], a[i]]; i = s; } } return top; }
  push(x) {
    this._push(x);
    this.live.set(x, (this.live.get(x) || 0) + 1);
    this.n += 1;
  }
  remove(x) {
    const count = this.live.get(x) || 0;
    if (count > 0) {
      this.live.set(x, count - 1);
      this.pending.set(x, (this.pending.get(x) || 0) + 1);
      this.n -= 1;
    }
  }
  pop() {
    while (this.h.length > 0 && (this.pending.get(this.h[0]) || 0) > 0) {
      const stale = this._pop();
      this.pending.set(stale, this.pending.get(stale) - 1);
    }
    if (this.h.length === 0) return null;
    const x = this._pop();
    this.live.set(x, this.live.get(x) - 1);
    this.n -= 1;
    return x;
  }
  size() { return this.n; }
}

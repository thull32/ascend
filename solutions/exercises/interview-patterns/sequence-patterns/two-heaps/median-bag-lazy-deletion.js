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

class MedianBag {
  constructor() {
    this.low = new MinHeap((a, b) => b - a);   // max-heap
    this.high = new MinHeap((a, b) => a - b);  // min-heap
    this.pending = new Map();
    this.live = new Map();
    this.nLow = 0; this.nHigh = 0;
  }

  _get(map, key) { return map.get(key) || 0; }

  _pruneLow() {
    while (this.low.size() && this._get(this.pending, this.low.peek()) > 0) {
      const v = this.low.pop();
      this.pending.set(v, this._get(this.pending, v) - 1);
    }
  }

  _pruneHigh() {
    while (this.high.size() && this._get(this.pending, this.high.peek()) > 0) {
      const v = this.high.pop();
      this.pending.set(v, this._get(this.pending, v) - 1);
    }
  }

  _rebalance() {
    this._pruneLow();
    this._pruneHigh();
    if (this.nLow > this.nHigh + 1) {
      const v = this.low.pop();
      this.nLow -= 1;
      this.high.push(v);
      this.nHigh += 1;
      this._pruneLow();
      this._pruneHigh();
    } else if (this.nHigh > this.nLow) {
      const v = this.high.pop();
      this.nHigh -= 1;
      this.low.push(v);
      this.nLow += 1;
      this._pruneLow();
      this._pruneHigh();
    }
  }

  add(x) {
    this._pruneLow();
    this._pruneHigh();
    if (this.low.size() === 0 || x <= this.low.peek()) {
      this.low.push(x);
      this.nLow += 1;
    } else {
      this.high.push(x);
      this.nHigh += 1;
    }
    this.live.set(x, this._get(this.live, x) + 1);
    this._rebalance();
  }

  remove(x) {
    if (this._get(this.live, x) <= 0) return false;
    this._pruneLow();
    this._pruneHigh();
    const belongsToLow = this.low.size() > 0 && x <= this.low.peek();
    this.live.set(x, this._get(this.live, x) - 1);
    this.pending.set(x, this._get(this.pending, x) + 1);
    if (belongsToLow) {
      this.nLow -= 1;
    } else {
      this.nHigh -= 1;
    }
    this._pruneLow();
    this._pruneHigh();
    this._rebalance();
    return true;
  }

  median() {
    this._pruneLow();
    this._pruneHigh();
    const total = this.nLow + this.nHigh;
    if (total === 0) return null;
    if (this.nLow > this.nHigh) return this.low.peek();
    return (this.low.peek() + this.high.peek()) / 2;
  }
}

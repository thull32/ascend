class LazySegmentTree {
  build(values) {
    this.n = values.length;
    this.tot = new Array(4 * this.n).fill(0);
    this.lazy = new Array(4 * this.n).fill(0);
    this._build(1, 0, this.n - 1, values);
  }

  _build(node, lo, hi, values) {
    if (lo === hi) {
      this.tot[node] = values[lo];
      return;
    }
    const mid = Math.floor((lo + hi) / 2);
    this._build(2 * node, lo, mid, values);
    this._build(2 * node + 1, mid + 1, hi, values);
    this.tot[node] = this.tot[2 * node] + this.tot[2 * node + 1];
  }

  _apply(node, lo, hi, delta) {
    this.tot[node] += delta * (hi - lo + 1);
    this.lazy[node] += delta;
  }

  _push(node, lo, hi) {
    if (this.lazy[node]) {
      const mid = Math.floor((lo + hi) / 2);
      this._apply(2 * node, lo, mid, this.lazy[node]);
      this._apply(2 * node + 1, mid + 1, hi, this.lazy[node]);
      this.lazy[node] = 0;
    }
  }

  add(l, r, delta) {
    this._add(1, 0, this.n - 1, l, r, delta);
  }

  _add(node, lo, hi, l, r, delta) {
    if (r < lo || hi < l) return;
    if (l <= lo && hi <= r) {
      this._apply(node, lo, hi, delta);
      return;
    }
    this._push(node, lo, hi);
    const mid = Math.floor((lo + hi) / 2);
    this._add(2 * node, lo, mid, l, r, delta);
    this._add(2 * node + 1, mid + 1, hi, l, r, delta);
    this.tot[node] = this.tot[2 * node] + this.tot[2 * node + 1];
  }

  sum(l, r) {
    return this._sum(1, 0, this.n - 1, l, r);
  }

  _sum(node, lo, hi, l, r) {
    if (r < lo || hi < l) return 0;
    if (l <= lo && hi <= r) return this.tot[node];
    this._push(node, lo, hi);
    const mid = Math.floor((lo + hi) / 2);
    return this._sum(2 * node, lo, mid, l, r) + this._sum(2 * node + 1, mid + 1, hi, l, r);
  }
}

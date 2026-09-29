class MaxTree {
  build(values) {
    this.n = values.length;
    this.tree = new Array(4 * this.n).fill(-Infinity);
    this._build(1, 0, this.n - 1, values);
  }

  _build(node, lo, hi, values) {
    if (lo === hi) {
      this.tree[node] = values[lo];
      return;
    }
    const mid = Math.floor((lo + hi) / 2);
    this._build(2 * node, lo, mid, values);
    this._build(2 * node + 1, mid + 1, hi, values);
    this.tree[node] = Math.max(this.tree[2 * node], this.tree[2 * node + 1]);
  }

  update(i, value) {
    this._update(1, 0, this.n - 1, i, value);
  }

  _update(node, lo, hi, i, value) {
    if (lo === hi) {
      this.tree[node] = value;
      return;
    }
    const mid = Math.floor((lo + hi) / 2);
    if (i <= mid) this._update(2 * node, lo, mid, i, value);
    else this._update(2 * node + 1, mid + 1, hi, i, value);
    this.tree[node] = Math.max(this.tree[2 * node], this.tree[2 * node + 1]);
  }

  query(l, r) {
    return this._query(1, 0, this.n - 1, l, r);
  }

  _query(node, lo, hi, l, r) {
    if (r < lo || hi < l) return -Infinity;
    if (l <= lo && hi <= r) return this.tree[node];
    const mid = Math.floor((lo + hi) / 2);
    return Math.max(
      this._query(2 * node, lo, mid, l, r),
      this._query(2 * node + 1, mid + 1, hi, l, r)
    );
  }

  first_at_least(l, x) {
    return this._first(1, 0, this.n - 1, l, x);
  }

  _first(node, lo, hi, l, x) {
    if (hi < l || this.tree[node] < x) return -1;
    if (lo === hi) return lo;
    const mid = Math.floor((lo + hi) / 2);
    const left = this._first(2 * node, lo, mid, l, x);
    if (left !== -1) return left;
    return this._first(2 * node + 1, mid + 1, hi, l, x);
  }
}

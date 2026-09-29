class AssignAddTree {
  build(values) {
    this.n = values.length;
    this.tot = new Array(4 * this.n).fill(0);
    this.mul = new Array(4 * this.n).fill(1); // pending tag x -> mul*x + add
    this.add_ = new Array(4 * this.n).fill(0);
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

  _apply(node, lo, hi, m, a) {
    this.tot[node] = m * this.tot[node] + a * (hi - lo + 1);
    this.mul[node] = m * this.mul[node];
    this.add_[node] = m * this.add_[node] + a;
  }

  _push(node, lo, hi) {
    if (this.mul[node] !== 1 || this.add_[node] !== 0) {
      const mid = Math.floor((lo + hi) / 2);
      this._apply(2 * node, lo, mid, this.mul[node], this.add_[node]);
      this._apply(2 * node + 1, mid + 1, hi, this.mul[node], this.add_[node]);
      this.mul[node] = 1;
      this.add_[node] = 0;
    }
  }

  _update(node, lo, hi, l, r, m, a) {
    if (r < lo || hi < l) return;
    if (l <= lo && hi <= r) {
      this._apply(node, lo, hi, m, a);
      return;
    }
    this._push(node, lo, hi);
    const mid = Math.floor((lo + hi) / 2);
    this._update(2 * node, lo, mid, l, r, m, a);
    this._update(2 * node + 1, mid + 1, hi, l, r, m, a);
    this.tot[node] = this.tot[2 * node] + this.tot[2 * node + 1];
  }

  assign(l, r, v) {
    this._update(1, 0, this.n - 1, l, r, 0, v);
  }

  add(l, r, d) {
    this._update(1, 0, this.n - 1, l, r, 1, d);
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

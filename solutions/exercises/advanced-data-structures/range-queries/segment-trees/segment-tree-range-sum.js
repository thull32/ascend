class SegmentTree {
  build(values) {
    this.n = values.length;
    this.tree = new Array(2 * this.n).fill(0);
    for (let i = 0; i < this.n; i++) this.tree[this.n + i] = values[i];
    for (let i = this.n - 1; i >= 1; i--) {
      this.tree[i] = this.tree[2 * i] + this.tree[2 * i + 1];
    }
  }

  update(i, value) {
    i += this.n;
    this.tree[i] = value;
    i = Math.floor(i / 2);
    while (i >= 1) {
      this.tree[i] = this.tree[2 * i] + this.tree[2 * i + 1];
      i = Math.floor(i / 2);
    }
  }

  query(l, r) {
    l += this.n;
    r += this.n + 1;
    let total = 0;
    while (l < r) {
      if (l & 1) {
        total += this.tree[l];
        l += 1;
      }
      if (r & 1) {
        r -= 1;
        total += this.tree[r];
      }
      l = Math.floor(l / 2);
      r = Math.floor(r / 2);
    }
    return total;
  }
}

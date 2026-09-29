class Fenwick {
  build(values) {
    this.n = values.length;
    this.tree = new Array(this.n + 1).fill(0);
    for (let i = 0; i < values.length; i++) this.add(i, values[i]);
  }

  add(i, delta) {
    i += 1;
    while (i <= this.n) {
      this.tree[i] += delta;
      i += i & -i;
    }
  }

  prefix(i) {
    i += 1;
    let s = 0;
    while (i > 0) {
      s += this.tree[i];
      i -= i & -i;
    }
    return s;
  }

  sum(l, r) {
    return this.prefix(r) - (l > 0 ? this.prefix(l - 1) : 0);
  }
}

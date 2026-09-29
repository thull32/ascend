class UnionFind {
  init(n) {
    this.parent = Array.from({ length: n }, (_, i) => i);
    this.size = new Array(n).fill(1);
    this.count = n;
  }

  find(x) {
    while (this.parent[x] !== x) {
      this.parent[x] = this.parent[this.parent[x]];
      x = this.parent[x];
    }
    return x;
  }

  union(a, b) {
    let ra = this.find(a), rb = this.find(b);
    if (ra === rb) return false;
    if (this.size[ra] < this.size[rb]) {
      [ra, rb] = [rb, ra];
    }
    this.parent[rb] = ra;
    this.size[ra] += this.size[rb];
    this.count -= 1;
    return true;
  }

  connected(a, b) {
    return this.find(a) === this.find(b);
  }

  components() {
    return this.count;
  }
}

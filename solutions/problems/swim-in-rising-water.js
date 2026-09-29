// Dijkstra-style: always expand the reachable cell whose path-max elevation
// is smallest; the first time we reach the bottom-right, that max is the answer.
class MinHeap {
  constructor(less) {
    this.less = less;
    this.data = [];
  }
  push(x) {
    const d = this.data;
    d.push(x);
    let i = d.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.less(d[i], d[p])) {
        [d[i], d[p]] = [d[p], d[i]];
        i = p;
      } else break;
    }
  }
  pop() {
    const d = this.data;
    const top = d[0];
    const last = d.pop();
    if (d.length) {
      d[0] = last;
      let i = 0;
      while (true) {
        const l = 2 * i + 1, r = 2 * i + 2;
        let s = i;
        if (l < d.length && this.less(d[l], d[s])) s = l;
        if (r < d.length && this.less(d[r], d[s])) s = r;
        if (s === i) break;
        [d[i], d[s]] = [d[s], d[i]];
        i = s;
      }
    }
    return top;
  }
  get size() {
    return this.data.length;
  }
}

function swim_in_water(grid) {
  const n = grid.length;
  const heap = new MinHeap((a, b) => a[0] < b[0]);
  heap.push([grid[0][0], 0, 0]);
  const seen = new Set(["0,0"]);
  while (heap.size) {
    const [level, r, c] = heap.pop();
    if (r === n - 1 && c === n - 1) return level;
    for (const [nr, nc] of [[r + 1, c], [r - 1, c], [r, c + 1], [r, c - 1]]) {
      const key = nr + "," + nc;
      if (nr >= 0 && nr < n && nc >= 0 && nc < n && !seen.has(key)) {
        seen.add(key);
        heap.push([Math.max(level, grid[nr][nc]), nr, nc]);
      }
    }
  }
  return -1; // unreachable: the grid is connected
}

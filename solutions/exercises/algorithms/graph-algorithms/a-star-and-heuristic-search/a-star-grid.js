class MinHeap {
  constructor() { this.a = []; }
  push(x) {
    const a = this.a; a.push(x); let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p][0] <= a[i][0]) break;
      [a[p], a[i]] = [a[i], a[p]]; i = p;
    }
  }
  pop() {
    const a = this.a; const top = a[0]; const last = a.pop();
    if (a.length) {
      a[0] = last; let i = 0;
      for (;;) {
        let l = 2 * i + 1, r = l + 1, m = i;
        if (l < a.length && a[l][0] < a[m][0]) m = l;
        if (r < a.length && a[r][0] < a[m][0]) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]]; i = m;
      }
    }
    return top;
  }
  get size() { return this.a.length; }
}

function a_star_grid(grid, start, goal) {
  const rows = grid.length, cols = grid[0].length;
  const [sr, sc] = start;
  const [gr, gc] = goal;
  const h = (r, c) => Math.abs(r - gr) + Math.abs(c - gc);

  const key = (r, c) => r * cols + c;
  const g = new Map();
  g.set(key(sr, sc), 0);
  const heap = new MinHeap();
  heap.push([h(sr, sc), 0, sr, sc]);
  const closed = new Set();

  while (heap.size) {
    const [f, curG, r, c] = heap.pop();
    if (r === gr && c === gc) return curG;
    const k = key(r, c);
    if (closed.has(k)) continue;
    closed.add(k);
    for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nr = r + dr, nc = c + dc;
      if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && grid[nr][nc] === 0) {
        const ng = curG + 1;
        const nk = key(nr, nc);
        if (ng < (g.has(nk) ? g.get(nk) : Infinity)) {
          g.set(nk, ng);
          heap.push([ng + h(nr, nc), ng, nr, nc]);
        }
      }
    }
  }

  return -1;
}

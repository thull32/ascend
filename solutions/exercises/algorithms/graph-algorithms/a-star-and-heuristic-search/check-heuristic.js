class MinHeap {
  constructor() { this.a = []; }
  push(x) { const a = this.a; a.push(x); let i = a.length - 1;
    while (i > 0) { const p = (i - 1) >> 1; if (a[p][0] <= a[i][0]) break; [a[p], a[i]] = [a[i], a[p]]; i = p; } }
  pop() { const a = this.a; const top = a[0]; const last = a.pop();
    if (a.length) { a[0] = last; let i = 0;
      for (;;) { let l = 2 * i + 1, r = l + 1, m = i;
        if (l < a.length && a[l][0] < a[m][0]) m = l;
        if (r < a.length && a[r][0] < a[m][0]) m = r;
        if (m === i) break; [a[m], a[i]] = [a[i], a[m]]; i = m; } }
    return top; }
  get size() { return this.a.length; }
}

function check_heuristic(n, edges, goal, h) {
  const radj = Array.from({ length: n }, () => []);
  for (const [u, v, w] of edges) radj[v].push([u, w]);

  const dist = new Array(n).fill(Infinity);
  dist[goal] = 0;
  const heap = new MinHeap();
  heap.push([0, goal]);
  while (heap.size) {
    const [d, u] = heap.pop();
    if (d > dist[u]) continue;
    for (const [v, w] of radj[u]) {
      const nd = d + w;
      if (nd < dist[v]) {
        dist[v] = nd;
        heap.push([nd, v]);
      }
    }
  }

  let admissible = true;
  for (let v = 0; v < n; v++) {
    if (dist[v] !== Infinity && h[v] > dist[v]) {
      admissible = false;
      break;
    }
  }

  let consistent = h[goal] === 0;
  if (consistent) {
    for (const [u, v, w] of edges) {
      if (h[u] > w + h[v]) {
        consistent = false;
        break;
      }
    }
  }

  return { admissible, consistent };
}

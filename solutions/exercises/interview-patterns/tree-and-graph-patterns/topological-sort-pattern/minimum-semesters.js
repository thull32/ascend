function min_semesters(n, prereqs) {
  const adj = Array.from({ length: n }, () => []);
  const indeg = new Array(n).fill(0);
  for (const [a, b] of prereqs) {
    adj[b].push(a);
    indeg[a] += 1;
  }

  let queue = [];
  for (let i = 0; i < n; i++) if (indeg[i] === 0) queue.push(i);

  let taken = 0;
  let semesters = 0;
  while (queue.length) {
    semesters += 1;
    const next = [];
    for (const course of queue) {
      taken += 1;
      for (const nxt of adj[course]) {
        indeg[nxt] -= 1;
        if (indeg[nxt] === 0) next.push(nxt);
      }
    }
    queue = next;
  }

  return taken === n ? semesters : -1;
}

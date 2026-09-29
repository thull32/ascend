function unique_order(n, prereqs) {
  const adj = Array.from({ length: n }, () => []);
  const indeg = new Array(n).fill(0);
  for (const [a, b] of prereqs) {
    adj[b].push(a);
    indeg[a] += 1;
  }

  const queue = [];
  for (let i = 0; i < n; i++) if (indeg[i] === 0) queue.push(i);

  let taken = 0;
  let head = 0;
  while (head < queue.length) {
    if (queue.length - head > 1) return false;
    const course = queue[head++];
    taken += 1;
    for (const nxt of adj[course]) {
      indeg[nxt] -= 1;
      if (indeg[nxt] === 0) queue.push(nxt);
    }
  }

  return taken === n;
}

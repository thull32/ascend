function bfs_distances(n, adj, start) {
  const dist = new Array(n).fill(-1);
  dist[start] = 0;
  const queue = [start];
  let head = 0;
  while (head < queue.length) {
    const u = queue[head++];
    for (const v of adj[u]) {
      if (dist[v] === -1) {
        dist[v] = dist[u] + 1;
        queue.push(v);
      }
    }
  }
  return dist;
}

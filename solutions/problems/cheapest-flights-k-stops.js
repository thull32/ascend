// Bellman-Ford limited to k+1 rounds: round r relaxes paths using at most r edges.
function find_cheapest_price(n, flights, src, dst, k) {
  const INF = Infinity;
  let prev = new Array(n).fill(INF);
  prev[src] = 0;
  for (let round = 0; round <= k; round++) {
    const cur = prev.slice();
    for (const [u, v, price] of flights) {
      if (prev[u] + price < cur[v]) cur[v] = prev[u] + price;
    }
    prev = cur;
  }
  return prev[dst] !== INF ? prev[dst] : -1;
}

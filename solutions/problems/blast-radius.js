// Join every core node to one virtual root. Part 1: BFS from the root with and
// without the failed device; stranded = reachable before, not after, and not
// the failed device itself. Part 2: one iterative DFS from the root (Tarjan's
// articulation points): device p cuts off the whole subtree of a DFS child v
// when low[v] >= disc[p], so add that subtree's leaf count to p.
function blast_radius(links, leaves, core, failed) {
  const nameSet = new Set([...leaves, ...core]);
  for (const [a, b] of links) {
    nameSet.add(a);
    nameSet.add(b);
  }
  const names = [...nameSet].sort();
  const idx = new Map(names.map((name, i) => [name, i]));
  const n = names.length;
  const root = n;
  const adj = Array.from({ length: n + 1 }, () => []);
  for (const [a, b] of links) {
    if (a === b) continue; // a self-loop never helps reachability
    adj[idx.get(a)].push(idx.get(b));
    adj[idx.get(b)].push(idx.get(a));
  }
  for (const c of core) {
    adj[root].push(idx.get(c));
    adj[idx.get(c)].push(root);
  }
  const isLeaf = new Array(n + 1).fill(false);
  for (const leaf of leaves) isLeaf[idx.get(leaf)] = true;

  const reachable = (removed) => {
    const seen = new Array(n + 1).fill(false);
    seen[root] = true;
    const queue = [root];
    for (let head = 0; head < queue.length; head++) {
      for (const w of adj[queue[head]]) {
        if (w !== removed && !seen[w]) {
          seen[w] = true;
          queue.push(w);
        }
      }
    }
    return seen;
  };

  const gone = idx.has(failed) ? idx.get(failed) : -1;
  const before = reachable(-1);
  const after = reachable(gone);
  const stranded = leaves
    .filter((name) => {
      const i = idx.get(name);
      return i !== gone && before[i] && !after[i];
    })
    .sort();

  const disc = new Array(n + 1).fill(-1);
  const low = new Array(n + 1).fill(0);
  const below = new Array(n + 1).fill(0);
  const cutOff = new Array(n + 1).fill(0);
  const parent = new Array(n + 1).fill(-1);
  const next = new Array(n + 1).fill(0);
  disc[root] = 0;
  low[root] = 0;
  let timer = 1;
  const stack = [root];
  while (stack.length > 0) {
    const v = stack[stack.length - 1];
    if (next[v] < adj[v].length) {
      const w = adj[v][next[v]++];
      if (disc[w] === -1) {
        parent[w] = v;
        disc[w] = low[w] = timer++;
        below[w] = isLeaf[w] ? 1 : 0;
        stack.push(w);
      } else {
        low[v] = Math.min(low[v], disc[w]);
      }
    } else {
      stack.pop();
      const p = parent[v];
      if (p === -1) continue;
      low[p] = Math.min(low[p], low[v]);
      below[p] += below[v];
      if (p !== root && low[v] >= disc[p]) cutOff[p] += below[v];
    }
  }

  let worst = null;
  let worstCount = 0;
  for (let i = 0; i < n; i++) {
    if (cutOff[i] > worstCount) {
      worst = names[i];
      worstCount = cutOff[i];
    }
  }
  return { stranded, worst, worst_count: worstCount };
}

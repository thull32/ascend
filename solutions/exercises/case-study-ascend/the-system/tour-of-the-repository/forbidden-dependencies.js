function forbidden_reachable(graph, start, forbidden) {
  const visited = new Set();
  const stack = [...(graph[start] || [])];

  while (stack.length > 0) {
    const node = stack.pop();
    if (visited.has(node)) continue;
    visited.add(node);
    stack.push(...(graph[node] || []));
  }

  const forbiddenSet = new Set(forbidden);
  return Array.from(visited).filter((n) => forbiddenSet.has(n)).sort();
}

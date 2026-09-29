function garbage(objects, edges, roots) {
  const visited = new Set();
  const stack = [...roots];
  while (stack.length > 0) {
    const x = stack.pop();
    if (visited.has(x)) continue;
    visited.add(x);
    const neighbors = edges[String(x)] || [];
    for (const nxt of neighbors) {
      stack.push(nxt);
    }
  }
  return objects.filter((x) => !visited.has(x)).sort((a, b) => a - b);
}

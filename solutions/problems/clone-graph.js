// Iterative DFS with a map from original node to its clone, keyed by identity.
function clone_graph(node) {
  if (node === null) return null;
  const clones = new Map();
  clones.set(node, new Node(node.val));
  const stack = [node];
  while (stack.length) {
    const cur = stack.pop();
    for (const nb of cur.neighbors) {
      if (!clones.has(nb)) {
        clones.set(nb, new Node(nb.val));
        stack.push(nb);
      }
      clones.get(cur).neighbors.push(clones.get(nb));
    }
  }
  return clones.get(node);
}

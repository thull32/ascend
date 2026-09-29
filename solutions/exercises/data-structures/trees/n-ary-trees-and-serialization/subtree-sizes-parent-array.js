function subtree_sizes(parent) {
  const n = parent.length;
  const sizes = new Array(n).fill(1);
  const children = Array.from({ length: n }, () => []);
  let root = -1;
  for (let i = 0; i < n; i++) {
    if (parent[i] === -1) root = i;
    else children[parent[i]].push(i);
  }

  const order = [];
  const stack = [root];
  while (stack.length > 0) {
    const node = stack.pop();
    order.push(node);
    for (const c of children[node]) stack.push(c);
  }

  for (let k = order.length - 1; k >= 0; k--) {
    const node = order[k];
    for (const c of children[node]) sizes[node] += sizes[c];
  }

  return sizes;
}

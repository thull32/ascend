function largest_per_level(root) {
  if (root === null) return [];
  const result = [];
  let queue = [root];
  while (queue.length) {
    let levelMax = null;
    const next = [];
    for (const node of queue) {
      if (levelMax === null || node.val > levelMax) levelMax = node.val;
      if (node.left) next.push(node.left);
      if (node.right) next.push(node.right);
    }
    result.push(levelMax);
    queue = next;
  }
  return result;
}

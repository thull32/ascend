// Binary Tree Level Order Traversal — BFS, snapshot queue length per level.
function level_order(root) {
  if (root === null) return [];
  const result = [];
  let queue = [root];
  while (queue.length) {
    const level = [];
    const next = [];
    for (const node of queue) {
      level.push(node.val);
      if (node.left !== null) next.push(node.left);
      if (node.right !== null) next.push(node.right);
    }
    result.push(level);
    queue = next;
  }
  return result;
}

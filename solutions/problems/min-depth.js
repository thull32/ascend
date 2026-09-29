// Minimum Depth of Binary Tree: BFS level order, return on the first leaf dequeued.
// Uses TreeNode which is provided globally by the grading harness.
function min_depth(root) {
  if (root === null || root === undefined) {
    return 0;
  }
  let queue = [root];
  let depth = 1;
  while (queue.length > 0) {
    const next = [];
    for (const node of queue) {
      if ((node.left === null || node.left === undefined) && (node.right === null || node.right === undefined)) {
        return depth;
      }
      if (node.left !== null && node.left !== undefined) {
        next.push(node.left);
      }
      if (node.right !== null && node.right !== undefined) {
        next.push(node.right);
      }
    }
    queue = next;
    depth += 1;
  }
  return depth;
}

// Binary Tree Right Side View: BFS by level, recording the last node of each level.
// Uses the global TreeNode class provided by the harness.
function right_side_view(root) {
  if (root === null) return [];
  const view = [];
  let queue = [root];
  while (queue.length > 0) {
    const size = queue.length;
    const next = [];
    for (let i = 0; i < size; i++) {
      const node = queue[i];
      if (i === size - 1) {
        view.push(node.val);
      }
      if (node.left !== null) next.push(node.left);
      if (node.right !== null) next.push(node.right);
    }
    queue = next;
  }
  return view;
}

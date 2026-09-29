// Path Sum II: DFS backtracking, sharing one path array, copy only at a matching leaf.
// Uses the global TreeNode class provided by the harness.
function path_sum(root, target) {
  const results = [];
  const path = [];

  function dfs(node, remaining) {
    if (node === null) return;
    path.push(node.val);
    remaining -= node.val;
    if (node.left === null && node.right === null) {
      if (remaining === 0) {
        results.push(path.slice());
      }
    } else {
      dfs(node.left, remaining);
      dfs(node.right, remaining);
    }
    path.pop();
  }

  dfs(root, target);
  return results;
}

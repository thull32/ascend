// Top-down DFS carrying the maximum value seen on the path from the root.
// Uses the harness-provided TreeNode class.
function good_nodes(root) {
  function dfs(node, maxSoFar) {
    if (node === null) return 0;
    const good = node.val >= maxSoFar ? 1 : 0;
    const nextMax = Math.max(maxSoFar, node.val);
    return good + dfs(node.left, nextMax) + dfs(node.right, nextMax);
  }

  return root !== null ? dfs(root, -Infinity) : 0;
}

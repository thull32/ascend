function count_good_nodes(root) {
  if (root === null) return 0;

  function dfs(node, pathMax) {
    if (node === null) return 0;
    const good = node.val >= pathMax ? 1 : 0;
    const newMax = Math.max(pathMax, node.val);
    return good + dfs(node.left, newMax) + dfs(node.right, newMax);
  }

  return dfs(root, root.val);
}

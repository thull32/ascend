// Maximum Depth of Binary Tree — post-order recursion.
function max_depth(root) {
  if (root === null) return 0;
  return 1 + Math.max(max_depth(root.left), max_depth(root.right));
}

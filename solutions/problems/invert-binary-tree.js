// Swap each node's children, then recurse into both (now-swapped) subtrees.
function invert_tree(root) {
  if (root === null) return null;
  [root.left, root.right] = [root.right, root.left];
  invert_tree(root.left);
  invert_tree(root.right);
  return root;
}

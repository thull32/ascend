// Lowest Common Ancestor of a BST — walk down from the root using BST ordering.
function lowest_common_ancestor(root, p, q) {
  const lo = Math.min(p, q);
  const hi = Math.max(p, q);
  let node = root;
  while (node !== null) {
    if (hi < node.val) {
      node = node.left;
    } else if (lo > node.val) {
      node = node.right;
    } else {
      return node.val;
    }
  }
  return -1; // unreachable: p and q are guaranteed to exist
}

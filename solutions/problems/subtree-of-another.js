// Check every node of root: is the subtree rooted there identical to sub?
function is_subtree(root, sub) {
  function same(a, b) {
    if (a === null && b === null) return true;
    if (a === null || b === null || a.val !== b.val) return false;
    return same(a.left, b.left) && same(a.right, b.right);
  }

  if (root === null) return sub === null;
  if (same(root, sub)) return true;
  return is_subtree(root.left, sub) || is_subtree(root.right, sub);
}

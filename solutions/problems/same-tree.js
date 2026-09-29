// Same Tree: recursive structural comparison.
// Uses the global TreeNode class provided by the harness.
function is_same_tree(p, q) {
  if (p === null && q === null) return true;
  if (p === null || q === null) return false;
  if (p.val !== q.val) return false;
  return is_same_tree(p.left, q.left) && is_same_tree(p.right, q.right);
}

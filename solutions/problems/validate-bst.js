// Carry down a valid (lo, hi) range for each node: every value in the left
// subtree must stay below the node, every value in the right above it.
function is_valid_bst(root) {
  function valid(node, lo, hi) {
    if (node === null) return true;
    if (!(lo < node.val && node.val < hi)) return false;
    return valid(node.left, lo, node.val) && valid(node.right, node.val, hi);
  }

  return valid(root, -Infinity, Infinity);
}

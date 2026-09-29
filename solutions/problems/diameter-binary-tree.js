// Compute height bottom-up; the diameter through any node is the sum of its
// two subtree heights, tracked as a running best.
function diameter_of_binary_tree(root) {
  let best = 0;

  function height(node) {
    if (node === null) return 0;
    const l = height(node.left);
    const r = height(node.right);
    best = Math.max(best, l + r);
    return 1 + Math.max(l, r);
  }

  height(root);
  return best;
}

// Compute height bottom-up; use a sentinel to short-circuit as soon as any
// subtree is found unbalanced.
function is_balanced(root) {
  const UNBALANCED = -1;

  function height(node) {
    if (node === null) return 0;
    const l = height(node.left);
    if (l === UNBALANCED) return UNBALANCED;
    const r = height(node.right);
    if (r === UNBALANCED) return UNBALANCED;
    if (Math.abs(l - r) > 1) return UNBALANCED;
    return 1 + Math.max(l, r);
  }

  return height(root) !== UNBALANCED;
}

// Preorder's next value is always the current subtree's root; its position
// in inorder splits the left and right subtree ranges.
function build_tree(preorder, inorder) {
  const index = new Map();
  inorder.forEach((v, i) => index.set(v, i));
  let prePos = 0;

  function build(lo, hi) {
    if (lo >= hi) return null;
    const val = preorder[prePos];
    prePos += 1;
    const node = new TreeNode(val);
    const mid = index.get(val);
    node.left = build(lo, mid); // must build left first
    node.right = build(mid + 1, hi);
    return node;
  }

  return build(0, inorder.length);
}

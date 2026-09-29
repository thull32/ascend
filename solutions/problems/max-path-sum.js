// Binary Tree Maximum Path Sum — post-order, clamped downward arms plus a two-arm bend candidate.
function max_path_sum(root) {
  let best = -Infinity;

  function arm(node) {
    if (node === null) return 0;
    const left = Math.max(0, arm(node.left)); // a negative arm is worth less than no arm
    const right = Math.max(0, arm(node.right));
    best = Math.max(best, left + node.val + right); // node as the bend point
    return node.val + Math.max(left, right); // best single arm for the parent
  }

  arm(root);
  return best;
}

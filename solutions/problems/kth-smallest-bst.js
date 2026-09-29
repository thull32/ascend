// Kth Smallest Element in a BST — iterative in-order traversal, stop at k-th visit.
function kth_smallest(root, k) {
  const stack = [];
  let node = root;
  for (;;) {
    while (node !== null) {
      stack.push(node);
      node = node.left;
    }
    node = stack.pop();
    k -= 1;
    if (k === 0) return node.val;
    node = node.right;
  }
}

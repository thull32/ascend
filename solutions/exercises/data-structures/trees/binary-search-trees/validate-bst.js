class BTNode {
  constructor(val) { this.val = val; this.left = null; this.right = null; }
}

function build_tree(values) {
  if (!values.length || values[0] === null) return null;
  const root = new BTNode(values[0]);
  const queue = [root];
  let head = 0, i = 1;
  while (head < queue.length && i < values.length) {
    const node = queue[head++];
    if (values[i] !== null && values[i] !== undefined) { node.left = new BTNode(values[i]); queue.push(node.left); }
    i++;
    if (i < values.length && values[i] !== null) { node.right = new BTNode(values[i]); queue.push(node.right); }
    i++;
  }
  return root;
}

function valid(node, lo, hi) {
  if (node === null) return true;
  if ((lo !== null && node.val <= lo) || (hi !== null && node.val >= hi)) return false;
  return valid(node.left, lo, node.val) && valid(node.right, node.val, hi);
}

function is_valid_bst(values) {
  const root = build_tree(values);
  return valid(root, null, null);
}

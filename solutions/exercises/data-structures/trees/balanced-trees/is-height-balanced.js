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

const UNBALANCED = -2;

function heightOrUnbalanced(node) {
  if (node === null) return -1;
  const hl = heightOrUnbalanced(node.left);
  if (hl === UNBALANCED) return UNBALANCED;
  const hr = heightOrUnbalanced(node.right);
  if (hr === UNBALANCED) return UNBALANCED;
  if (Math.abs(hl - hr) > 1) return UNBALANCED;
  return 1 + Math.max(hl, hr);
}

function is_height_balanced(values) {
  const root = build_tree(values);
  return heightOrUnbalanced(root) !== UNBALANCED;
}

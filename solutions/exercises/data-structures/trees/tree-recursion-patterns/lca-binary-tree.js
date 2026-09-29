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

function lcaNode(node, a, b) {
  if (node === null || node.val === a || node.val === b) return node;
  const left = lcaNode(node.left, a, b);
  const right = lcaNode(node.right, a, b);
  if (left !== null && right !== null) return node;
  return left !== null ? left : right;
}

function lca(values, a, b) {
  const root = build_tree(values);
  const result = lcaNode(root, a, b);
  return result !== null ? result.val : null;
}

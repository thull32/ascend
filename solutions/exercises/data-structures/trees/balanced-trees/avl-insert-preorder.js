class AVLNode {
  constructor(val) { this.val = val; this.left = null; this.right = null; this.height = 0; }
}

const h = node => (node === null ? -1 : node.height);
const update = node => { node.height = 1 + Math.max(h(node.left), h(node.right)); };

function rotate_right(y) {
  const x = y.left;
  y.left = x.right;
  x.right = y;
  update(y);
  update(x);
  return x;
}

function rotate_left(x) {
  const y = x.right;
  x.right = y.left;
  y.left = x;
  update(x);
  update(y);
  return y;
}

function insert(node, key) {
  if (node === null) return new AVLNode(key);
  if (key < node.val) {
    node.left = insert(node.left, key);
  } else if (key > node.val) {
    node.right = insert(node.right, key);
  } else {
    return node;
  }
  update(node);
  const bf = h(node.left) - h(node.right);
  if (bf > 1) {
    if (key < node.left.val) return rotate_right(node);
    node.left = rotate_left(node.left);
    return rotate_right(node);
  }
  if (bf < -1) {
    if (key > node.right.val) return rotate_left(node);
    node.right = rotate_right(node.right);
    return rotate_left(node);
  }
  return node;
}

function preorderInto(node, out) {
  if (node === null) return;
  out.push(node.val);
  preorderInto(node.left, out);
  preorderInto(node.right, out);
}

function avl_insert_preorder(values) {
  let root = null;
  for (const v of values) root = insert(root, v);
  const out = [];
  preorderInto(root, out);
  return out;
}

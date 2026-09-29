class BTNode {
  constructor(val) { this.val = val; this.left = null; this.right = null; }
}

function insert(node, key) {
  if (node === null) return new BTNode(key);
  if (key < node.val) node.left = insert(node.left, key);
  else if (key > node.val) node.right = insert(node.right, key);
  return node;
}

function delete_key(node, key) {
  if (node === null) return null;
  if (key < node.val) {
    node.left = delete_key(node.left, key);
  } else if (key > node.val) {
    node.right = delete_key(node.right, key);
  } else {
    if (node.left === null) return node.right;
    if (node.right === null) return node.left;
    let succ = node.right;
    while (succ.left !== null) succ = succ.left;
    node.val = succ.val;
    node.right = delete_key(node.right, succ.val);
  }
  return node;
}

function preorderInto(node, out) {
  if (node === null) return;
  out.push(node.val);
  preorderInto(node.left, out);
  preorderInto(node.right, out);
}

function bst_insert_delete(values, key) {
  let root = null;
  for (const v of values) root = insert(root, v);
  root = delete_key(root, key);
  const out = [];
  preorderInto(root, out);
  return out;
}

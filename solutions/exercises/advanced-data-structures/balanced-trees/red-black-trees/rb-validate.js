class N {
  constructor(key, color) {
    this.key = key;
    this.color = color;
    this.left = null;
    this.right = null;
  }
}

function build(nodes) {
  if (!nodes || nodes.length === 0 || nodes[0] === null) return null;
  const root = new N(nodes[0][0], nodes[0][1]);
  const q = [root];
  let i = 1;
  const n = nodes.length;
  while (q.length && i < n) {
    const cur = q.shift();
    if (i < n) {
      const entry = nodes[i];
      i += 1;
      if (entry !== null) {
        cur.left = new N(entry[0], entry[1]);
        q.push(cur.left);
      }
    }
    if (i < n) {
      const entry = nodes[i];
      i += 1;
      if (entry !== null) {
        cur.right = new N(entry[0], entry[1]);
        q.push(cur.right);
      }
    }
  }
  return root;
}

function rb_valid(nodes) {
  const root = build(nodes);
  if (root === null) return true;
  if (root.color !== "B") return false;

  function check(node, lo, hi) {
    if (node === null) return 1;
    if (lo !== null && node.key <= lo) return -1;
    if (hi !== null && node.key >= hi) return -1;
    if (node.color === "R") {
      if ((node.left && node.left.color === "R") || (node.right && node.right.color === "R")) {
        return -1;
      }
    }
    const leftBh = check(node.left, lo, node.key);
    if (leftBh === -1) return -1;
    const rightBh = check(node.right, node.key, hi);
    if (rightBh === -1) return -1;
    if (leftBh !== rightBh) return -1;
    return leftBh + (node.color === "B" ? 1 : 0);
  }

  return check(root, null, null) !== -1;
}

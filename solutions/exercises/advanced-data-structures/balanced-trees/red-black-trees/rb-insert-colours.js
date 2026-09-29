class Node {
  constructor(key) {
    this.key = key;
    this.color = "R";
    this.left = this.right = this.parent = null;
  }
}

class RBTree {
  constructor() {
    this.root = null;
  }

  rotateLeft(x) {
    const y = x.right;
    x.right = y.left;
    if (y.left) y.left.parent = x;
    y.parent = x.parent;
    if (x.parent === null) this.root = y;
    else if (x === x.parent.left) x.parent.left = y;
    else x.parent.right = y;
    y.left = x;
    x.parent = y;
  }

  rotateRight(y) {
    const x = y.left;
    y.left = x.right;
    if (x.right) x.right.parent = y;
    x.parent = y.parent;
    if (y.parent === null) this.root = x;
    else if (y === y.parent.left) y.parent.left = x;
    else y.parent.right = x;
    x.right = y;
    y.parent = x;
  }

  insert(key) {
    const z = new Node(key);
    let parent = null;
    let cur = this.root;
    while (cur) {
      parent = cur;
      cur = key < cur.key ? cur.left : cur.right;
    }
    z.parent = parent;
    if (parent === null) this.root = z;
    else if (key < parent.key) parent.left = z;
    else parent.right = z;

    z.color = "R";
    this._fixup(z);
  }

  _fixup(z) {
    while (z.parent && z.parent.color === "R") {
      let parent = z.parent;
      const grand = parent.parent;
      if (grand === null) break;
      if (parent === grand.left) {
        const uncle = grand.right;
        if (uncle && uncle.color === "R") {
          parent.color = "B";
          uncle.color = "B";
          grand.color = "R";
          z = grand;
        } else {
          if (z === parent.right) {
            z = parent;
            this.rotateLeft(z);
            parent = z.parent;
          }
          parent.color = "B";
          grand.color = "R";
          this.rotateRight(grand);
        }
      } else {
        const uncle = grand.left;
        if (uncle && uncle.color === "R") {
          parent.color = "B";
          uncle.color = "B";
          grand.color = "R";
          z = grand;
        } else {
          if (z === parent.left) {
            z = parent;
            this.rotateRight(z);
            parent = z.parent;
          }
          parent.color = "B";
          grand.color = "R";
          this.rotateLeft(grand);
        }
      }
    }
    this.root.color = "B";
  }
}

function rb_level_order(values) {
  const t = new RBTree();
  for (const v of values) t.insert(v);
  const order = [];
  if (t.root) {
    const q = [t.root];
    while (q.length) {
      const n = q.shift();
      order.push([n.key, n.color]);
      if (n.left) q.push(n.left);
      if (n.right) q.push(n.right);
    }
  }
  return order;
}

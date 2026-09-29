class Node {
  constructor(key, left = null, right = null) {
    this.key = key;
    this.left = left;
    this.right = right;
  }
}

class PersistentBST {
  constructor() {
    this.roots = [null]; // roots[v] is the root of version v
  }

  insert(version, key) {
    let count = 0;

    const ins = (node) => {
      if (node === null) {
        count += 1;
        return new Node(key);
      }
      if (key === node.key) return node;
      if (key < node.key) {
        const newLeft = ins(node.left);
        if (newLeft === node.left) return node;
        count += 1;
        return new Node(node.key, newLeft, node.right);
      }
      const newRight = ins(node.right);
      if (newRight === node.right) return node;
      count += 1;
      return new Node(node.key, node.left, newRight);
    };

    const newRoot = ins(this.roots[version]);
    this.roots.push(newRoot);
    return count;
  }

  contains(version, key) {
    let node = this.roots[version];
    while (node !== null) {
      if (key === node.key) return true;
      node = key < node.key ? node.left : node.right;
    }
    return false;
  }

  inorder(version) {
    const result = [];
    const visit = (node) => {
      if (node !== null) {
        visit(node.left);
        result.push(node.key);
        visit(node.right);
      }
    };
    visit(this.roots[version]);
    return result;
  }
}

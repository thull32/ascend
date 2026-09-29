function bisectRight(arr, x) {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid] <= x) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

class Node {
  constructor(leaf) {
    this.leaf = leaf;
    this.keys = [];
    this.children = [];
    this.next = null;
  }
}

class BPlusTree {
  constructor() {
    this.maxKeys = 3;
    this.root = new Node(true);
  }

  set_order(maxKeys) {
    this.maxKeys = maxKeys;
  }

  _insert(node, key) {
    if (node.leaf) {
      const i = bisectRight(node.keys, key);
      node.keys.splice(i, 0, key);
      if (node.keys.length <= this.maxKeys) return null;
      const m = node.keys.length;
      const leftSize = Math.floor((m + 1) / 2);
      const newLeaf = new Node(true);
      newLeaf.keys = node.keys.slice(leftSize);
      node.keys = node.keys.slice(0, leftSize);
      newLeaf.next = node.next;
      node.next = newLeaf;
      return [newLeaf.keys[0], newLeaf];
    }

    const i = bisectRight(node.keys, key);
    const result = this._insert(node.children[i], key);
    if (result === null) return null;
    const [sep, newChild] = result;
    node.keys.splice(i, 0, sep);
    node.children.splice(i + 1, 0, newChild);
    if (node.keys.length <= this.maxKeys) return null;
    const m = node.keys.length;
    const mid = Math.floor(m / 2);
    const pushUp = node.keys[mid];
    const newNode = new Node(false);
    newNode.keys = node.keys.slice(mid + 1);
    newNode.children = node.children.slice(mid + 1);
    node.keys = node.keys.slice(0, mid);
    node.children = node.children.slice(0, mid + 1);
    return [pushUp, newNode];
  }

  insert(key) {
    const result = this._insert(this.root, key);
    if (result !== null) {
      const [sep, newChild] = result;
      const newRoot = new Node(false);
      newRoot.keys = [sep];
      newRoot.children = [this.root, newChild];
      this.root = newRoot;
    }
  }

  range(lo, hi) {
    let node = this.root;
    while (!node.leaf) {
      const i = bisectRight(node.keys, lo);
      node = node.children[i];
    }
    const out = [];
    while (node !== null) {
      for (const k of node.keys) {
        if (k > hi) return out;
        if (k >= lo) out.push(k);
      }
      node = node.next;
    }
    return out;
  }

  height() {
    let h = 1;
    let node = this.root;
    while (!node.leaf) {
      h += 1;
      node = node.children[0];
    }
    return h;
  }

  leaves() {
    let node = this.root;
    while (!node.leaf) node = node.children[0];
    const out = [];
    while (node !== null) {
      out.push(node.keys.slice());
      node = node.next;
    }
    return out;
  }
}

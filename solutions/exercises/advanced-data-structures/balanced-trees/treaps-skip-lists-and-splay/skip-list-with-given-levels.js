class SLNode {
  constructor(key, level) {
    this.key = key;
    this.forward = new Array(level).fill(null);
  }
}

class SkipList {
  constructor() {
    this.head = new SLNode(null, 1);
  }

  insert(key, level) {
    let maxLevel = this.head.forward.length;
    if (level > maxLevel) {
      for (let i = maxLevel; i < level; i++) this.head.forward.push(null);
      maxLevel = level;
    }

    const update = new Array(maxLevel).fill(null);
    let node = this.head;
    for (let i = maxLevel - 1; i >= 0; i--) {
      while (node.forward[i] !== null && node.forward[i].key < key) {
        node = node.forward[i];
      }
      update[i] = node;
    }

    const newNode = new SLNode(key, level);
    for (let i = 0; i < level; i++) {
      newNode.forward[i] = update[i].forward[i];
      update[i].forward[i] = newNode;
    }
  }

  contains(key) {
    let node = this.head;
    const top = this.head.forward.length - 1;
    for (let i = top; i >= 0; i--) {
      while (node.forward[i] !== null && node.forward[i].key < key) {
        node = node.forward[i];
      }
    }
    const nxt = node.forward[0];
    return nxt !== null && nxt.key === key;
  }

  delete(key) {
    const top = this.head.forward.length - 1;
    const update = new Array(top + 1).fill(null);
    let node = this.head;
    for (let i = top; i >= 0; i--) {
      while (node.forward[i] !== null && node.forward[i].key < key) {
        node = node.forward[i];
      }
      update[i] = node;
    }

    const target = node.forward[0];
    if (target === null || target.key !== key) return false;

    for (let i = 0; i < target.forward.length; i++) {
      if (update[i].forward[i] === target) {
        update[i].forward[i] = target.forward[i];
      }
    }
    return true;
  }

  levels() {
    const result = [];
    for (let i = 0; i < this.head.forward.length; i++) {
      const keys = [];
      let node = this.head.forward[i];
      while (node !== null) {
        keys.push(node.key);
        node = node.forward[i];
      }
      if (keys.length === 0) break;
      result.push(keys);
    }
    return result;
  }
}

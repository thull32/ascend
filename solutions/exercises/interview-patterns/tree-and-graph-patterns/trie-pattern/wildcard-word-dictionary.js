class DictNode {
  constructor() {
    this.children = new Map();
    this.end = false;
  }
}

class WordDictionary {
  constructor() {
    this.root = new DictNode();
  }

  add_word(word) {
    let node = this.root;
    for (const ch of word) {
      if (!node.children.has(ch)) node.children.set(ch, new DictNode());
      node = node.children.get(ch);
    }
    node.end = true;
  }

  search(pattern) {
    const dfs = (node, i) => {
      if (i === pattern.length) return node.end;
      const ch = pattern[i];
      if (ch === ".") {
        for (const child of node.children.values()) {
          if (dfs(child, i + 1)) return true;
        }
        return false;
      }
      const child = node.children.get(ch);
      if (!child) return false;
      return dfs(child, i + 1);
    };

    return dfs(this.root, 0);
  }
}

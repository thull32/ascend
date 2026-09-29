class TrieNode {
  constructor() {
    this.children = new Map();
    this.count = 0;
    this.end = false;
  }
}

class Trie {
  constructor() {
    this.root = new TrieNode();
  }

  insert(word) {
    let node = this.root;
    node.count += 1;
    for (const ch of word) {
      if (!node.children.has(ch)) node.children.set(ch, new TrieNode());
      node = node.children.get(ch);
      node.count += 1;
    }
    node.end = true;
  }

  count_prefix(prefix) {
    let node = this.root;
    for (const ch of prefix) {
      if (!node.children.has(ch)) return 0;
      node = node.children.get(ch);
    }
    return node.count;
  }

  search(word) {
    let node = this.root;
    for (const ch of word) {
      if (!node.children.has(ch)) return false;
      node = node.children.get(ch);
    }
    return node.end;
  }
}

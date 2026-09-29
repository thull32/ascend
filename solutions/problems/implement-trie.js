// Standard trie: each node maps characters to children plus an end-of-word flag.
class TrieNode {
  constructor() {
    this.children = new Map();
    this.end = false;
  }
}

class Trie {
  constructor() {
    this.root = new TrieNode();
  }

  insert(word) {
    let node = this.root;
    for (const ch of word) {
      if (!node.children.has(ch)) node.children.set(ch, new TrieNode());
      node = node.children.get(ch);
    }
    node.end = true;
  }

  _walk(s) {
    let node = this.root;
    for (const ch of s) {
      node = node.children.get(ch);
      if (node === undefined) return null;
    }
    return node;
  }

  search(word) {
    const node = this._walk(word);
    return node !== null && node !== undefined && node.end;
  }

  starts_with(prefix) {
    return this._walk(prefix) !== null;
  }
}

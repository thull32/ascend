// Trie of nested plain objects; add_word walks/creates one child per
// character, search does a DFS that fans out over every child on '.'.
class WordDictionary {
  constructor() {
    this.root = {};
  }

  add_word(word) {
    let node = this.root;
    for (const ch of word) {
      if (!(ch in node)) node[ch] = {};
      node = node[ch];
    }
    node["$"] = true;
  }

  search(word) {
    const dfs = (node, i) => {
      if (i === word.length) {
        return node["$"] === true;
      }
      const ch = word[i];
      if (ch === ".") {
        for (const key of Object.keys(node)) {
          if (key !== "$" && dfs(node[key], i + 1)) {
            return true;
          }
        }
        return false;
      }
      const child = node[ch];
      return child !== undefined && dfs(child, i + 1);
    };

    return dfs(this.root, 0);
  }
}

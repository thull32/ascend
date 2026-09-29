// Autocomplete: build a trie from a word list, then DFS the prefix's
// subtree in sorted character order so results come out lexicographic
// with no separate sort call.

class Node {
  constructor() {
    this.children = new Map();
    this.end = false;
  }
}

function autocomplete(words, prefix) {
  const root = new Node();
  for (const word of words) {
    let node = root;
    for (const ch of word) {
      if (!node.children.has(ch)) node.children.set(ch, new Node());
      node = node.children.get(ch);
    }
    node.end = true;
  }

  let node = root;
  for (const ch of prefix) {
    node = node.children.get(ch);
    if (node === undefined) return [];
  }

  const out = [];

  function dfs(node, accumulated) {
    if (node.end) out.push(accumulated);
    for (const ch of [...node.children.keys()].sort()) {
      dfs(node.children.get(ch), accumulated + ch);
    }
  }

  dfs(node, prefix);
  return out;
}

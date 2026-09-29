// Build a trie of all target words, then one DFS per cell walking the trie
// alongside the board; pruning a trie branch once it has no children left
// keeps repeated search prefixes cheap.
function find_words(board, words) {
  const root = {};
  for (const w of words) {
    let node = root;
    for (const ch of w) {
      if (!(ch in node)) node[ch] = {};
      node = node[ch];
    }
    node["$"] = w;
  }

  const rows = board.length, cols = board[0].length;
  const found = [];

  function dfs(r, c, parent) {
    const ch = board[r][c];
    const node = parent[ch];
    if (node === undefined) return;
    if (node["$"] !== undefined) {
      found.push(node["$"]);
      delete node["$"];
    }
    board[r][c] = "#";
    if (r > 0) dfs(r - 1, c, node);
    if (r + 1 < rows) dfs(r + 1, c, node);
    if (c > 0) dfs(r, c - 1, node);
    if (c + 1 < cols) dfs(r, c + 1, node);
    board[r][c] = ch;
    if (Object.keys(node).length === 0) delete parent[ch];
  }

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      dfs(r, c, root);
    }
  }
  return found;
}

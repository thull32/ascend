// DFS/backtrack from every cell, marking the current path visited so the
// same cell isn't reused within one attempt.
function exist(board, word) {
  const rows = board.length, cols = board[0].length;

  function dfs(r, c, i) {
    if (board[r][c] !== word[i]) return false;
    if (i === word.length - 1) return true;
    const saved = board[r][c];
    board[r][c] = "#";
    const found =
      (r > 0 && dfs(r - 1, c, i + 1)) ||
      (r + 1 < rows && dfs(r + 1, c, i + 1)) ||
      (c > 0 && dfs(r, c - 1, i + 1)) ||
      (c + 1 < cols && dfs(r, c + 1, i + 1));
    board[r][c] = saved;
    return found;
  }

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (dfs(r, c, 0)) return true;
    }
  }
  return false;
}

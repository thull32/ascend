// Mark every 'O' reachable from a border as safe ('#') via flood fill, then
// capture whatever 'O' remains and restore the safe marks.
function capture_regions(board) {
  if (!board || !board[0]) return board;
  const rows = board.length, cols = board[0].length;

  function markSafe(r0, c0) {
    if (board[r0][c0] !== "O") return;
    board[r0][c0] = "#";
    const stack = [[r0, c0]];
    while (stack.length) {
      const [r, c] = stack.pop();
      for (const [nr, nc] of [[r + 1, c], [r - 1, c], [r, c + 1], [r, c - 1]]) {
        if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && board[nr][nc] === "O") {
          board[nr][nc] = "#";
          stack.push([nr, nc]);
        }
      }
    }
  }

  for (let r = 0; r < rows; r++) {
    markSafe(r, 0);
    markSafe(r, cols - 1);
  }
  for (let c = 0; c < cols; c++) {
    markSafe(0, c);
    markSafe(rows - 1, c);
  }

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (board[r][c] === "O") board[r][c] = "X";
      else if (board[r][c] === "#") board[r][c] = "O";
    }
  }
  return board;
}

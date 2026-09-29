// A single seen-set keyed by (kind, index, digit) catches any row, column,
// or box duplicate.
function is_valid_sudoku(board) {
  const seen = new Set();
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const d = board[r][c];
      if (d === ".") continue;
      const box = Math.floor(r / 3) * 3 + Math.floor(c / 3);
      const keys = [`row,${r},${d}`, `col,${c},${d}`, `box,${box},${d}`];
      for (const key of keys) {
        if (seen.has(key)) return false;
        seen.add(key);
      }
    }
  }
  return true;
}

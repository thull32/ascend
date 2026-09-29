// Backtrack with row/col/box constraint sets, always filling the
// most-constrained empty cell first (fewest candidates) to prune early.
function solve_sudoku(board) {
  const digits = new Set(["1", "2", "3", "4", "5", "6", "7", "8", "9"]);
  const rows = Array.from({ length: 9 }, () => new Set());
  const cols = Array.from({ length: 9 }, () => new Set());
  const boxes = Array.from({ length: 9 }, () => new Set());
  let empties = [];
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const v = board[r][c];
      if (v === ".") {
        empties.push([r, c]);
      } else {
        rows[r].add(v);
        cols[c].add(v);
        boxes[Math.floor(r / 3) * 3 + Math.floor(c / 3)].add(v);
      }
    }
  }

  function candidates(r, c) {
    const box = Math.floor(r / 3) * 3 + Math.floor(c / 3);
    const out = [];
    for (const d of digits) {
      if (!rows[r].has(d) && !cols[c].has(d) && !boxes[box].has(d)) out.push(d);
    }
    return out;
  }

  function solve() {
    if (empties.length === 0) return true;
    // Most-constrained cell first.
    let idx = 0;
    let best = Infinity;
    for (let i = 0; i < empties.length; i++) {
      const [r, c] = empties[i];
      const n = candidates(r, c).length;
      if (n < best) {
        best = n;
        idx = i;
      }
    }
    const [r, c] = empties[idx];
    const options = candidates(r, c).sort();
    if (options.length === 0) return false;
    empties[idx] = empties[empties.length - 1];
    empties.pop();
    const b = Math.floor(r / 3) * 3 + Math.floor(c / 3);
    for (const v of options) {
      board[r][c] = v;
      rows[r].add(v);
      cols[c].add(v);
      boxes[b].add(v);
      if (solve()) return true;
      rows[r].delete(v);
      cols[c].delete(v);
      boxes[b].delete(v);
    }
    board[r][c] = ".";
    empties.push([r, c]);
    [empties[idx], empties[empties.length - 1]] = [empties[empties.length - 1], empties[idx]];
    return false;
  }

  solve();
  return board;
}

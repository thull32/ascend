// N-Queens: backtracking, one queen per row, three sets track column/diagonal/anti-diagonal conflicts.
function solve_n_queens(n) {
  const result = [];
  const cols = new Set();
  const diag = new Set(); // r - c
  const anti = new Set(); // r + c
  const placement = [];

  function backtrack(r) {
    if (r === n) {
      result.push(
        placement.map((c) => ".".repeat(c) + "Q" + ".".repeat(n - c - 1))
      );
      return;
    }
    for (let c = 0; c < n; c++) {
      if (cols.has(c) || diag.has(r - c) || anti.has(r + c)) {
        continue;
      }
      cols.add(c);
      diag.add(r - c);
      anti.add(r + c);
      placement.push(c);
      backtrack(r + 1);
      placement.pop();
      cols.delete(c);
      diag.delete(r - c);
      anti.delete(r + c);
    }
  }

  backtrack(0);
  return result;
}

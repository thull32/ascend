// Palindrome Partitioning: precompute an O(n^2) palindrome table, then backtrack over cuts.
function partition(s) {
  const n = s.length;
  const pal = Array.from({ length: n }, () => new Array(n).fill(false));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = i; j < n; j++) {
      pal[i][j] = s[i] === s[j] && (j - i < 2 || pal[i + 1][j - 1]);
    }
  }

  const result = [];
  const path = [];

  function backtrack(start) {
    if (start === n) {
      result.push([...path]);
      return;
    }
    for (let j = start; j < n; j++) {
      if (pal[start][j]) {
        path.push(s.slice(start, j + 1));
        backtrack(j + 1);
        path.pop();
      }
    }
  }

  backtrack(0);
  return result;
}

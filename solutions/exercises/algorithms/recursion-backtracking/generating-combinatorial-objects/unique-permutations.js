function permute_unique(nums) {
  const sorted = [...nums].sort((a, b) => a - b);
  const n = sorted.length;
  const result = [];
  const path = [];
  const used = new Array(n).fill(false);

  function backtrack() {
    if (path.length === n) {
      result.push([...path]);
      return;
    }
    for (let i = 0; i < n; i++) {
      if (used[i]) continue;
      if (i > 0 && sorted[i] === sorted[i - 1] && !used[i - 1]) continue;
      used[i] = true;
      path.push(sorted[i]);
      backtrack();
      path.pop();
      used[i] = false;
    }
  }

  backtrack();
  return result;
}

function count_inversions(nums) {
  const n = nums.length;
  if (n === 0) return 0;

  const sortedVals = [...new Set(nums)].sort((a, b) => a - b);
  const rank = new Map();
  sortedVals.forEach((v, i) => rank.set(v, i + 1));
  const m = sortedVals.length;
  const tree = new Array(m + 1).fill(0);

  function add(i, delta) {
    while (i <= m) {
      tree[i] += delta;
      i += i & -i;
    }
  }

  function prefix(i) {
    let s = 0;
    while (i > 0) {
      s += tree[i];
      i -= i & -i;
    }
    return s;
  }

  let inversions = 0;
  let seen = 0;
  for (const x of nums) {
    const r = rank.get(x);
    inversions += seen - prefix(r);
    add(r, 1);
    seen += 1;
  }
  return inversions;
}

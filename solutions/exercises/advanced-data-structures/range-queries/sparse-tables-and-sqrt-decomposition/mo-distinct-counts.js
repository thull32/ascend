function distinct_in_ranges(nums, queries) {
  const n = nums.length;
  const q = queries.length;
  if (q === 0) return [];

  const b = Math.max(1, Math.floor(Math.sqrt(n)));
  const order = [...Array(q).keys()].sort((i, j) => {
    const bi = Math.floor(queries[i][0] / b);
    const bj = Math.floor(queries[j][0] / b);
    if (bi !== bj) return bi - bj;
    return queries[i][1] - queries[j][1];
  });

  const answers = new Array(q).fill(0);
  const counts = new Map();
  let distinct = 0;
  let curL = 0;
  let curR = -1;

  function add(pos) {
    const v = nums[pos];
    const c = (counts.get(v) || 0) + 1;
    counts.set(v, c);
    if (c === 1) distinct += 1;
  }

  function remove(pos) {
    const v = nums[pos];
    const c = counts.get(v) - 1;
    counts.set(v, c);
    if (c === 0) distinct -= 1;
  }

  for (const idx of order) {
    const [l, r] = queries[idx];
    while (curR < r) {
      curR += 1;
      add(curR);
    }
    while (curL > l) {
      curL -= 1;
      add(curL);
    }
    while (curR > r) {
      remove(curR);
      curR -= 1;
    }
    while (curL < l) {
      remove(curL);
      curL += 1;
    }
    answers[idx] = distinct;
  }

  return answers;
}

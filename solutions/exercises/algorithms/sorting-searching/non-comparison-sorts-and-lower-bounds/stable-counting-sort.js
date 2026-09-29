function counting_sort(nums, k) {
  const counts = new Array(k + 1).fill(0);
  for (const x of nums) counts[x]++;

  const starts = new Array(k + 1).fill(0);
  let total = 0;
  for (let v = 0; v <= k; v++) {
    starts[v] = total;
    total += counts[v];
  }

  const result = new Array(nums.length).fill(0);
  for (const x of nums) {
    result[starts[x]] = x;
    starts[x]++;
  }
  return result;
}

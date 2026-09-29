function radix_sort(nums) {
  if (nums.length === 0) return [];
  let result = [...nums];
  let exp = 1;
  while (Math.floor(Math.max(...result) / exp) > 0) {
    const buckets = Array.from({ length: 10 }, () => []);
    for (const x of result) {
      const digit = Math.floor(x / exp) % 10;
      buckets[digit].push(x);
    }
    result = buckets.flat();
    exp *= 10;
  }
  return result;
}

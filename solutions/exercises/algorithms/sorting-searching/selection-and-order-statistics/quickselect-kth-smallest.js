function kth_smallest(nums, k) {
  const arr = [...nums];
  const target = k - 1;
  let lo = 0, hi = arr.length - 1;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    [arr[mid], arr[hi]] = [arr[hi], arr[mid]];
    const pivot = arr[hi];
    let i = lo - 1;
    for (let j = lo; j < hi; j++) {
      if (arr[j] <= pivot) {
        i++;
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
    }
    i++;
    [arr[i], arr[hi]] = [arr[hi], arr[i]];
    if (i === target) {
      return arr[i];
    } else if (target < i) {
      hi = i - 1;
    } else {
      lo = i + 1;
    }
  }
  return arr[lo];
}

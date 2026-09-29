function count_inversions(nums) {
  function sortCount(a) {
    if (a.length <= 1) return [a, 0];
    const mid = Math.floor(a.length / 2);
    const [left, leftCount] = sortCount(a.slice(0, mid));
    const [right, rightCount] = sortCount(a.slice(mid));
    const merged = [];
    let i = 0, j = 0;
    let count = leftCount + rightCount;
    while (i < left.length && j < right.length) {
      if (left[i] <= right[j]) {
        merged.push(left[i]);
        i++;
      } else {
        merged.push(right[j]);
        j++;
        count += left.length - i;
      }
    }
    while (i < left.length) merged.push(left[i++]);
    while (j < right.length) merged.push(right[j++]);
    return [merged, count];
  }

  return sortCount(nums)[1];
}

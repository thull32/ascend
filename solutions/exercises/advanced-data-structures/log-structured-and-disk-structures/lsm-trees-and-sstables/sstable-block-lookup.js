function sstable_block(firstKeys, key) {
  let lo = 0;
  let hi = firstKeys.length - 1;
  let answer = -1;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (firstKeys[mid] <= key) {
      answer = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return answer;
}

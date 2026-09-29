// In-place heap sort: bottom-up heapify to a max-heap (O(n)), then
// repeated root-to-end swap plus sift-down to extract in ascending order.
function heap_sort(values) {
  const a = values.slice();
  const n = a.length;

  function sift_down(i, end) {
    for (;;) {
      const left = 2 * i + 1, right = 2 * i + 2;
      let largest = i;
      if (left < end && a[left] > a[largest]) largest = left;
      if (right < end && a[right] > a[largest]) largest = right;
      if (largest === i) break;
      [a[i], a[largest]] = [a[largest], a[i]];
      i = largest;
    }
  }

  for (let i = Math.floor(n / 2) - 1; i >= 0; i--) {
    sift_down(i, n);
  }

  for (let end = n - 1; end > 0; end--) {
    [a[0], a[end]] = [a[end], a[0]];
    sift_down(0, end);
  }

  return a;
}

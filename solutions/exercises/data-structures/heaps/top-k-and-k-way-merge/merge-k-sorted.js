// Merge k sorted lists with a heap holding at most one candidate per list:
// seed with each list's head, then repeatedly pop the smallest and push
// its list's next element.
function merge_k_sorted(lists) {
  const heap = []; // entries [value, listIndex, position]
  function less(a, b) {
    if (a[0] !== b[0]) return a[0] < b[0];
    if (a[1] !== b[1]) return a[1] < b[1];
    return a[2] < b[2];
  }
  function push(entry) {
    heap.push(entry);
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!less(heap[i], heap[p])) break;
      [heap[p], heap[i]] = [heap[i], heap[p]];
      i = p;
    }
  }
  function pop() {
    const top = heap[0];
    const last = heap.pop();
    if (heap.length > 0) {
      heap[0] = last;
      let i = 0;
      const m = heap.length;
      for (;;) {
        const l = 2 * i + 1, r = 2 * i + 2;
        let s = i;
        if (l < m && less(heap[l], heap[s])) s = l;
        if (r < m && less(heap[r], heap[s])) s = r;
        if (s === i) break;
        [heap[i], heap[s]] = [heap[s], heap[i]];
        i = s;
      }
    }
    return top;
  }

  for (let i = 0; i < lists.length; i++) {
    if (lists[i].length > 0) push([lists[i][0], i, 0]);
  }

  const out = [];
  while (heap.length > 0) {
    const entry = pop();
    const value = entry[0], i = entry[1], j = entry[2];
    out.push(value);
    if (j + 1 < lists[i].length) push([lists[i][j + 1], i, j + 1]);
  }
  return out;
}

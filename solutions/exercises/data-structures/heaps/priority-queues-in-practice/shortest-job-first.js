// Shortest-job-first, non-preemptive: process arrivals in order, keep a
// min-heap of [duration, arrival, index] among arrived-but-unstarted tasks,
// and jump the clock to the next arrival whenever the heap runs dry.
function sjf_order(tasks) {
  const n = tasks.length;
  const order = [];
  const idxSorted = tasks.map((_, i) => i).sort((a, b) => {
    if (tasks[a][0] !== tasks[b][0]) return tasks[a][0] - tasks[b][0];
    return a - b;
  });

  const heap = []; // entries [duration, arrival, index]
  function less(x, y) {
    if (x[0] !== y[0]) return x[0] < y[0];
    if (x[1] !== y[1]) return x[1] < y[1];
    return x[2] < y[2];
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

  let time = 0;
  let j = 0;
  while (j < n || heap.length > 0) {
    while (j < n && tasks[idxSorted[j]][0] <= time) {
      const i = idxSorted[j];
      const [arrival, duration] = tasks[i];
      push([duration, arrival, i]);
      j++;
    }
    if (heap.length === 0) {
      time = tasks[idxSorted[j]][0];
      continue;
    }
    const entry = pop();
    const duration = entry[0], i = entry[2];
    order.push(i);
    time += duration;
  }
  return order;
}

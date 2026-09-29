function schedule_jobs(jobs) {
  const n = jobs.length;
  const order = Array.from({ length: n }, (_, i) => i).sort(
    (a, b) => jobs[a][0] - jobs[b][0]
  );
  const heap = []; // kept sorted by [duration, index]
  const result = [];
  let clock = 0;
  let ptr = 0;

  function heapPush(item) {
    heap.push(item);
    heap.sort((x, y) => x[0] - y[0] || x[1] - y[1]);
  }

  while (ptr < n || heap.length > 0) {
    if (heap.length === 0 && ptr < n && jobs[order[ptr]][0] > clock) {
      clock = jobs[order[ptr]][0];
    }
    while (ptr < n && jobs[order[ptr]][0] <= clock) {
      const i = order[ptr];
      heapPush([jobs[i][1], i]);
      ptr += 1;
    }
    const [duration, i] = heap.shift();
    result.push(i);
    clock += duration;
  }

  return result;
}

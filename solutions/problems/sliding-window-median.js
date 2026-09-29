// Two heaps (small = max-heap via negation, large = min-heap) with lazy
// deletion: removing an out-of-window value just marks it delayed and the
// heaps get pruned lazily whenever that value would surface at the top.
function heappush(heap, x) {
  heap.push(x);
  let i = heap.length - 1;
  while (i > 0) {
    const p = (i - 1) >> 1;
    if (heap[i] < heap[p]) {
      [heap[i], heap[p]] = [heap[p], heap[i]];
      i = p;
    } else break;
  }
}
function heappop(heap) {
  const top = heap[0];
  const last = heap.pop();
  if (heap.length) {
    heap[0] = last;
    let i = 0;
    while (true) {
      const l = 2 * i + 1, r = 2 * i + 2;
      let s = i;
      if (l < heap.length && heap[l] < heap[s]) s = l;
      if (r < heap.length && heap[r] < heap[s]) s = r;
      if (s === i) break;
      [heap[i], heap[s]] = [heap[s], heap[i]];
      i = s;
    }
  }
  return top;
}

function median_sliding_window(nums, k) {
  const small = []; // max-heap via negation
  const large = []; // min-heap
  const delayed = new Map();
  const sizes = [0, 0]; // live counts for small, large

  function getDelayed(x) {
    return delayed.get(x) || 0;
  }

  function prune(heap, isLarge) {
    while (heap.length) {
      const x = isLarge ? heap[0] : -heap[0];
      if (getDelayed(x)) {
        delayed.set(x, getDelayed(x) - 1);
        heappop(heap);
      } else break;
    }
  }

  function rebalance() {
    if (sizes[0] > sizes[1] + 1) {
      heappush(large, -heappop(small));
      sizes[0] -= 1;
      sizes[1] += 1;
      prune(small, false);
    } else if (sizes[0] < sizes[1]) {
      heappush(small, -heappop(large));
      sizes[1] -= 1;
      sizes[0] += 1;
      prune(large, true);
    }
  }

  function add(x) {
    if (small.length === 0 || x <= -small[0]) {
      heappush(small, -x);
      sizes[0] += 1;
    } else {
      heappush(large, x);
      sizes[1] += 1;
    }
    rebalance();
  }

  function remove(x) {
    delayed.set(x, getDelayed(x) + 1);
    if (x <= -small[0]) {
      sizes[0] -= 1;
      if (x === -small[0]) prune(small, false);
    } else {
      sizes[1] -= 1;
      if (x === large[0]) prune(large, true);
    }
    rebalance();
  }

  function median() {
    if (k % 2) return -small[0];
    return (-small[0] + large[0]) / 2;
  }

  const out = [];
  for (let i = 0; i < nums.length; i++) {
    add(nums[i]);
    if (i >= k) remove(nums[i - k]);
    if (i >= k - 1) out.push(median());
  }
  return out;
}

class MaxHeap {
  constructor() { this.a = []; }
  push(x) {
    const a = this.a;
    a.push(x);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p][0] >= a[i][0]) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop() {
    const a = this.a;
    const top = a[0];
    const last = a.pop();
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        let l = 2 * i + 1, r = l + 1, m = i;
        if (l < a.length && a[l][0] > a[m][0]) m = l;
        if (r < a.length && a[r][0] > a[m][0]) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top;
  }
  peek() { return this.a[0]; }
  get size() { return this.a.length; }
}

function skyline(buildings) {
  if (buildings.length === 0) return [];

  const events = [];
  for (const [l, r, h] of buildings) {
    events.push([l, -h, r]);
    events.push([r, 0, 0]);
  }
  events.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);

  const heap = new MaxHeap();
  heap.push([0, Infinity]);
  const result = [];
  let i = 0;
  const n = events.length;
  while (i < n) {
    const x = events[i][0];
    while (i < n && events[i][0] === x) {
      const negH = events[i][1], r = events[i][2];
      if (negH !== 0) heap.push([-negH, r]);
      i++;
    }
    while (heap.peek()[1] <= x) heap.pop();
    const curHeight = heap.peek()[0];
    if (result.length === 0 || result[result.length - 1][1] !== curHeight) {
      result.push([x, curHeight]);
    }
  }
  return result;
}

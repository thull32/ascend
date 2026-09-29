function shortest_subarray_at_least(nums, k) {
  const n = nums.length;
  const P = new Array(n + 1).fill(0);
  for (let i = 0; i < n; i++) P[i + 1] = P[i] + nums[i];

  const dq = []; // indices into P, P values increasing front to back
  let head = 0;  // logical front index into dq; avoids Array.shift
  let best = n + 1;
  for (let j = 0; j <= n; j++) {
    while (dq.length > head && P[j] - P[dq[head]] >= k) {
      best = Math.min(best, j - dq[head]);
      head++;
    }
    while (dq.length > head && P[dq[dq.length - 1]] >= P[j]) {
      dq.pop();
    }
    dq.push(j);
  }
  return best <= n ? best : -1;
}

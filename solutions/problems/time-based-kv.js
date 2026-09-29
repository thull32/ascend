// Timestamps arrive strictly increasing per key, so store them in parallel
// arrays and binary search for the rightmost timestamp <= the query.
function rightmost_le(times, t) {
  let lo = 0, hi = times.length - 1;
  let answer = -1;
  while (lo <= hi) {
    const mid = lo + Math.floor((hi - lo) / 2);
    if (times[mid] <= t) {
      answer = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return answer;
}

class TimeMap {
  constructor() {
    this.times = new Map();
    this.values = new Map();
  }

  set(key, value, timestamp) {
    if (!this.times.has(key)) {
      this.times.set(key, []);
      this.values.set(key, []);
    }
    this.times.get(key).push(timestamp);
    this.values.get(key).push(value);
  }

  get(key, timestamp) {
    if (!this.times.has(key)) return "";
    const times = this.times.get(key);
    const i = rightmost_le(times, timestamp);
    return i >= 0 ? this.values.get(key)[i] : "";
  }
}

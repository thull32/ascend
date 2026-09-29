class TimeMap {
  constructor() {
    this.store = new Map();   // key -> array of [timestamp, value]
  }
  set(key, value, timestamp) {
    if (!this.store.has(key)) this.store.set(key, []);
    this.store.get(key).push([timestamp, value]);
  }
  get(key, timestamp) {
    const arr = this.store.get(key);
    if (!arr || arr.length === 0) return "";
    let lo = 0, hi = arr.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (arr[mid][0] <= timestamp) lo = mid + 1;
      else hi = mid;
    }
    return lo > 0 ? arr[lo - 1][1] : "";
  }
}

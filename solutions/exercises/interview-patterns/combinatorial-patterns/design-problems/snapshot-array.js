class SnapshotArray {
  constructor(length) {
    this.snapIds = Array.from({ length }, () => [0]);
    this.values = Array.from({ length }, () => [0]);
    this.snapId = 0;
  }

  set(index, val) {
    const ids = this.snapIds[index];
    const vals = this.values[index];
    if (ids[ids.length - 1] === this.snapId) {
      vals[vals.length - 1] = val;
    } else {
      ids.push(this.snapId);
      vals.push(val);
    }
  }

  snap() {
    const current = this.snapId;
    this.snapId += 1;
    return current;
  }

  get(index, snap_id) {
    const ids = this.snapIds[index];
    let lo = 0, hi = ids.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (ids[mid] <= snap_id) lo = mid + 1;
      else hi = mid;
    }
    return this.values[index][lo - 1];
  }
}

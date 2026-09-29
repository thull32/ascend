class LSMStore {
  constructor() {
    this.memtable = new Map(); // key -> value or null (tombstone)
    this._runs = []; // list of runs; each run is a sorted array of [key, value]
  }

  put(key, value) {
    this.memtable.set(key, value);
    return null;
  }

  delete(key) {
    this.memtable.set(key, null);
    return null;
  }

  get(key) {
    if (this.memtable.has(key)) return this.memtable.get(key);
    for (let i = this._runs.length - 1; i >= 0; i--) {
      for (const [k, v] of this._runs[i]) {
        if (k === key) return v;
      }
    }
    return null;
  }

  flush() {
    if (this.memtable.size > 0) {
      const run = [...this.memtable.entries()]
        .map(([k, v]) => [k, v])
        .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
      this._runs.push(run);
      this.memtable = new Map();
    }
    return this._runs.length;
  }

  compact() {
    const merged = new Map();
    for (const run of this._runs) {
      for (const [k, v] of run) merged.set(k, v);
    }
    const liveKeys = [...merged.keys()].filter((k) => merged.get(k) !== null).sort();
    const newRun = liveKeys.map((k) => [k, merged.get(k)]);
    this._runs = newRun.length > 0 ? [newRun] : [];
    return liveKeys.length;
  }

  runs() {
    return this._runs;
  }
}

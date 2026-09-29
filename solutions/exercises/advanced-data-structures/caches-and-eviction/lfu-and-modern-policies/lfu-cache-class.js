class LFUCache {
  constructor() {
    this.capacity = 0;
    this.values = new Map(); // key -> value
    this.freq = new Map(); // key -> frequency
    this.buckets = new Map(); // frequency -> Map of keys (insertion order = LRU order)
    this.minFreq = 0;
  }

  set_capacity(capacity) {
    this.capacity = capacity;
  }

  _promote(key) {
    const f = this.freq.get(key);
    const bucket = this.buckets.get(f);
    bucket.delete(key);
    if (bucket.size === 0) {
      this.buckets.delete(f);
      if (this.minFreq === f) this.minFreq = f + 1;
    }
    const newF = f + 1;
    this.freq.set(key, newF);
    if (!this.buckets.has(newF)) this.buckets.set(newF, new Map());
    this.buckets.get(newF).set(key, true);
  }

  get(key) {
    if (!this.values.has(key)) return -1;
    this._promote(key);
    return this.values.get(key);
  }

  put(key, value) {
    if (this.capacity <= 0) return;

    if (this.values.has(key)) {
      this.values.set(key, value);
      this._promote(key);
      return;
    }

    if (this.values.size >= this.capacity) {
      const bucket = this.buckets.get(this.minFreq);
      const evictKey = bucket.keys().next().value;
      bucket.delete(evictKey);
      if (bucket.size === 0) this.buckets.delete(this.minFreq);
      this.values.delete(evictKey);
      this.freq.delete(evictKey);
    }

    this.values.set(key, value);
    this.freq.set(key, 1);
    if (!this.buckets.has(1)) this.buckets.set(1, new Map());
    this.buckets.get(1).set(key, true);
    this.minFreq = 1;
  }
}

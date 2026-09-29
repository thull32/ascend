class LFUCache {
  constructor(capacity) {
    this.capacity = capacity;
    this.minCount = 0;
    this.keyVal = new Map();
    this.keyCount = new Map();
    this.countKeys = new Map(); // count -> Map(key -> true), insertion order preserved
  }

  _bucket(count) {
    if (!this.countKeys.has(count)) this.countKeys.set(count, new Map());
    return this.countKeys.get(count);
  }

  _touch(key) {
    const count = this.keyCount.get(key);
    const bucket = this._bucket(count);
    bucket.delete(key);
    if (bucket.size === 0 && this.minCount === count) {
      this.minCount += 1;
    }
    const newCount = count + 1;
    this.keyCount.set(key, newCount);
    this._bucket(newCount).set(key, true);
  }

  get(key) {
    if (!this.keyVal.has(key)) return -1;
    const value = this.keyVal.get(key);
    this._touch(key);
    return value;
  }

  put(key, value) {
    if (this.capacity <= 0) return;
    if (this.keyVal.has(key)) {
      this.keyVal.set(key, value);
      this._touch(key);
      return;
    }

    if (this.keyVal.size >= this.capacity) {
      const bucket = this._bucket(this.minCount);
      const oldestKey = bucket.keys().next().value;
      bucket.delete(oldestKey);
      this.keyVal.delete(oldestKey);
      this.keyCount.delete(oldestKey);
    }

    this.keyVal.set(key, value);
    this.keyCount.set(key, 1);
    this._bucket(1).set(key, true);
    this.minCount = 1;
  }
}

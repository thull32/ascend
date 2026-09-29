class WeightedLRU {
  constructor() {
    this.capacity = 0;
    this.weight = 0;
    this.entries = new Map(); // key -> {value, weight}, LRU first
  }

  set_capacity(capacity) {
    this.capacity = capacity;
  }

  _remove(key) {
    if (this.entries.has(key)) {
      const { weight } = this.entries.get(key);
      this.entries.delete(key);
      this.weight -= weight;
    }
  }

  put(key, value, weight) {
    this._remove(key);

    if (weight > this.capacity) {
      return false;
    }

    while (this.weight + weight > this.capacity) {
      const oldestKey = this.entries.keys().next().value;
      const oldest = this.entries.get(oldestKey);
      this.entries.delete(oldestKey);
      this.weight -= oldest.weight;
    }

    this.entries.set(key, { value, weight });
    this.weight += weight;
    return true;
  }

  get(key) {
    if (!this.entries.has(key)) return -1;
    const entry = this.entries.get(key);
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.value;
  }

  total_weight() {
    return this.weight;
  }

  keys() {
    return [...this.entries.keys()];
  }
}

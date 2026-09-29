// Array of chained buckets keyed by key % capacity, with a load-factor
// resize (double capacity and re-insert once size exceeds 0.75 * capacity).
class MyHashMap {
  constructor() {
    this.capacity = 16;
    this.size = 0;
    this.buckets = Array.from({ length: this.capacity }, () => []);
  }

  _index(key) {
    return key % this.capacity;
  }

  put(key, value) {
    const bucket = this.buckets[this._index(key)];
    for (const pair of bucket) {
      if (pair[0] === key) {
        pair[1] = value;
        return;
      }
    }
    bucket.push([key, value]);
    this.size += 1;
    if (this.size > Math.floor((this.capacity * 3) / 4)) {
      this._resize();
    }
  }

  get(key) {
    const bucket = this.buckets[this._index(key)];
    for (const [k, v] of bucket) {
      if (k === key) return v;
    }
    return -1;
  }

  remove(key) {
    const bucket = this.buckets[this._index(key)];
    for (let i = 0; i < bucket.length; i++) {
      if (bucket[i][0] === key) {
        bucket[i] = bucket[bucket.length - 1];
        bucket.pop();
        this.size -= 1;
        return;
      }
    }
  }

  _resize() {
    const old = this.buckets;
    this.capacity *= 2;
    this.buckets = Array.from({ length: this.capacity }, () => []);
    for (const bucket of old) {
      for (const [key, value] of bucket) {
        this.buckets[this._index(key)].push([key, value]);
      }
    }
  }
}

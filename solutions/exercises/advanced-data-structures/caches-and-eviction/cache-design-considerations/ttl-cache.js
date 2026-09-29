class TTLCache {
  constructor() {
    this.entries = new Map(); // key -> {value, expiry}
  }

  put(key, value, now, ttl) {
    this.entries.set(key, { value, expiry: now + ttl });
  }

  get(key, now) {
    if (!this.entries.has(key)) return null;
    const { value, expiry } = this.entries.get(key);
    if (now < expiry) return value;
    this.entries.delete(key);
    return null;
  }

  size(now) {
    for (const [k, { expiry }] of this.entries) {
      if (now >= expiry) this.entries.delete(k);
    }
    return this.entries.size;
  }
}

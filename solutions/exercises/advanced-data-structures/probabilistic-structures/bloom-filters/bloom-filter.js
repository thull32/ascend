function fnv1a(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

function djb2(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(h, 33) + s.charCodeAt(i)) >>> 0;
  }
  return h;
}

class BloomFilter {
  constructor() {
    this.M = 64;
    this.K = 3;
    this.bits = new Array(this.M).fill(0);
  }

  _positions(key) {
    const h1 = fnv1a(key);
    const h2 = djb2(key);
    const out = [];
    for (let i = 0; i < this.K; i++) {
      out.push((h1 + i * h2) % this.M);
    }
    return out;
  }

  add(key) {
    for (const p of this._positions(key)) this.bits[p] = 1;
  }

  might_contain(key) {
    return this._positions(key).every((p) => this.bits[p] === 1);
  }

  bits_set() {
    return this.bits.reduce((a, b) => a + b, 0);
  }
}

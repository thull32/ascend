function hash32(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b) >>> 0;
  h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

class BloomFilter {
  constructor() {
    this.M = 64;
    this.K = 3;
    this.bits = new Array(this.M).fill(false);
  }
  _indices(item) {
    const idxs = [];
    for (let i = 0; i < this.K; i++) idxs.push(hash32(`${i}:${item}`) % this.M);
    return idxs;
  }
  add(item) {
    for (const idx of this._indices(item)) this.bits[idx] = true;
  }
  might_contain(item) {
    return this._indices(item).every((idx) => this.bits[idx]);
  }
}

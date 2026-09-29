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

class CountMinSketch {
  constructor() {
    this.D = 3;
    this.W = 16;
    this.table = Array.from({ length: this.D }, () => new Array(this.W).fill(0));
  }

  _cols(key) {
    const h1 = fnv1a(key);
    const h2 = djb2(key);
    const out = [];
    for (let i = 0; i < this.D; i++) out.push((h1 + i * h2) % this.W);
    return out;
  }

  add(key, count) {
    const cols = this._cols(key);
    for (let row = 0; row < this.D; row++) {
      this.table[row][cols[row]] += count;
    }
  }

  estimate(key) {
    const cols = this._cols(key);
    let m = Infinity;
    for (let row = 0; row < this.D; row++) {
      m = Math.min(m, this.table[row][cols[row]]);
    }
    return m;
  }
}

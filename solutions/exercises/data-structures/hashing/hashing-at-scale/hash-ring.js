function hash32(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b) >>> 0;
  h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

class HashRing {
  constructor() {
    this.VNODES = 3;
    this.points = [];          // sorted array of [position, node]
  }
  add(node) {
    for (let i = 0; i < this.VNODES; i++) {
      const pos = hash32(`${node}#${i}`);
      let lo = 0, hi = this.points.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (this.points[mid][0] < pos) lo = mid + 1;
        else hi = mid;
      }
      this.points.splice(lo, 0, [pos, node]);
    }
  }
  remove(node) {
    this.points = this.points.filter((p) => p[1] !== node);
  }
  get(key) {
    if (this.points.length === 0) return null;
    const h = hash32(key);
    let lo = 0, hi = this.points.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.points[mid][0] < h) lo = mid + 1;
      else hi = mid;
    }
    if (lo === this.points.length) lo = 0;
    return this.points[lo][1];
  }
}

// Count points by coordinate; for every stored point as a diagonal corner of
// an axis-aligned square with the query point, multiply the counts of the
// two other corners.
class DetectSquares {
  constructor() {
    this.counts = new Map(); // "x,y" -> count
  }

  _key(x, y) {
    return x + "," + y;
  }

  add(point) {
    const k = this._key(point[0], point[1]);
    this.counts.set(k, (this.counts.get(k) || 0) + 1);
  }

  count(point) {
    const [x, y] = point;
    let total = 0;
    for (const [key, diag] of this.counts) {
      const [x2, y2] = key.split(",").map(Number);
      if (x2 === x || Math.abs(x2 - x) !== Math.abs(y2 - y)) continue;
      const c1 = this.counts.get(this._key(x, y2)) || 0;
      const c2 = this.counts.get(this._key(x2, y)) || 0;
      total += diag * c1 * c2;
    }
    return total;
  }
}

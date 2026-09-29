class DynamicArray {
  constructor() {
    this._cap = 2;
    this._len = 0;
    this._data = new Array(this._cap).fill(null); // fixed block; replace it to grow
  }
  push(x) {
    if (this._len === this._cap) {
      const newCap = this._cap * 2;
      const newData = new Array(newCap).fill(null);
      for (let i = 0; i < this._len; i++) {
        newData[i] = this._data[i];
      }
      this._data = newData;
      this._cap = newCap;
    }
    this._data[this._len] = x;
    this._len += 1;
  }
  pop() {
    if (this._len === 0) return null;
    this._len -= 1;
    const x = this._data[this._len];
    this._data[this._len] = null;
    return x;
  }
  get(i) { return this._data[i]; }
  size() { return this._len; }
  capacity() { return this._cap; }
}

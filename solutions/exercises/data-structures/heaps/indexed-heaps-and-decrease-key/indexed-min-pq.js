// Indexed min-priority queue: a plain binary heap of keys plus a position
// map updated on every swap, so decrease-key can sift up from the key's
// current index in O(log n) instead of scanning the array.
class IndexedMinPQ {
  constructor() {
    this.keys = [];           // heap array of keys
    this.pri = new Map();     // key -> priority
    this.pos = new Map();     // key -> index in this.keys
  }
  _swap(i, j) {
    const keys = this.keys;
    [keys[i], keys[j]] = [keys[j], keys[i]];
    this.pos.set(keys[i], i);
    this.pos.set(keys[j], j);
  }
  _siftUp(i) {
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.pri.get(this.keys[parent]) <= this.pri.get(this.keys[i])) break;
      this._swap(parent, i);
      i = parent;
    }
  }
  _siftDown(i) {
    const n = this.keys.length;
    for (;;) {
      const left = 2 * i + 1, right = 2 * i + 2;
      let smallest = i;
      if (left < n && this.pri.get(this.keys[left]) < this.pri.get(this.keys[smallest])) smallest = left;
      if (right < n && this.pri.get(this.keys[right]) < this.pri.get(this.keys[smallest])) smallest = right;
      if (smallest === i) break;
      this._swap(i, smallest);
      i = smallest;
    }
  }
  insert(key, priority) {
    this.keys.push(key);
    this.pri.set(key, priority);
    this.pos.set(key, this.keys.length - 1);
    this._siftUp(this.keys.length - 1);
  }
  decrease(key, priority) {
    this.pri.set(key, priority);
    this._siftUp(this.pos.get(key));
  }
  pop() {
    if (this.keys.length === 0) return null;
    const root = this.keys[0];
    const last = this.keys.pop();
    this.pos.delete(root);
    this.pri.delete(root);
    if (this.keys.length > 0) {
      this.keys[0] = last;
      this.pos.set(last, 0);
      this._siftDown(0);
    }
    return root;
  }
  contains(key) { return this.pos.has(key); }
}

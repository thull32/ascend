const TOMBSTONE = Symbol('tombstone');
function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}
class HashTable {
  constructor() {
    this.cap = 8;
    this.slots = new Array(this.cap).fill(null); // null | TOMBSTONE | [key, value]
    this.used = 0;
  }
  _index(key) { return fnv1a(key) % this.cap; }

  _grow() {
    const live = this.slots.filter((s) => s !== null && s !== TOMBSTONE);
    this.cap *= 2;
    this.slots = new Array(this.cap).fill(null);
    this.used = 0;
    for (const [key, value] of live) {
      let idx = this._index(key);
      while (this.slots[idx] !== null) idx = (idx + 1) % this.cap;
      this.slots[idx] = [key, value];
      this.used++;
    }
  }

  set(key, value) {
    let idx = this._index(key);
    let firstTombstone = null;
    for (let i = 0; i < this.cap; i++) {
      const slot = this.slots[idx];
      if (slot === null) {
        if (firstTombstone !== null) {
          this.slots[firstTombstone] = [key, value];
        } else {
          this.slots[idx] = [key, value];
          this.used++;
        }
        if (this.used > Math.floor(this.cap * 5 / 8)) this._grow();
        return;
      }
      if (slot === TOMBSTONE) {
        if (firstTombstone === null) firstTombstone = idx;
      } else if (slot[0] === key) {
        this.slots[idx] = [key, value];
        return;
      }
      idx = (idx + 1) % this.cap;
    }
    if (firstTombstone !== null) {
      this.slots[firstTombstone] = [key, value];
    }
  }

  get(key) {
    let idx = this._index(key);
    for (let i = 0; i < this.cap; i++) {
      const slot = this.slots[idx];
      if (slot === null) return null;
      if (slot !== TOMBSTONE && slot[0] === key) return slot[1];
      idx = (idx + 1) % this.cap;
    }
    return null;
  }

  delete(key) {
    let idx = this._index(key);
    for (let i = 0; i < this.cap; i++) {
      const slot = this.slots[idx];
      if (slot === null) return false;
      if (slot !== TOMBSTONE && slot[0] === key) {
        this.slots[idx] = TOMBSTONE;
        return true;
      }
      idx = (idx + 1) % this.cap;
    }
    return false;
  }
}

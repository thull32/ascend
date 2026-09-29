// Array plus a value->index map: remove swaps the target with the last
// element (updating the moved value's index) so every op is O(1).
class RandomizedSet {
  constructor() {
    this.values = [];
    this.index = new Map();
  }

  insert(val) {
    if (this.index.has(val)) return false;
    this.index.set(val, this.values.length);
    this.values.push(val);
    return true;
  }

  remove(val) {
    if (!this.index.has(val)) return false;
    const i = this.index.get(val);
    const last = this.values[this.values.length - 1];
    this.values[i] = last;
    this.index.set(last, i);
    this.values.pop();
    this.index.delete(val);
    return true;
  }

  get_random() {
    const i = Math.floor(Math.random() * this.values.length);
    return this.values[i];
  }

  get_random_is_member() {
    return this.index.has(this.get_random());
  }
}

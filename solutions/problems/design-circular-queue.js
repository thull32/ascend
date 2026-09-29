// Ring buffer: fixed array, head index, and count (avoids the head==tail
// ambiguity between empty and full).
class MyCircularQueue {
  constructor(k) {
    this.buf = new Array(k).fill(0);
    this.k = k;
    this.head = 0;
    this.count = 0;
  }

  enqueue(value) {
    if (this.count === this.k) return false;
    this.buf[(this.head + this.count) % this.k] = value;
    this.count += 1;
    return true;
  }

  dequeue() {
    if (this.count === 0) return false;
    this.head = (this.head + 1) % this.k;
    this.count -= 1;
    return true;
  }

  front() {
    return this.count === 0 ? -1 : this.buf[this.head];
  }

  rear() {
    return this.count === 0 ? -1 : this.buf[(this.head + this.count - 1) % this.k];
  }

  is_empty() {
    return this.count === 0;
  }

  is_full() {
    return this.count === this.k;
  }
}

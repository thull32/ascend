class RingBuffer {
  constructor() {
    this.buf = [];
    this.cap = 0;
    this.head = 0; // index of the oldest item
    this.tail = 0; // index where the next item goes
    this.count = 0;
  }

  set_capacity(n) {
    this.cap = n;
    this.buf = new Array(n).fill(null);
    this.head = 0;
    this.tail = 0;
    this.count = 0;
    return null;
  }

  push(x) {
    if (this.count >= this.cap) return false;
    this.buf[this.tail] = x;
    this.tail = (this.tail + 1) % this.cap;
    this.count += 1;
    return true;
  }

  pop() {
    if (this.count === 0) return null;
    const x = this.buf[this.head];
    this.head = (this.head + 1) % this.cap;
    this.count -= 1;
    return x;
  }

  size() {
    return this.count;
  }
}

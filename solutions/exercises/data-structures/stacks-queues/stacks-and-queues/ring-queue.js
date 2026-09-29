class RingQueue {
  constructor() {
    this.cap = 3;
    this.buf = new Array(this.cap).fill(null);
    this.head = 0;
    this.count = 0;
  }
  enqueue(x) {
    if (this.count === this.cap) return false;
    const tail = (this.head + this.count) % this.cap;
    this.buf[tail] = x;
    this.count += 1;
    return true;
  }
  dequeue() {
    if (this.count === 0) return null;
    const x = this.buf[this.head];
    this.buf[this.head] = null;
    this.head = (this.head + 1) % this.cap;
    this.count -= 1;
    return x;
  }
  peek() {
    if (this.count === 0) return null;
    return this.buf[this.head];
  }
  size() { return this.count; }
}

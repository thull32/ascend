class Queue {
  constructor() {
    this.inbox = [];
    this.outbox = [];
  }

  _shift() {
    if (this.outbox.length === 0) {
      while (this.inbox.length > 0) {
        this.outbox.push(this.inbox.pop());
      }
    }
  }

  push(x) {
    this.inbox.push(x);
  }

  pop() {
    this._shift();
    if (this.outbox.length === 0) return null;
    return this.outbox.pop();
  }

  peek() {
    this._shift();
    if (this.outbox.length === 0) return null;
    return this.outbox[this.outbox.length - 1];
  }

  empty() {
    return this.inbox.length === 0 && this.outbox.length === 0;
  }
}

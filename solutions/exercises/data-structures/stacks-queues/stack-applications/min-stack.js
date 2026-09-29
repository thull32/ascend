class MinStack {
  constructor() {
    this.stack = [];
    this.mins = [];
  }
  push(x) {
    this.stack.push(x);
    if (this.mins.length > 0) {
      this.mins.push(Math.min(x, this.mins[this.mins.length - 1]));
    } else {
      this.mins.push(x);
    }
  }
  pop() {
    this.stack.pop();
    this.mins.pop();
  }
  top() {
    return this.stack[this.stack.length - 1];
  }
  get_min() {
    return this.mins[this.mins.length - 1];
  }
}

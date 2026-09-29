// Min Stack: two parallel stacks, one tracking the running minimum at each level.
class MinStack {
  constructor() {
    this.vals = [];
    this.mins = [];
  }

  push(val) {
    this.vals.push(val);
    const currentMin = this.mins.length === 0 ? val : Math.min(val, this.mins[this.mins.length - 1]);
    this.mins.push(currentMin);
  }

  pop() {
    this.vals.pop();
    this.mins.pop();
  }

  top() {
    return this.vals[this.vals.length - 1];
  }

  get_min() {
    return this.mins[this.mins.length - 1];
  }
}

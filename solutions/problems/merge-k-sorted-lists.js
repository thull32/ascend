// Merge K Sorted Lists: min-heap of the k current heads, keyed by (value, index).
// Uses ListNode which is provided globally by the grading harness.

class MinHeap {
  constructor() {
    this.items = [];
  }

  size() {
    return this.items.length;
  }

  _less(a, b) {
    if (a[0] !== b[0]) return a[0] < b[0];
    return a[1] < b[1];
  }

  push(item) {
    const items = this.items;
    items.push(item);
    let i = items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this._less(items[i], items[parent])) {
        [items[i], items[parent]] = [items[parent], items[i]];
        i = parent;
      } else {
        break;
      }
    }
  }

  pop() {
    const items = this.items;
    const top = items[0];
    const last = items.pop();
    if (items.length > 0) {
      items[0] = last;
      let i = 0;
      const n = items.length;
      while (true) {
        const left = 2 * i + 1;
        const right = 2 * i + 2;
        let smallest = i;
        if (left < n && this._less(items[left], items[smallest])) smallest = left;
        if (right < n && this._less(items[right], items[smallest])) smallest = right;
        if (smallest === i) break;
        [items[i], items[smallest]] = [items[smallest], items[i]];
        i = smallest;
      }
    }
    return top;
  }
}

function merge_k_lists(lists) {
  const heap = new MinHeap();
  for (let i = 0; i < lists.length; i++) {
    const node = lists[i];
    if (node !== null && node !== undefined) {
      heap.push([node.val, i, node]);
    }
  }

  const dummy = new ListNode(0);
  let tail = dummy;
  while (heap.size() > 0) {
    const [, i, node] = heap.pop();
    tail.next = node;
    tail = node;
    if (node.next !== null && node.next !== undefined) {
      heap.push([node.next.val, i, node.next]);
    }
  }
  return dummy.next;
}

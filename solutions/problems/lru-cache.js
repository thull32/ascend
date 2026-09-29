// LRU Cache — hash map + doubly linked list with sentinel head/tail nodes.
class _Node {
  constructor(key = 0, val = 0) {
    this.key = key;
    this.val = val;
    this.prev = null;
    this.next = null;
  }
}

class LRUCache {
  constructor(capacity) {
    this.cap = capacity;
    this.map = new Map();
    this.head = new _Node(); // sentinel: most recent is head.next
    this.tail = new _Node(); // sentinel: least recent is tail.prev
    this.head.next = this.tail;
    this.tail.prev = this.head;
  }

  _unlink(node) {
    node.prev.next = node.next;
    node.next.prev = node.prev;
  }

  _insertFront(node) {
    node.next = this.head.next;
    node.prev = this.head;
    this.head.next.prev = node;
    this.head.next = node;
  }

  get(key) {
    const node = this.map.get(key);
    if (node === undefined) return -1;
    this._unlink(node);
    this._insertFront(node);
    return node.val;
  }

  put(key, value) {
    let node = this.map.get(key);
    if (node !== undefined) {
      node.val = value;
      this._unlink(node);
      this._insertFront(node);
      return;
    }
    node = new _Node(key, value);
    this.map.set(key, node);
    this._insertFront(node);
    if (this.map.size > this.cap) {
      const victim = this.tail.prev;
      this._unlink(victim);
      this.map.delete(victim.key);
    }
  }
}

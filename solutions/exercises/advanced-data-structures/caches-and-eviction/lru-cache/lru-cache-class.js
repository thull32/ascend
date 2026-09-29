class Node {
  constructor(key = null, value = null) {
    this.key = key;
    this.value = value;
    this.prev = this.next = null;
  }
}

class LRUCache {
  constructor() {
    this.capacity = 0;
    this.map = new Map();
    this.head = new Node();
    this.tail = new Node();
    this.head.next = this.tail;
    this.tail.prev = this.head;
  }

  set_capacity(capacity) {
    this.capacity = capacity;
  }

  _unlink(node) {
    node.prev.next = node.next;
    node.next.prev = node.prev;
  }

  _pushFront(node) {
    node.next = this.head.next;
    node.prev = this.head;
    this.head.next.prev = node;
    this.head.next = node;
  }

  get(key) {
    if (!this.map.has(key)) return -1;
    const node = this.map.get(key);
    this._unlink(node);
    this._pushFront(node);
    return node.value;
  }

  put(key, value) {
    if (this.map.has(key)) {
      const node = this.map.get(key);
      node.value = value;
      this._unlink(node);
      this._pushFront(node);
      return;
    }

    if (this.map.size >= this.capacity) {
      if (this.capacity <= 0) return;
      const lru = this.tail.prev;
      this._unlink(lru);
      this.map.delete(lru.key);
    }

    const node = new Node(key, value);
    this.map.set(key, node);
    this._pushFront(node);
  }
}

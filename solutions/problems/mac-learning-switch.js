// MAC Learning Switch: a (vlan, mac) -> entry Map whose entries are threaded
// through a doubly linked list in last-seen order, oldest first. Time is
// non-decreasing, so moving a key to the tail on every learn keeps the list
// sorted by last_seen, and expiry pops from the head (the LRU structure, by age).
// The explicit list matters in JavaScript: deleting from the front of a V8 Map
// leaves holes that every new iterator rescans until the next rehash, which
// makes "read the Map's first entry" O(n) in the worst case.
function isGroup(mac) {
  return (parseInt(mac.slice(0, 2), 16) & 1) === 1;
}

class LearningSwitch {
  constructor(ports, aging) {
    this.aging = aging;
    this.members = new Map(); // port -> Set of VLANs
    this.vlanPorts = new Map(); // VLAN -> member ports, ascending
    for (const [port, vlans] of ports) {
      this.members.set(port, new Set(vlans));
      for (const vlan of vlans) {
        if (!this.vlanPorts.has(vlan)) this.vlanPorts.set(vlan, []);
        this.vlanPorts.get(vlan).push(port);
      }
    }
    for (const list of this.vlanPorts.values()) list.sort((a, b) => a - b);
    this.table = new Map(); // "vlan|mac" -> node {key, port, seen, prev, next}
    this.head = { prev: null, next: null }; // sentinel: head.next is the oldest
    this.tail = { prev: this.head, next: null }; // sentinel: tail.prev is the newest
    this.head.next = this.tail;
  }

  _unlink(node) {
    node.prev.next = node.next;
    node.next.prev = node.prev;
  }

  _append(node) {
    node.prev = this.tail.prev;
    node.next = this.tail;
    this.tail.prev.next = node;
    this.tail.prev = node;
  }

  _expire(now) {
    let node = this.head.next;
    while (node !== this.tail && now - node.seen > this.aging) {
      this._unlink(node);
      this.table.delete(node.key);
      node = this.head.next;
    }
  }

  _flood(vlan, inPort) {
    return this.vlanPorts.get(vlan).filter((p) => p !== inPort);
  }

  receive(time, port, vlan, src, dst) {
    const vlans = this.members.get(port);
    if (vlans === undefined || !vlans.has(vlan)) return [];
    if (isGroup(src)) return [];
    this._expire(time);
    const key = vlan + "|" + src;
    let node = this.table.get(key);
    if (node === undefined) {
      node = { key, port, seen: time, prev: null, next: null };
      this.table.set(key, node);
    } else {
      this._unlink(node); // refresh: move to the newest end
      node.port = port;
      node.seen = time;
    }
    this._append(node);
    if (isGroup(dst)) return this._flood(vlan, port);
    const entry = this.table.get(vlan + "|" + dst);
    if (entry === undefined) return this._flood(vlan, port);
    return entry.port === port ? [] : [entry.port];
  }

  lookup(time, vlan, mac) {
    this._expire(time);
    const entry = this.table.get(vlan + "|" + mac);
    return entry === undefined ? -1 : entry.port;
  }

  table_size(time) {
    this._expire(time);
    return this.table.size;
  }
}

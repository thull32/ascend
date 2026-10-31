// Flow Table with TTL — hash map of records + min-heap of (expiry, flow_key, id) with lazy deletion.
function cmpEntry(a, b) {
  if (a[0] !== b[0]) return a[0] - b[0];
  if (a[1] !== b[1]) return a[1] < b[1] ? -1 : 1;
  return a[2] - b[2];
}

class _MinHeap {
  constructor() { this.a = []; }
  size() { return this.a.length; }
  peek() { return this.a[0]; }
  push(x) {
    const a = this.a;
    a.push(x);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (cmpEntry(a[i], a[p]) >= 0) break;
      [a[i], a[p]] = [a[p], a[i]];
      i = p;
    }
  }
  pop() {
    const a = this.a;
    const top = a[0];
    const last = a.pop();
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < a.length && cmpEntry(a[l], a[m]) < 0) m = l;
        if (r < a.length && cmpEntry(a[r], a[m]) < 0) m = r;
        if (m === i) break;
        [a[i], a[m]] = [a[m], a[i]];
        i = m;
      }
    }
    return top;
  }
}

class FlowTable {
  constructor(ttl) {
    this.ttl = ttl;
    this.records = new Map(); // id -> [flow_key, bytes, first_seen, last_seen]
    this.current = new Map(); // flow_key -> id of its newest record
    this.heap = new _MinHeap(); // [expiry, flow_key, id]
    this.nextId = 0;
  }

  add(flow_key, num_bytes, now) {
    let rid = this.current.get(flow_key);
    if (rid !== undefined && this.records.get(rid)[3] + this.ttl > now) {
      const rec = this.records.get(rid); // live: refresh it
      rec[1] += num_bytes;
      rec[3] = now;
    } else {
      rid = this.nextId++; // absent or timed out: a new record
      this.records.set(rid, [flow_key, num_bytes, now, now]);
      this.current.set(flow_key, rid);
    }
    this.heap.push([now + this.ttl, flow_key, rid]);
  }

  get(flow_key, now) {
    const rid = this.current.get(flow_key);
    if (rid === undefined) return -1;
    const rec = this.records.get(rid);
    if (rec[3] + this.ttl <= now) return -1; // expired, not yet swept
    return rec[1];
  }

  expire(now) {
    const out = [];
    while (this.heap.size() && this.heap.peek()[0] <= now) {
      const [expiry, flow_key, rid] = this.heap.pop();
      const rec = this.records.get(rid);
      if (rec === undefined || rec[3] + this.ttl !== expiry) continue; // stale
      out.push(rec.slice());
      this.records.delete(rid);
      if (this.current.get(flow_key) === rid) this.current.delete(flow_key);
    }
    return out;
  }
}

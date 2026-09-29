class WAL {
  constructor() {
    this.records = []; // array of [lsn, key, value]
    this.durableLsn = 0; // every record with lsn <= durableLsn is durable
  }

  append(key, value) {
    const lsn = this.records.length + 1;
    this.records.push([lsn, key, value]);
    return lsn;
  }

  commit() {
    this.durableLsn = this.records.length;
    return null;
  }

  crash() {
    this.records = this.records.slice(0, this.durableLsn);
    return null;
  }

  get(key) {
    let value = null;
    for (const [, k, v] of this.records) {
      if (k === key) value = v;
    }
    return value;
  }

  recover() {
    const result = {};
    for (const [, k, v] of this.records.slice(0, this.durableLsn)) {
      result[k] = v;
    }
    return result;
  }
}

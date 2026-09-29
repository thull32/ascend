// Idempotency-key handler for a POST /orders endpoint.

class IdempotentOrders {
  static TTL = 86400;

  constructor() {
    this.nextId = 1;
    this.keys = new Map(); // key -> { body, response, at }
  }

  handle(key, body, now) {
    if (key === null || key === undefined) {
      return this._create();
    }

    const entry = this.keys.get(key);
    if (entry !== undefined) {
      if (now - entry.at < IdempotentOrders.TTL) {
        if (body === entry.body) return entry.response;
        return "422";
      }
    }

    const response = this._create();
    this.keys.set(key, { body, response, at: now });
    return response;
  }

  _create() {
    const response = `201 order-${this.nextId}`;
    this.nextId += 1;
    return response;
  }
}

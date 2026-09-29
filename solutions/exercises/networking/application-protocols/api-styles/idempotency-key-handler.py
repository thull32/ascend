# Idempotency-key handler for a POST /orders endpoint.

class IdempotentOrders:
    TTL = 86400

    def __init__(self):
        self.next_id = 1
        self.keys = {}   # key -> (body, response, stored_at)

    def handle(self, key, body, now):
        if key is None:
            return self._create(body, now, store_key=None)

        entry = self.keys.get(key)
        if entry is not None:
            stored_body, stored_response, stored_at = entry
            if now - stored_at < self.TTL:
                if body == stored_body:
                    return stored_response
                return "422"

        return self._create(body, now, store_key=key)

    def _create(self, body, now, store_key):
        response = f"201 order-{self.next_id}"
        self.next_id += 1
        if store_key is not None:
            self.keys[store_key] = (body, response, now)
        return response

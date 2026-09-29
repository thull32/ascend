class TTLCache:
    def __init__(self):
        self.entries = {}  # key -> (value, expiry)

    def put(self, key, value, now, ttl):
        self.entries[key] = (value, now + ttl)

    def get(self, key, now):
        if key not in self.entries:
            return None
        value, expiry = self.entries[key]
        if now < expiry:
            return value
        del self.entries[key]
        return None

    def size(self, now):
        dead = [k for k, (_, expiry) in self.entries.items() if now >= expiry]
        for k in dead:
            del self.entries[k]
        return len(self.entries)

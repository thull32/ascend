class WAL:
    def __init__(self):
        self.records = []  # list of (lsn, key, value)
        self.durable_lsn = 0  # every record with lsn <= durable_lsn is durable

    def append(self, key, value):
        lsn = len(self.records) + 1
        self.records.append((lsn, key, value))
        return lsn

    def commit(self):
        self.durable_lsn = len(self.records)
        return None

    def crash(self):
        self.records = self.records[: self.durable_lsn]
        return None

    def get(self, key):
        value = None
        for _, k, v in self.records:
            if k == key:
                value = v
        return value

    def recover(self):
        result = {}
        for _, k, v in self.records[: self.durable_lsn]:
            result[k] = v
        return result

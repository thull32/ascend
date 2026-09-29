class LSMStore:
    def __init__(self):
        self.memtable = {}  # key -> value or None (tombstone)
        self._runs = []  # list of runs; each run is a sorted list of [key, value]

    def put(self, key, value):
        self.memtable[key] = value
        return None

    def delete(self, key):
        self.memtable[key] = None
        return None

    def get(self, key):
        if key in self.memtable:
            return self.memtable[key]
        for run in reversed(self._runs):
            for k, v in run:
                if k == key:
                    return v
        return None

    def flush(self):
        if self.memtable:
            run = [[k, v] for k, v in sorted(self.memtable.items())]
            self._runs.append(run)
            self.memtable = {}
        return len(self._runs)

    def compact(self):
        merged = {}
        for run in self._runs:
            for k, v in run:
                merged[k] = v
        live = {k: v for k, v in merged.items() if v is not None}
        new_run = [[k, live[k]] for k in sorted(live)]
        self._runs = [new_run] if new_run else []
        return len(live)

    def runs(self):
        return self._runs

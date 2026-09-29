from bisect import bisect_right


class SnapshotArray:
    def __init__(self, length):
        self.snap_ids = [[0] for _ in range(length)]
        self.values = [[0] for _ in range(length)]
        self.snap_id = 0

    def set(self, index, val):
        ids = self.snap_ids[index]
        vals = self.values[index]
        if ids[-1] == self.snap_id:
            vals[-1] = val
        else:
            ids.append(self.snap_id)
            vals.append(val)

    def snap(self):
        current = self.snap_id
        self.snap_id += 1
        return current

    def get(self, index, snap_id):
        ids = self.snap_ids[index]
        pos = bisect_right(ids, snap_id) - 1
        return self.values[index][pos]

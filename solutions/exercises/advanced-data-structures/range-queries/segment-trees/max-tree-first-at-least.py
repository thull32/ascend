class MaxTree:
    def build(self, values):
        self.n = len(values)
        self.tree = [float("-inf")] * (4 * self.n)
        self._build(1, 0, self.n - 1, values)

    def _build(self, node, lo, hi, values):
        if lo == hi:
            self.tree[node] = values[lo]
            return
        mid = (lo + hi) // 2
        self._build(2 * node, lo, mid, values)
        self._build(2 * node + 1, mid + 1, hi, values)
        self.tree[node] = max(self.tree[2 * node], self.tree[2 * node + 1])

    def update(self, i, value):
        self._update(1, 0, self.n - 1, i, value)

    def _update(self, node, lo, hi, i, value):
        if lo == hi:
            self.tree[node] = value
            return
        mid = (lo + hi) // 2
        if i <= mid:
            self._update(2 * node, lo, mid, i, value)
        else:
            self._update(2 * node + 1, mid + 1, hi, i, value)
        self.tree[node] = max(self.tree[2 * node], self.tree[2 * node + 1])

    def query(self, l, r):
        return self._query(1, 0, self.n - 1, l, r)

    def _query(self, node, lo, hi, l, r):
        if r < lo or hi < l:
            return float("-inf")
        if l <= lo and hi <= r:
            return self.tree[node]
        mid = (lo + hi) // 2
        return max(
            self._query(2 * node, lo, mid, l, r),
            self._query(2 * node + 1, mid + 1, hi, l, r),
        )

    def first_at_least(self, l, x):
        return self._first(1, 0, self.n - 1, l, x)

    def _first(self, node, lo, hi, l, x):
        if hi < l or self.tree[node] < x:
            return -1
        if lo == hi:
            return lo
        mid = (lo + hi) // 2
        left = self._first(2 * node, lo, mid, l, x)
        if left != -1:
            return left
        return self._first(2 * node + 1, mid + 1, hi, l, x)

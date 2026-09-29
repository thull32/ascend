class Fenwick:
    def build(self, values):
        self.n = len(values)
        self.tree = [0] * (self.n + 1)
        for i, v in enumerate(values):
            self.add(i, v)

    def add(self, i, delta):
        i += 1
        while i <= self.n:
            self.tree[i] += delta
            i += i & -i

    def prefix(self, i):
        i += 1
        s = 0
        while i > 0:
            s += self.tree[i]
            i -= i & -i
        return s

    def sum(self, l, r):
        return self.prefix(r) - (self.prefix(l - 1) if l > 0 else 0)

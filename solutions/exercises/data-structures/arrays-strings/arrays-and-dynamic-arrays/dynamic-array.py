class DynamicArray:
    def __init__(self):
        self._cap = 2
        self._len = 0
        self._data = [None] * self._cap   # fixed block; replace it to grow

    def push(self, x):
        if self._len == self._cap:
            new_cap = self._cap * 2
            new_data = [None] * new_cap
            for i in range(self._len):
                new_data[i] = self._data[i]
            self._data = new_data
            self._cap = new_cap
        self._data[self._len] = x
        self._len += 1

    def pop(self):
        if self._len == 0:
            return None
        self._len -= 1
        x = self._data[self._len]
        self._data[self._len] = None
        return x

    def get(self, i):
        return self._data[i]

    def size(self):
        return self._len

    def capacity(self):
        return self._cap

# Hand-rolled binary min-heap over a plain array (no heapq): push/pop/peek
# via explicit sift-up and sift-down, per the lesson's array-mechanics focus.


class MinHeap:
    def __init__(self):
        self.a = []

    def push(self, x):
        a = self.a
        a.append(x)
        i = len(a) - 1
        while i > 0:
            parent = (i - 1) // 2
            if a[parent] <= a[i]:
                break
            a[parent], a[i] = a[i], a[parent]
            i = parent

    def pop(self):
        a = self.a
        if not a:
            return None
        top = a[0]
        last = a.pop()
        if a:
            a[0] = last
            i = 0
            n = len(a)
            while True:
                left, right = 2 * i + 1, 2 * i + 2
                smallest = i
                if left < n and a[left] < a[smallest]:
                    smallest = left
                if right < n and a[right] < a[smallest]:
                    smallest = right
                if smallest == i:
                    break
                a[i], a[smallest] = a[smallest], a[i]
                i = smallest
        return top

    def peek(self):
        return self.a[0] if self.a else None

    def size(self):
        return len(self.a)

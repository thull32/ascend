from collections import deque


class Node:
    def __init__(self, key):
        self.key = key
        self.color = "R"
        self.left = self.right = self.parent = None


class RBTree:
    def __init__(self):
        self.root = None

    def rotate_left(self, x):
        y = x.right
        x.right = y.left
        if y.left:
            y.left.parent = x
        y.parent = x.parent
        if x.parent is None:
            self.root = y
        elif x is x.parent.left:
            x.parent.left = y
        else:
            x.parent.right = y
        y.left = x
        x.parent = y

    def rotate_right(self, y):
        x = y.left
        y.left = x.right
        if x.right:
            x.right.parent = y
        x.parent = y.parent
        if y.parent is None:
            self.root = x
        elif y is y.parent.left:
            y.parent.left = x
        else:
            y.parent.right = x
        x.right = y
        y.parent = x

    def insert(self, key):
        z = Node(key)
        parent = None
        cur = self.root
        while cur:
            parent = cur
            if key < cur.key:
                cur = cur.left
            else:
                cur = cur.right
        z.parent = parent
        if parent is None:
            self.root = z
        elif key < parent.key:
            parent.left = z
        else:
            parent.right = z

        z.color = "R"
        self._fixup(z)

    def _fixup(self, z):
        while z.parent and z.parent.color == "R":
            parent = z.parent
            grand = parent.parent
            if grand is None:
                break
            if parent is grand.left:
                uncle = grand.right
                if uncle and uncle.color == "R":
                    parent.color = "B"
                    uncle.color = "B"
                    grand.color = "R"
                    z = grand
                else:
                    if z is parent.right:
                        z = parent
                        self.rotate_left(z)
                        parent = z.parent
                    parent.color = "B"
                    grand.color = "R"
                    self.rotate_right(grand)
            else:
                uncle = grand.left
                if uncle and uncle.color == "R":
                    parent.color = "B"
                    uncle.color = "B"
                    grand.color = "R"
                    z = grand
                else:
                    if z is parent.left:
                        z = parent
                        self.rotate_right(z)
                        parent = z.parent
                    parent.color = "B"
                    grand.color = "R"
                    self.rotate_left(grand)
        self.root.color = "B"


def rb_level_order(values):
    t = RBTree()
    for v in values:
        t.insert(v)
    order = []
    if t.root:
        q = deque([t.root])
        while q:
            n = q.popleft()
            order.append([n.key, n.color])
            if n.left:
                q.append(n.left)
            if n.right:
                q.append(n.right)
    return order

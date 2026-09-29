import math


def btree_height(n, page_bytes, entry_bytes, header_bytes, fill):
    f = math.floor((page_bytes - header_bytes) * fill / entry_bytes)
    if f < 2:
        return -1
    h = 1
    reach = f
    while reach < n:
        reach *= f
        h += 1
    return h

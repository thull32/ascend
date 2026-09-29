def _layout_size(order):
    offset = 0
    largest = 0
    for size in order:
        offset = ((offset + size - 1) // size) * size
        offset += size
        largest = max(largest, size)
    return ((offset + largest - 1) // largest) * largest


def struct_size(sizes):
    declared = _layout_size(sizes)
    best = _layout_size(sorted(sizes, reverse=True))
    return [declared, best]

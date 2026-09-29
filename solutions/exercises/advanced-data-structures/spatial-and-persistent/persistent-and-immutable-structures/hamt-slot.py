def hamt_slot(bitmap, chunk):
    present = (bitmap >> chunk) & 1 == 1
    mask = (1 << chunk) - 1
    index = (bitmap & mask).bit_count()
    return [present, index]

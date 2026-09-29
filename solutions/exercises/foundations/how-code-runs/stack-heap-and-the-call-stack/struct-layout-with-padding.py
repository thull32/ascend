def struct_size(fields):
    offset = 0
    max_size = 1
    for f in fields:
        if f > max_size:
            max_size = f
        if offset % f != 0:
            offset += f - (offset % f)
        offset += f
    if offset % max_size != 0:
        offset += max_size - (offset % max_size)
    return offset

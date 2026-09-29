def inode_reads(offset, block_size, ptr_size):
    ptrs = block_size // ptr_size
    direct = 12 * block_size
    single = ptrs * block_size
    double = ptrs * ptrs * block_size
    triple = ptrs * ptrs * ptrs * block_size

    if offset < direct:
        return 1
    if offset < direct + single:
        return 2
    if offset < direct + single + double:
        return 3
    if offset < direct + single + double + triple:
        return 4
    return -1

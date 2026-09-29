def page_table_indices(addr):
    offset = addr & 0xFFF
    pt = (addr >> 12) & 0x1FF
    pd = (addr >> 21) & 0x1FF
    pdpt = (addr >> 30) & 0x1FF
    pml4 = (addr >> 39) & 0x1FF
    return [pml4, pdpt, pd, pt, offset]

function inode_reads(offset, block_size, ptr_size) {
  const ptrs = Math.floor(block_size / ptr_size);
  const direct = 12 * block_size;
  const single = ptrs * block_size;
  const double_ = ptrs * ptrs * block_size;
  const triple = ptrs * ptrs * ptrs * block_size;

  if (offset < direct) return 1;
  if (offset < direct + single) return 2;
  if (offset < direct + single + double_) return 3;
  if (offset < direct + single + double_ + triple) return 4;
  return -1;
}

function page_table_indices(addr) {
  const offset = addr % 4096;
  const pt = Math.floor(addr / 4096) % 512;
  const pd = Math.floor(addr / (4096 * 512)) % 512;
  const pdpt = Math.floor(addr / (4096 * 512 * 512)) % 512;
  const pml4 = Math.floor(addr / (4096 * 512 * 512 * 512)) % 512;
  return [pml4, pdpt, pd, pt, offset];
}

function btree_height(n, pageBytes, entryBytes, headerBytes, fill) {
  const f = Math.floor(((pageBytes - headerBytes) * fill) / entryBytes);
  if (f < 2) return -1;
  let h = 1;
  let reach = f;
  while (reach < n) {
    reach *= f;
    h += 1;
  }
  return h;
}

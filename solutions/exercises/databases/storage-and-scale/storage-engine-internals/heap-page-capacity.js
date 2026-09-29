function heap_layout(data_bytes, fillfactor, n_rows) {
  const tupleBytes = Math.floor((24 + data_bytes + 7) / 8) * 8;
  const reserved = Math.floor((8192 * (100 - fillfactor)) / 100);
  const available = 8168 - reserved;
  let rowsPerPage = Math.floor(available / (tupleBytes + 4));
  rowsPerPage = Math.min(rowsPerPage, 291);

  let pages;
  if (n_rows === 0) {
    pages = 0;
  } else {
    pages = Math.floor((n_rows + rowsPerPage - 1) / rowsPerPage);
  }

  return { tuple_bytes: tupleBytes, rows_per_page: rowsPerPage, pages };
}

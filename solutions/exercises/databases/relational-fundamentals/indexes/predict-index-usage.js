function index_usage(index_cols, equals, ranges, order_by) {
  const equalsSet = new Set(equals);
  const rangesSet = new Set(ranges);

  let boundColumns = 0;
  for (const col of index_cols) {
    if (equalsSet.has(col)) {
      boundColumns += 1;
      continue;
    } else if (rangesSet.has(col)) {
      boundColumns += 1;
      break;
    } else {
      break;
    }
  }

  let sortedOk = false;
  const p = index_cols.indexOf(order_by);
  if (p !== -1) {
    sortedOk = index_cols.slice(0, p).every((c) => equalsSet.has(c));
  }

  return { bound_columns: boundColumns, sorted: sortedOk };
}

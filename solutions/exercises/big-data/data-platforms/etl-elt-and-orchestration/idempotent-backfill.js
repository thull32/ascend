function backfill_partitions(source, runs) {
  const table = new Map();   // logical_date -> Map(country -> total)

  for (const [run_on, logical_date] of runs) {
    const totals = new Map();
    for (const [order_date, country, amount, arrived_on] of source) {
      if (order_date === logical_date && arrived_on <= run_on) {
        totals.set(country, (totals.get(country) || 0) + amount);
      }
    }
    table.set(logical_date, totals);
  }

  const rows = [];
  for (const [date, totals] of table) {
    for (const [country, total] of totals) {
      rows.push([date, country, total]);
    }
  }
  rows.sort((a, b) => {
    if (a[0] !== b[0]) return a[0] < b[0] ? -1 : 1;
    if (a[1] !== b[1]) return a[1] < b[1] ? -1 : 1;
    return 0;
  });
  return rows;
}

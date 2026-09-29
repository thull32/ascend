function scd2_merge(dim, updates) {
  const rows = dim.map((r) => [...r]);

  function findCurrent(customerId) {
    for (const r of rows) {
      if (r[0] === customerId && r[3] === null) return r;
    }
    return null;
  }

  for (const [customerId, country, effectiveDate] of updates) {
    const current = findCurrent(customerId);
    if (current === null) {
      rows.push([customerId, country, effectiveDate, null]);
    } else if (current[1] === country) {
      continue;
    } else {
      current[3] = effectiveDate;
      rows.push([customerId, country, effectiveDate, null]);
    }
  }

  return rows.sort((a, b) => (a[0] - b[0]) || (a[2] < b[2] ? -1 : a[2] > b[2] ? 1 : 0));
}

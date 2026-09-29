function equity_by_year(grants, prices) {
  const result = prices.map(() => 0);

  for (const [startYear, value, conversionPrice, schedule] of grants) {
    const shares = Math.floor(value / conversionPrice);
    schedule.forEach((pct, i) => {
      const idx = startYear + i - 1;
      if (idx >= 0 && idx < prices.length) {
        result[idx] += shares * (pct / 100) * prices[idx];
      }
    });
  }

  return result;
}

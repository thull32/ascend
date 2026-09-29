function plan_reservations(hourly, on_demand_cents, reserved_cents) {
  const maxR = hourly.length > 0 ? Math.max(...hourly) : 0;

  let bestR = 0;
  let bestCost = null;

  for (let r = 0; r <= maxR; r++) {
    const onDemandTotal = hourly.reduce((sum, n) => sum + Math.max(n - r, 0), 0);
    const cost = 30 * (hourly.length * r * reserved_cents + onDemandTotal * on_demand_cents);
    if (bestCost === null || cost < bestCost) {
      bestCost = cost;
      bestR = r;
    }
  }

  return { reserved: bestR, monthly_cents: bestCost === null ? 0 : bestCost };
}

function roundTo(x, digits) {
  const f = Math.pow(10, digits);
  return Math.round((x + Number.EPSILON * Math.sign(x)) * f) / f;
}

function budget_status(slo, total, failed) {
  const allowed = (total * (100 - slo)) / 100;
  const remaining = allowed - failed;
  const consumed_pct = (100 * failed) / allowed;
  let action;
  if (consumed_pct < 75) action = "ship";
  else if (consumed_pct < 100) action = "caution";
  else action = "freeze";
  return {
    allowed: roundTo(allowed, 2),
    remaining: roundTo(remaining, 2),
    consumed_pct: roundTo(consumed_pct, 1),
    action,
  };
}

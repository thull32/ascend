function pool_plan(peak_rps, hold_ms, burst, instances, max_surge, db_slots) {
  const total = Math.ceil((peak_rps * hold_ms * burst) / 1000);
  const perInstance = Math.ceil(total / instances);
  const cap = Math.floor(db_slots / (instances + max_surge));
  const fits = perInstance <= cap;
  return { per_instance: perInstance, cap, fits };
}

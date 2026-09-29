def pool_plan(peak_rps, hold_ms, burst, instances, max_surge, db_slots):
    total = -(-(peak_rps * hold_ms * burst) // 1000)
    per_instance = -(-total // instances)
    cap = db_slots // (instances + max_surge)
    fits = per_instance <= cap
    return {"per_instance": per_instance, "cap": cap, "fits": fits}

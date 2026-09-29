def plan_reservations(hourly, on_demand_cents, reserved_cents):
    max_r = max(hourly) if hourly else 0

    best_r = 0
    best_cost = None

    for r in range(max_r + 1):
        cost = 30 * (
            len(hourly) * r * reserved_cents
            + sum(max(n - r, 0) for n in hourly) * on_demand_cents
        )
        if best_cost is None or cost < best_cost:
            best_cost = cost
            best_r = r

    return {"reserved": best_r, "monthly_cents": best_cost if best_cost is not None else 0}

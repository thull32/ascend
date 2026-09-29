def budget_status(slo, total, failed):
    allowed = total * (100 - slo) / 100
    remaining = allowed - failed
    consumed_pct = 100 * failed / allowed
    if consumed_pct < 75:
        action = "ship"
    elif consumed_pct < 100:
        action = "caution"
    else:
        action = "freeze"
    return {
        "allowed": round(allowed, 2),
        "remaining": round(remaining, 2),
        "consumed_pct": round(consumed_pct, 1),
        "action": action,
    }

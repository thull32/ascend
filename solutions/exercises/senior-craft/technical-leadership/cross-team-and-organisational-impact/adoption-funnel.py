def adoption_status(services):
    if not services:
        return {"by_count": 0, "by_traffic": 0, "stalled": [], "bottleneck": None}

    on_library = [s for s in services if s["stage"] in ("adopted", "complete")]
    by_count = (100 * len(on_library)) // len(services)
    by_traffic = sum(s["calls"] for s in on_library)

    stalled = sorted(
        s["name"]
        for s in services
        if s["stage"] not in ("adopted", "complete") and s["weeks"] >= 4
    )

    aware = sum(1 for s in services if s["stage"] == "aware")
    trial = sum(1 for s in services if s["stage"] == "trial")
    if aware == 0 and trial == 0:
        bottleneck = None
    elif aware >= trial:
        bottleneck = "aware"
    else:
        bottleneck = "trial"

    return {
        "by_count": by_count,
        "by_traffic": by_traffic,
        "stalled": stalled,
        "bottleneck": bottleneck,
    }

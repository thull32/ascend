_AXES = ["scope", "ambiguity", "impact", "influence"]


def _axis_level(items):
    for candidate in (6, 5, 4):
        quarters = {it["quarter"] for it in items if it["level"] >= candidate}
        if len(quarters) >= 2:
            return candidate
    return 0


def packet_level(evidence, target):
    axes = {}
    for axis in _AXES:
        items = [it for it in evidence if it["axis"] == axis]
        axes[axis] = _axis_level(items)

    at_or_above = [a for a in _AXES if axes[a] >= target]
    gaps = [a for a in _AXES if axes[a] < target]

    supported = False
    if len(at_or_above) == 4:
        supported = True
    elif len(at_or_above) == 3 and len(gaps) == 1 and axes[gaps[0]] == target - 1:
        supported = True

    return {"axes": axes, "supported": supported, "gaps": gaps}

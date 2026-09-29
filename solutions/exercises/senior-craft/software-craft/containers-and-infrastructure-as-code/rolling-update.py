import math


def _resolve(value, replicas, round_up):
    if isinstance(value, str):
        pct = int(value.rstrip("%"))
        raw = replicas * pct / 100
        return math.ceil(raw) if round_up else math.floor(raw)
    return value


def rolling_update(replicas, max_surge, max_unavailable):
    surge = _resolve(max_surge, replicas, True)
    unavailable = _resolve(max_unavailable, replicas, False)
    if surge == 0 and unavailable == 0:
        unavailable = 1

    old, new = replicas, 0
    result = [[old, new]]
    ready_new = 0  # new pods that were already ready when this round began

    while not (old == 0 and new == replicas):
        # 1. scale up
        if old + new < replicas + surge:
            create = min(replicas + surge - (old + new), replicas - new)
            if create > 0:
                new += create
                result.append([old, new])
        # 2. scale down
        ready = old + ready_new
        limit = replicas - unavailable
        if ready > limit:
            delete = min(old, ready - limit)
            if delete > 0:
                old -= delete
                result.append([old, new])
        # 3. every new pod becomes ready
        ready_new = new

    return result

def _canonical(v):
    if isinstance(v, bool):
        return ("bool", v)
    if isinstance(v, (int, float)):
        f = float(v)
        if f.is_integer():
            return ("num", int(f))
        return ("num", round(f, 6))
    if isinstance(v, str):
        return ("str", v)
    if v is None:
        return ("null",)
    if isinstance(v, list):
        return ("list", tuple(_canonical(x) for x in v))
    if isinstance(v, dict):
        return ("dict", tuple(sorted((k, _canonical(val)) for k, val in v.items())))
    return ("other", v)


def same_result(expected, actual, any_order):
    if any_order and isinstance(expected, list) and isinstance(actual, list):
        return sorted(_canonical(x) for x in expected) == sorted(
            _canonical(x) for x in actual
        )
    return _canonical(expected) == _canonical(actual)

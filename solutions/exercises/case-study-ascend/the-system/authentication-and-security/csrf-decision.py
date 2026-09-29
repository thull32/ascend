def _host_of(origin):
    rest = origin[len("http://"):]
    idx = rest.find(":")
    return rest[:idx] if idx != -1 else rest


def _is_local(origin):
    return origin.startswith("http://") and _host_of(origin) in ("localhost", "127.0.0.1")


def csrf_allows(method, headers, public_origin):
    if method not in ("POST", "PUT", "PATCH", "DELETE"):
        return True
    if "x-requested-with" not in headers:
        return False

    expected = public_origin.rstrip("/")

    if "origin" in headers:
        claimed = headers["origin"].rstrip("/")
    elif "referer" in headers:
        referer = headers["referer"]
        idx = referer.find("://")
        if idx == -1:
            return False
        after = referer[idx + 3:]
        cut = len(after)
        for ch in ("/", "?", "#"):
            p = after.find(ch)
            if p != -1:
                cut = min(cut, p)
        claimed = referer[: idx + 3] + after[:cut]
    else:
        return True

    if claimed == expected:
        return True
    if _is_local(claimed) and _is_local(expected):
        return True
    return False

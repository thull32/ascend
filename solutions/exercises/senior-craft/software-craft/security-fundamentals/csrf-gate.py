def csrf_allowed(method, headers, expected_origin):
    if method in ("GET", "HEAD", "OPTIONS"):
        return True
    if "x-requested-with" not in headers:
        return False
    expected = expected_origin.rstrip("/")
    if "origin" in headers:
        return headers["origin"].rstrip("/") == expected
    if "referer" in headers:
        referer = headers["referer"]
        return referer == expected or referer.startswith(expected + "/")
    return True

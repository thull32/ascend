_TABLE = {
    "validation": (422, "validation_error"),
    "unauthorized": (401, "unauthorized"),
    "forbidden": (403, "forbidden"),
    "not_found": (404, "not_found"),
    "conflict": (409, "conflict"),
    "rate_limited": (429, "rate_limited"),
    "ai_upstream": (502, "ai_upstream"),
    "database": (500, "database_error"),
    "internal": (500, "internal_error"),
}


def to_http(error):
    kind, detail = error["kind"], error["detail"]
    if kind not in _TABLE:
        return {"status": 500, "code": "internal_error", "message": "internal error"}
    status, code = _TABLE[kind]
    if kind == "validation" or kind == "conflict":
        message = detail
    elif kind == "unauthorized":
        message = "authentication required"
    elif kind == "forbidden":
        message = "forbidden"
    elif kind == "not_found":
        message = detail + " not found"
    elif kind == "rate_limited":
        message = "rate limit exceeded: " + detail
    elif kind == "ai_upstream":
        message = "upstream AI provider error: " + detail
    else:
        message = "internal error"
    return {"status": status, "code": code, "message": message}

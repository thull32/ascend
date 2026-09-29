def validate_claims(claims, now, expected):
    leeway = expected["leeway"]

    if claims.get("iss") != expected["iss"]:
        return "bad_issuer"

    aud = claims.get("aud")
    aud_list = aud if isinstance(aud, list) else [aud]
    if expected["aud"] not in aud_list:
        return "bad_audience"

    exp = claims.get("exp")
    if exp is None or now >= exp + leeway:
        return "expired"

    nbf = claims.get("nbf")
    if nbf is not None and now < nbf - leeway:
        return "not_yet_valid"

    scope = claims.get("scope", "")
    tokens = scope.split() if scope else []
    if expected["scope"] not in tokens:
        return "insufficient_scope"

    if claims.get("tenant") != expected["tenant"]:
        return "wrong_tenant"

    return "ok"

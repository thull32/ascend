# Decide what a shared cache does with a stored response.

def cache_decision(cache_control, age):
    directives = {}
    for part in cache_control.split(","):
        part = part.strip().lower()
        if not part:
            continue
        if "=" in part:
            name, value = part.split("=", 1)
            directives[name.strip()] = value.strip()
        else:
            directives[part] = None

    if "no-store" in directives or "private" in directives:
        return "bypass"
    if "no-cache" in directives:
        return "revalidate"

    if "s-maxage" in directives:
        lifetime = int(directives["s-maxage"])
    elif "max-age" in directives:
        lifetime = int(directives["max-age"])
    else:
        lifetime = 0

    if age < lifetime:
        return "fresh"

    swr = int(directives["stale-while-revalidate"]) if "stale-while-revalidate" in directives else 0
    if age < lifetime + swr:
        return "stale-while-revalidate"

    return "revalidate"

def _wildcard_matches(pattern, hostname):
    hostname = hostname.lower()
    pattern = pattern.lower()

    if not pattern.startswith("*."):
        return pattern == hostname

    rest = pattern[2:]
    dot = hostname.find(".")
    if dot <= 0:
        return False
    label, suffix = hostname[:dot], hostname[dot + 1 :]
    return suffix == rest


def validate_chain(hostname, chain, trusted_roots, now):
    # 1. chain linkage
    for i in range(len(chain) - 1):
        if chain[i]["issuer"] != chain[i + 1]["subject"]:
            return "broken-chain"
        if not chain[i + 1]["is_ca"]:
            return "not-a-ca"

    # 2. anchored in the trust store
    last = chain[-1]
    if last["subject"] not in trusted_roots and last["issuer"] not in trusted_roots:
        return "untrusted"

    # 3. validity window, leaf up
    for cert in chain:
        if now < cert["not_before"]:
            return "not-yet-valid"
        if now > cert["not_after"]:
            return "expired"

    # 4. hostname match
    leaf = chain[0]
    if not any(_wildcard_matches(san, hostname) for san in leaf["sans"]):
        return "name-mismatch"

    return "ok"

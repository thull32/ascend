NO_EXPORT = "65535:65281"
NO_ADVERTISE = "65535:65282"


def to_int(address):
    a, b, c, d = (int(x) for x in address.split("."))
    return ((a * 256 + b) * 256 + c) * 256 + d


def entry_matches(prefix, entry):
    block, ge, le = entry
    net, length = prefix.split("/")
    length = int(length)
    bnet, blen = block.split("/")
    blen = int(blen)
    if not (ge <= length <= le) or length < blen:
        return False
    shift = 32 - blen
    return to_int(net) >> shift == to_int(bnet) >> shift


def term_matches(match, route):
    if "prefix_list" in match and not any(entry_matches(route["prefix"], e) for e in match["prefix_list"]):
        return False
    if "community" in match and match["community"] not in route["communities"]:
        return False
    return True


def removed(community, patterns):
    for p in patterns:
        if p.endswith("*") and community.startswith(p[:-1]):
            return True
        if community == p:
            return True
    return False


def run_policy(policy, routes, session):
    out = []
    for route in routes:
        comms = route["communities"]
        if session in ("ibgp", "ebgp") and NO_ADVERTISE in comms:
            continue
        if session == "ebgp" and NO_EXPORT in comms:
            continue
        for term in policy:
            if not term_matches(term.get("match", {}), route):
                continue
            if term["action"] == "deny":
                break
            sets = term.get("set", {})
            new = [c for c in comms if not removed(c, sets.get("remove", []))]
            for c in sets.get("add", []):
                if c not in new:
                    new.append(c)
            local_pref = sets.get("local_pref", route["local_pref"])
            if session == "ebgp":
                local_pref = None
            out.append([route["prefix"], sorted(new), local_pref])
            break
    return out

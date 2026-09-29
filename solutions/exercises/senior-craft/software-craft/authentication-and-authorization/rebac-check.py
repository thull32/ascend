def check(schema, tuples, obj, relation, user):
    index = {}
    for o, r, s in tuples:
        index.setdefault((o, r), []).append(s)

    visiting = set()

    def has(o, r):
        key = (o, r)
        if key in visiting:
            return False
        visiting.add(key)
        try:
            obj_type = o.split(":", 1)[0]
            rules = schema.get(obj_type, {}).get(r, ["this"])
            for rule in rules:
                if rule == "this":
                    for s in index.get((o, r), []):
                        if s == user:
                            return True
                        if "#" in s:
                            so, sr = s.split("#", 1)
                            if has(so, sr):
                                return True
                elif rule[0] == "computed":
                    if has(o, rule[1]):
                        return True
                elif rule[0] == "from":
                    link, r2 = rule[1], rule[2]
                    for other in index.get((o, link), []):
                        if has(other, r2):
                            return True
            return False
        finally:
            visiting.discard(key)

    return has(obj, relation)

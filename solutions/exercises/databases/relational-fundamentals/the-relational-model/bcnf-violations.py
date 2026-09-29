def bcnf_violations(attributes, fds):
    def closure(xs):
        result = set(xs)
        changed = True
        while changed:
            changed = False
            for lhs, rhs in fds:
                if set(lhs) <= result and not set(rhs) <= result:
                    result |= set(rhs)
                    changed = True
        return result

    all_attrs = set(attributes)
    violations = []
    for lhs, rhs in fds:
        if set(rhs) <= set(lhs):
            continue  # trivial
        if closure(lhs) != all_attrs:
            violations.append([lhs, rhs])
    return violations

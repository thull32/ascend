def find_violations(allowed, imports):
    violations = []
    for pair in imports:
        src, dst = pair
        src_layer = src.split("/")[0]
        dst_layer = dst.split("/")[0]
        if dst_layer == src_layer:
            continue
        if dst_layer in allowed.get(src_layer, []):
            continue
        violations.append([src, dst])
    return violations

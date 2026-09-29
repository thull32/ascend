def score_eval(cases, outputs):
    passed = 0
    failed = []
    by_tag = {}
    total = len(cases)

    for case in cases:
        cid = case["id"]
        tags = case.get("tags", [])
        must_include = case.get("must_include", [])
        must_not_include = case.get("must_not_include", [])
        output = outputs.get(cid)

        ok = False
        if output is not None:
            lower_out = output.lower()
            ok = all(s.lower() in lower_out for s in must_include) and not any(
                s.lower() in lower_out for s in must_not_include
            )

        if ok:
            passed += 1
        else:
            failed.append(cid)

        for tag in tags:
            if tag not in by_tag:
                by_tag[tag] = [0, 0]
            by_tag[tag][1] += 1
            if ok:
                by_tag[tag][0] += 1

    pass_rate = round(passed / total, 3) if total > 0 else 0
    return {"pass_rate": pass_rate, "failed": failed, "by_tag": by_tag}

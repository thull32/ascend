def review_calls(policy, calls):
    tools = policy.get("tools", {})
    tainted = False
    decisions = []

    for call in calls:
        name = call.get("name")
        args = call.get("args") or {}
        rule = tools.get(name)
        if rule is None:
            decisions.append("deny")
            continue

        denied = False
        if "paths" in rule:
            path = args.get("path")
            if not isinstance(path, str):
                denied = True
            else:
                prefixes = rule["paths"]
                if not any(path.startswith(pfx) for pfx in prefixes):
                    denied = True
                elif ".." in path.split("/"):
                    denied = True

        if not denied and "domains" in rule:
            to = args.get("to")
            if not isinstance(to, str) or "@" not in to:
                denied = True
            else:
                domain = to.rsplit("@", 1)[1].lower()
                domains = [d.lower() for d in rule["domains"]]
                if domain not in domains:
                    denied = True

        if denied:
            decisions.append("deny")
            continue

        decision = "allow"
        if rule.get("confirm") is True:
            decision = "confirm"
        elif rule.get("egress") is True and tainted:
            decision = "confirm"
        decisions.append(decision)

        if rule.get("untrusted") is True:
            tainted = True

    return decisions

def _norm(s):
    return s.strip().lower()


def lint_brief(brief):
    issues = []

    if len(brief["approvers"]) != 1:
        issues.append("approver")

    if not brief["decide_by"]:
        issues.append("deadline")

    norm_options = [_norm(o) for o in brief["options"]]
    has_do_nothing = "do nothing" in norm_options
    if not has_do_nothing:
        issues.append("do-nothing")

    alternatives = [o for o in norm_options if o != "do nothing"]
    if len(alternatives) < 2:
        issues.append("alternatives")

    rec = brief["recommendation"]
    if not rec or _norm(rec) not in norm_options:
        issues.append("recommendation")

    flip = brief["flip_condition"]
    if not flip or not flip.strip():
        issues.append("flip-condition")

    consulted = set(brief["consulted"])
    for contributor in brief["contributors"]:
        if contributor not in consulted:
            issues.append(f"unconsulted:{contributor}")

    return issues

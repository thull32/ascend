def rotate_refresh_tokens(events, grace):
    families = {}
    token_family = {}
    outcomes = []

    for event in events:
        t, kind = event[0], event[1]

        if kind == "login":
            family, token = event[2], event[3]
            families[family] = {
                "current": token,
                "previous": None,
                "rotated_at": None,
                "revoked": False,
            }
            token_family[token] = family
            outcomes.append("issued")

        elif kind == "refresh":
            presented, new_token = event[2], event[3]
            fam_id = token_family.get(presented)
            if fam_id is None:
                outcomes.append("invalid")
                continue
            fam = families[fam_id]
            if fam["revoked"]:
                outcomes.append("revoked")
                continue
            if presented == fam["current"]:
                fam["previous"] = fam["current"]
                fam["current"] = new_token
                fam["rotated_at"] = t
                token_family[new_token] = fam_id
                outcomes.append("rotated")
            elif (
                presented == fam["previous"]
                and fam["rotated_at"] is not None
                and t <= fam["rotated_at"] + grace
            ):
                outcomes.append("retry")
            else:
                fam["revoked"] = True
                outcomes.append("reuse_detected")

        elif kind == "logout":
            presented = event[2]
            fam_id = token_family.get(presented)
            if fam_id is None:
                outcomes.append("invalid")
                continue
            fam = families[fam_id]
            if fam["revoked"]:
                outcomes.append("revoked")
                continue
            fam["revoked"] = True
            outcomes.append("logged_out")

    return outcomes

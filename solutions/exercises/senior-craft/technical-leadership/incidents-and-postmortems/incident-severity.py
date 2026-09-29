_RESPONSE = {
    "SEV1": (True, True, 15, "required"),
    "SEV2": (True, True, 30, "required"),
    "SEV3": (False, False, None, "optional"),
    "SEV4": (False, False, None, "none"),
}


def classify_incident(incident):
    users_pct = incident["users_pct"]
    core_flow = incident["core_flow"]
    data_or_security = incident["data_or_security"]
    workaround = incident["workaround"]

    if data_or_security or (core_flow and users_pct > 25):
        sev = "SEV1"
    elif (core_flow and users_pct >= 5) or (
        not core_flow and users_pct > 25 and not workaround
    ):
        sev = "SEV2"
    elif users_pct > 0:
        sev = "SEV3"
    else:
        sev = "SEV4"

    page, ic, update_minutes, postmortem = _RESPONSE[sev]
    return {
        "sev": sev,
        "page": page,
        "ic": ic,
        "update_minutes": update_minutes,
        "postmortem": postmortem,
    }

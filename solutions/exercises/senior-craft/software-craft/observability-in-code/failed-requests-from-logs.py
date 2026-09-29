import json


def failed_requests(lines):
    failed = []
    seen = set()
    malformed = 0
    for line in lines:
        try:
            obj = json.loads(line)
        except (json.JSONDecodeError, ValueError):
            malformed += 1
            continue
        if not isinstance(obj, dict):
            malformed += 1
            continue
        rid = obj.get("request_id")
        if not isinstance(rid, str):
            continue
        level = obj.get("level")
        status = obj.get("status")
        is_num_fail = (
            isinstance(status, int) and not isinstance(status, bool) and status >= 500
        )
        if (level == "ERROR" or is_num_fail) and rid not in seen:
            seen.add(rid)
            failed.append(rid)
    return {"failed": failed, "malformed": malformed}

import math


def canary_gate(stages, policy):
    min_requests = policy["min_requests"]
    z = policy["z"]
    max_p99_ratio = policy["max_p99_ratio"]
    for i, stage in enumerate(stages):
        baseline = stage["baseline"]
        canary = stage["canary"]
        if canary["requests"] < min_requests:
            return {"decision": "hold", "stage": i, "reason": "insufficient_data"}
        expected = canary["requests"] * baseline["errors"] / baseline["requests"]
        limit = expected + z * math.sqrt(max(expected, 1))
        if canary["errors"] > limit:
            return {"decision": "rollback", "stage": i, "reason": "errors"}
        if canary["p99_ms"] > baseline["p99_ms"] * max_p99_ratio:
            return {"decision": "rollback", "stage": i, "reason": "latency"}
    return {"decision": "promote", "stage": len(stages) - 1, "reason": "ok"}

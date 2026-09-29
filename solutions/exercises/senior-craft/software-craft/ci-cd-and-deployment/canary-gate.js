function canary_gate(stages, policy) {
  const { min_requests, z, max_p99_ratio } = policy;
  for (let i = 0; i < stages.length; i++) {
    const { baseline, canary } = stages[i];
    if (canary.requests < min_requests) {
      return { decision: "hold", stage: i, reason: "insufficient_data" };
    }
    const expected = (canary.requests * baseline.errors) / baseline.requests;
    const limit = expected + z * Math.sqrt(Math.max(expected, 1));
    if (canary.errors > limit) {
      return { decision: "rollback", stage: i, reason: "errors" };
    }
    if (canary.p99_ms > baseline.p99_ms * max_p99_ratio) {
      return { decision: "rollback", stage: i, reason: "latency" };
    }
  }
  return { decision: "promote", stage: stages.length - 1, reason: "ok" };
}

function failed_requests(lines) {
  const failed = [];
  const seen = new Set();
  let malformed = 0;
  for (const line of lines) {
    let obj;
    try {
      obj = JSON.parse(line);
    } catch (e) {
      malformed++;
      continue;
    }
    if (typeof obj !== "object" || obj === null || Array.isArray(obj)) {
      malformed++;
      continue;
    }
    const rid = obj.request_id;
    if (typeof rid !== "string") continue;
    const status = obj.status;
    const isNumFail = typeof status === "number" && status >= 500;
    if ((obj.level === "ERROR" || isNumFail) && !seen.has(rid)) {
      seen.add(rid);
      failed.push(rid);
    }
  }
  return { failed, malformed };
}

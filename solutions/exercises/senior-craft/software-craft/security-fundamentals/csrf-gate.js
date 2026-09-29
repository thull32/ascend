function csrf_allowed(method, headers, expected_origin) {
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return true;
  if (!("x-requested-with" in headers)) return false;
  const expected = expected_origin.replace(/\/+$/, "");
  if ("origin" in headers) {
    return headers.origin.replace(/\/+$/, "") === expected;
  }
  if ("referer" in headers) {
    const referer = headers.referer;
    return referer === expected || referer.startsWith(expected + "/");
  }
  return true;
}

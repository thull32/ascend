function hostOf(origin) {
  const rest = origin.slice("http://".length);
  const idx = rest.indexOf(":");
  return idx !== -1 ? rest.slice(0, idx) : rest;
}

function isLocal(origin) {
  return origin.startsWith("http://") && ["localhost", "127.0.0.1"].includes(hostOf(origin));
}

function csrf_allows(method, headers, public_origin) {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(method)) return true;
  if (!("x-requested-with" in headers)) return false;

  const expected = public_origin.replace(/\/+$/, "");
  let claimed;

  if ("origin" in headers) {
    claimed = headers.origin.replace(/\/+$/, "");
  } else if ("referer" in headers) {
    const referer = headers.referer;
    const idx = referer.indexOf("://");
    if (idx === -1) return false;
    const after = referer.slice(idx + 3);
    let cut = after.length;
    for (const ch of ["/", "?", "#"]) {
      const p = after.indexOf(ch);
      if (p !== -1) cut = Math.min(cut, p);
    }
    claimed = referer.slice(0, idx + 3) + after.slice(0, cut);
  } else {
    return true;
  }

  if (claimed === expected) return true;
  if (isLocal(claimed) && isLocal(expected)) return true;
  return false;
}

function isIpv4(value) {
  const parts = value.split(".");
  if (parts.length !== 4) return false;
  for (const p of parts) {
    if (!/^[0-9]+$/.test(p)) return false;
    if (p.length < 1 || p.length > 3) return false;
    if (Number(p) > 255) return false;
  }
  return true;
}

function resolve_client_ip(headers, trusted_header, socket_ip) {
  if (trusted_header === null || trusted_header === undefined) return socket_ip;

  const target = trusted_header.toLowerCase();
  let value = null;
  for (const k of Object.keys(headers)) {
    if (k.toLowerCase() === target) {
      value = headers[k];
      break;
    }
  }

  if (value === null) return socket_ip;

  const candidate = value.trim();
  return isIpv4(candidate) ? candidate : socket_ip;
}

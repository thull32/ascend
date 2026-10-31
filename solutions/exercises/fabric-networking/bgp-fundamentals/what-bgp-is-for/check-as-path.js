function check_as_path(local_asn, peer_asn, as_path) {
  const kind = (asn) => {
    if ((asn >= 64512 && asn <= 65534) || (asn >= 4200000000 && asn <= 4294967294)) return "private";
    if ([0, 23456, 65535, 4294967295].includes(asn) || (asn >= 65552 && asn <= 131071)) return "reserved";
    return null;
  };
  if (as_path.length === 0) return ["malformed", null];
  if (as_path[0] !== peer_asn) return ["first-as", as_path[0]];
  if (as_path.includes(local_asn)) return ["loop", local_asn];
  for (const asn of as_path) {
    const k = kind(asn);
    if (k) return [k, asn];
  }
  return ["accept", null];
}

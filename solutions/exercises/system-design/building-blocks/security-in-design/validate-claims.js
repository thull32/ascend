function validate_claims(claims, now, expected) {
  const leeway = expected.leeway;

  if (claims.iss !== expected.iss) return "bad_issuer";

  const aud = claims.aud;
  const audList = Array.isArray(aud) ? aud : [aud];
  if (!audList.includes(expected.aud)) return "bad_audience";

  const exp = claims.exp;
  if (exp === undefined || exp === null || now >= exp + leeway) return "expired";

  const nbf = claims.nbf;
  if (nbf !== undefined && nbf !== null && now < nbf - leeway) return "not_yet_valid";

  const scope = claims.scope || "";
  const tokens = scope.split(/\s+/).filter(s => s.length > 0);
  if (!tokens.includes(expected.scope)) return "insufficient_scope";

  if (claims.tenant !== expected.tenant) return "wrong_tenant";

  return "ok";
}

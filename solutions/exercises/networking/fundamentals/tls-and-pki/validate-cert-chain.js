function wildcardMatches(pattern, hostname) {
  hostname = hostname.toLowerCase();
  pattern = pattern.toLowerCase();

  if (!pattern.startsWith("*.")) {
    return pattern === hostname;
  }

  const rest = pattern.slice(2);
  const dot = hostname.indexOf(".");
  if (dot <= 0) return false;
  const suffix = hostname.slice(dot + 1);
  return suffix === rest;
}

function validate_chain(hostname, chain, trusted_roots, now) {
  // 1. chain linkage
  for (let i = 0; i < chain.length - 1; i++) {
    if (chain[i].issuer !== chain[i + 1].subject) {
      return "broken-chain";
    }
    if (!chain[i + 1].is_ca) {
      return "not-a-ca";
    }
  }

  // 2. anchored in the trust store
  const last = chain[chain.length - 1];
  if (!trusted_roots.includes(last.subject) && !trusted_roots.includes(last.issuer)) {
    return "untrusted";
  }

  // 3. validity window, leaf up
  for (const cert of chain) {
    if (now < cert.not_before) return "not-yet-valid";
    if (now > cert.not_after) return "expired";
  }

  // 4. hostname match
  const leaf = chain[0];
  if (!leaf.sans.some((san) => wildcardMatches(san, hostname))) {
    return "name-mismatch";
  }

  return "ok";
}

function rotate_refresh_tokens(events, grace) {
  const families = new Map();
  const tokenFamily = new Map();
  const outcomes = [];

  for (const event of events) {
    const t = event[0];
    const kind = event[1];

    if (kind === "login") {
      const [, , family, token] = event;
      families.set(family, {
        current: token,
        previous: null,
        rotatedAt: null,
        revoked: false,
      });
      tokenFamily.set(token, family);
      outcomes.push("issued");
    } else if (kind === "refresh") {
      const [, , presented, newToken] = event;
      const famId = tokenFamily.get(presented);
      if (famId === undefined) {
        outcomes.push("invalid");
        continue;
      }
      const fam = families.get(famId);
      if (fam.revoked) {
        outcomes.push("revoked");
        continue;
      }
      if (presented === fam.current) {
        fam.previous = fam.current;
        fam.current = newToken;
        fam.rotatedAt = t;
        tokenFamily.set(newToken, famId);
        outcomes.push("rotated");
      } else if (
        presented === fam.previous &&
        fam.rotatedAt !== null &&
        t <= fam.rotatedAt + grace
      ) {
        outcomes.push("retry");
      } else {
        fam.revoked = true;
        outcomes.push("reuse_detected");
      }
    } else if (kind === "logout") {
      const presented = event[2];
      const famId = tokenFamily.get(presented);
      if (famId === undefined) {
        outcomes.push("invalid");
        continue;
      }
      const fam = families.get(famId);
      if (fam.revoked) {
        outcomes.push("revoked");
        continue;
      }
      fam.revoked = true;
      outcomes.push("logged_out");
    }
  }

  return outcomes;
}

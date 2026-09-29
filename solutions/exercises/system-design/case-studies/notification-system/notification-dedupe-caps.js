function plan_notifications(events, window_s, cap_per_hour) {
  const dedupe = new Map();
  const sends = new Map();
  const out = [];

  for (const [user, key, t] of events) {
    const dk = user + "|" + key;
    if (dedupe.has(dk) && t - dedupe.get(dk) < window_s) {
      out.push("duplicate");
      continue;
    }

    dedupe.set(dk, t);
    if (!sends.has(user)) sends.set(user, []);
    const userSends = sends.get(user);
    const countRecent = userSends.filter(s => t - s < 3600).length;
    if (countRecent >= cap_per_hour) {
      out.push("capped");
    } else {
      userSends.push(t);
      out.push("sent");
    }
  }

  return out;
}

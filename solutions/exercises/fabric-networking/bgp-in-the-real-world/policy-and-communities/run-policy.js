const NO_EXPORT = "65535:65281";
const NO_ADVERTISE = "65535:65282";

function toInt(address) {
  return address.split(".").reduce((acc, x) => acc * 256 + Number(x), 0);
}

function entryMatches(prefix, entry) {
  const [block, ge, le] = entry;
  const [net, lenStr] = prefix.split("/");
  const length = Number(lenStr);
  const [bnet, blenStr] = block.split("/");
  const blen = Number(blenStr);
  if (!(ge <= length && length <= le) || length < blen) return false;
  const size = 2 ** (32 - blen); // divide instead of >>: JS shifts are 32-bit signed and >> 32 is a no-op
  return Math.floor(toInt(net) / size) === Math.floor(toInt(bnet) / size);
}

function termMatches(match, route) {
  if (match.prefix_list && !match.prefix_list.some((e) => entryMatches(route.prefix, e))) return false;
  if (match.community !== undefined && !route.communities.includes(match.community)) return false;
  return true;
}

function removed(community, patterns) {
  return patterns.some((p) => (p.endsWith("*") ? community.startsWith(p.slice(0, -1)) : community === p));
}

function run_policy(policy, routes, session) {
  const out = [];
  for (const route of routes) {
    const comms = route.communities;
    if ((session === "ibgp" || session === "ebgp") && comms.includes(NO_ADVERTISE)) continue;
    if (session === "ebgp" && comms.includes(NO_EXPORT)) continue;
    for (const term of policy) {
      if (!termMatches(term.match || {}, route)) continue;
      if (term.action === "deny") break;
      const sets = term.set || {};
      const next = comms.filter((c) => !removed(c, sets.remove || []));
      for (const c of sets.add || []) if (!next.includes(c)) next.push(c);
      let localPref = sets.local_pref !== undefined ? sets.local_pref : route.local_pref;
      if (session === "ebgp") localPref = null;
      out.push([route.prefix, next.sort(), localPref]);
      break;
    }
  }
  return out;
}

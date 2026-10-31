function reflect(route, from_peer, peers, router_id, cluster_id) {
  const clusters = [...(route.cluster_list || [])];
  if (route.originator_id === router_id) return { action: "drop", reason: "originator-loop" };
  if (clusters.includes(cluster_id)) return { action: "drop", reason: "cluster-loop" };
  const kind = peers[from_peer].kind;
  const ibgp = Object.keys(peers).filter(
    (n) => (peers[n].kind === "client" || peers[n].kind === "non-client") && n !== from_peer,
  );
  const targets = kind === "non-client" ? ibgp.filter((n) => peers[n].kind === "client") : ibgp;
  const out = { ...route, cluster_list: clusters };
  if (kind !== "ebgp") {
    out.originator_id = route.originator_id || peers[from_peer].router_id;
    out.cluster_list = [cluster_id, ...clusters];
  }
  return { action: "send", to: targets.sort(), route: out };
}

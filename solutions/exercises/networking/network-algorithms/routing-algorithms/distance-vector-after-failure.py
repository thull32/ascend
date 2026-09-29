def dv_after_failure(n, edges, dest, failed, split_horizon, infinity):
    def build_adj(edge_list):
        adj = {i: [] for i in range(n)}
        for u, v, c in edge_list:
            adj[u].append((v, c))
            adj[v].append((u, c))
        for k in adj:
            adj[k].sort()
        return adj

    def run_round(adj, dist_prev, hop_prev):
        dist = list(dist_prev)
        hop = list(hop_prev)
        for x in range(n):
            if x == dest:
                continue
            best_dist = infinity
            best_hop = None
            for y, c in adj[x]:
                if split_horizon and hop_prev[y] == x:
                    adv = infinity
                else:
                    adv = dist_prev[y]
                cand = min(c + adv, infinity)
                if cand < best_dist:
                    best_dist = cand
                    best_hop = y
            dist[x] = best_dist
            hop[x] = best_hop
        return dist, hop

    def converge(adj, dist, hop):
        rounds = []
        while True:
            new_dist, new_hop = run_round(adj, dist, hop)
            if new_dist == dist and new_hop == hop:
                return dist, hop, rounds
            dist, hop = new_dist, new_hop
            rounds.append(list(dist))

    def remove_edge(edge_list, failed_pair):
        fu, fv = failed_pair
        out = []
        removed = False
        for e in edge_list:
            if not removed and {e[0], e[1]} == {fu, fv}:
                removed = True
                continue
            out.append(e)
        return out

    dist0 = [infinity] * n
    dist0[dest] = 0
    hop0 = [None] * n

    adj_full = build_adj(edges)
    dist1, hop1, _ = converge(adj_full, dist0, hop0)

    adj2 = build_adj(remove_edge(edges, failed))
    _dist2, _hop2, rounds2 = converge(adj2, dist1, hop1)
    return rounds2

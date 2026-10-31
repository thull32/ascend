---
problem: bgp-best-path
args: [[{"local_pref": 100, "as_path": [64501, 64511], "origin": "IGP", "med": 100, "neighbor_as": 64501, "ebgp": false, "igp_cost": 10, "router_id": "10.255.1.201"}, {"local_pref": 100, "as_path": [64502, 64511], "origin": "IGP", "med": 50, "neighbor_as": 64502, "ebgp": false, "igp_cost": 20, "router_id": "10.255.1.202"}, {"local_pref": 100, "as_path": [64501, 64511], "origin": "IGP", "med": 20, "neighbor_as": 64501, "ebgp": false, "igp_cost": 30, "router_id": "10.255.2.201"}]]
frames: 196
source: 212b6b283fa99f1e
---
@0
Three routes to one prefix, and the router must pick one. The decision process is a ladder of attributes, and six of the seven rungs are lexicographic: once a route is worse on an earlier rung, nothing later can save it. So every rung is a filter that keeps all the routes tied for the best value and drops the rest. The one rung that breaks the pattern is MED, which only means something between routes from the same neighbouring network. Here, P1 and P3 come from ISP1, AS 64501, with MEDs 100 and 20. P2 comes from ISP2, AS 64502, with MED 50. All three are iBGP, with IGP costs 10, 20 and 30. We start by pairing each route with its index, so the winner can be reported at the end.

@1-27
Rung one, local preference, where higher wins. The helper keeps the lowest key, so we hand it the negated preference. It walks the routes once to find the best key, minus 100, then walks them again to keep every route that matches. All three carry 100, so all three survive.

@28-81
Rungs two and three run the same helper with different keys. The AS path length: every route crossed two networks, so nobody falls. The origin rank: all three entered BGP as IGP, rank zero, so nobody falls again. Three rungs in, three routes still alive. Their local preference, path length and origin are now the best there is, and that matters for what comes next.

@82-89
Rung four, MED, and the code changes shape. Instead of one best value, we build a map from each neighbouring AS to the lowest MED seen among the survivors. P1 comes first: group 64501, MED 100. The map is empty, so 64501's lowest is 100.

@90-96
P2: group 64502, MED 50. A new group, so 64502's lowest is 50. Notice that 50 is below P1's 100, and the code never compares them. They are on two different neighbours' scales.

@97-104
P3: group 64501 again, MED 20. Twenty beats the 100 already there, so 64501's lowest drops to 20. The map now reads: 64501 at 20, 64502 at 50.

@105-114
Now the filter. Each route is checked against its own group's lowest. P1 has 100 against its group's 20, and it is out. P2 has 50 against its group's 50, and it stays, even though P3's MED of 20 is lower. P3 has 20 against 20, and it stays. Two survivors, one from each neighbour.

@115-134
Rung five, eBGP over iBGP. Both survivors were relayed inside our own AS, so both have key one, and both stay.

@135-154
Rung six, the IGP cost to reach the exit. P2 costs 20, P3 costs 30. The best is 20, and only P2 matches. This is where the decision is made.

@155-193
Rung seven still runs on the single survivor. The router ID, 10.255.1.202, is split into four octets and packed into one unsigned 32-bit number, about 184 million, so IDs compare as numbers rather than as text. One route in, one route out.

@194-195
We return the index of the first survivor: 1, which is P2.

Each rung is one or two passes over the survivors, and there are seven rungs, so time is linear in the number of routes, with linear space for the survivor list and a small map for the MED groups. The mistake this problem is built around is comparing MED across neighbours. One sort key with MED in it would pick P3, because 20 is the lowest MED overall, although it belongs to a different scale from P2's 50. The second classic is building the MED groups from the whole input rather than from the routes still alive after origin, which can empty a group entirely.

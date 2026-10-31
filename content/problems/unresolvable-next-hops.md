---
slug: unresolvable-next-hops
title: Unresolvable Next Hops
difficulty: medium
patterns: [graph]
lists: [network-practice, ascend-150]
companies: [cisco, juniper, arista, nvidia]
order: 6
lesson: fabric-networking/bgp-fundamentals/ibgp-loops-and-next-hops
hints:
  - "A BGP path is usable only if the IGP can reach the router that owns its next-hop address. Whether a router is reachable from one starting router is a single graph question, so answer it once for the whole table, not once per route."
  - "Build an adjacency list from the links whose state is up, adding each link in both directions, and run one BFS or DFS from the given router. Separately, map every loopback address to the router that owns it. A path resolves when its next hop's owner is in the reached set; an address nobody owns never resolves."
  - "A prefix can appear several times with different next hops (several paths). It is reported only if none of its paths resolves. Keep one flag per prefix, in order of first appearance, and set it the moment any path resolves."
signatures:
  python:
    name: unresolvable_next_hops
    starter: |
      def unresolvable_next_hops(router: str, loopbacks: list[list[str]], links: list[list[str]], routes: list[list[str]]) -> list[str]:
          pass
  javascript:
    name: unresolvable_next_hops
    starter: |
      function unresolvable_next_hops(router, loopbacks, links, routes) {
      }
tests:
  - args: ["leaf1.ams", [["spine1.ams", "10.255.1.1"], ["spine2.ams", "10.255.1.2"], ["leaf1.ams", "10.255.1.11"], ["leaf2.ams", "10.255.1.12"], ["leaf3.ams", "10.255.1.13"], ["leaf4.ams", "10.255.1.14"], ["gw1.ams", "10.255.1.201"], ["gw2.ams", "10.255.1.202"]], [["leaf1.ams", "spine1.ams", "up"], ["leaf1.ams", "spine2.ams", "up"], ["leaf2.ams", "spine1.ams", "up"], ["leaf2.ams", "spine2.ams", "up"], ["leaf3.ams", "spine1.ams", "down"], ["leaf3.ams", "spine2.ams", "down"], ["leaf4.ams", "spine1.ams", "up"], ["leaf4.ams", "spine2.ams", "up"], ["gw1.ams", "spine1.ams", "up"], ["gw1.ams", "spine2.ams", "up"], ["gw2.ams", "spine1.ams", "down"], ["gw2.ams", "spine2.ams", "up"]], [["10.1.1.0/24", "10.255.1.11"], ["10.1.2.0/24", "10.255.1.13"], ["10.1.2.20/32", "10.255.1.13"], ["0.0.0.0/0", "10.255.1.201"], ["198.51.100.0/24", "10.255.1.202"], ["192.0.2.0/24", "198.51.100.2"]]]
    expected: ["10.1.2.0/24", "10.1.2.20/32", "192.0.2.0/24"]
    label: "leaf3.ams cut off, gw2.ams on one spine, a missing next-hop-self"
  - args: ["leaf3.ams", [["spine1.ams", "10.255.1.1"], ["spine2.ams", "10.255.1.2"], ["leaf1.ams", "10.255.1.11"], ["leaf2.ams", "10.255.1.12"], ["leaf3.ams", "10.255.1.13"], ["leaf4.ams", "10.255.1.14"], ["spine1.sin", "10.255.2.1"], ["spine2.sin", "10.255.2.2"], ["leaf1.sin", "10.255.2.11"], ["leaf2.sin", "10.255.2.12"], ["leaf3.sin", "10.255.2.13"], ["leaf4.sin", "10.255.2.14"]], [["leaf1.ams", "spine1.ams", "up"], ["leaf1.ams", "spine2.ams", "up"], ["leaf2.ams", "spine1.ams", "up"], ["leaf2.ams", "spine2.ams", "up"], ["leaf3.ams", "spine1.ams", "up"], ["leaf3.ams", "spine2.ams", "up"], ["leaf4.ams", "spine1.ams", "up"], ["leaf4.ams", "spine2.ams", "up"], ["leaf1.sin", "spine1.sin", "up"], ["leaf1.sin", "spine2.sin", "up"], ["leaf2.sin", "spine1.sin", "up"], ["leaf2.sin", "spine2.sin", "up"], ["leaf3.sin", "spine1.sin", "up"], ["leaf3.sin", "spine2.sin", "up"], ["leaf4.sin", "spine1.sin", "up"], ["leaf4.sin", "spine2.sin", "up"], ["spine1.ams", "spine1.sin", "down"], ["spine2.ams", "spine2.sin", "down"]], [["10.1.1.0/24", "10.255.2.12"], ["10.1.1.0/24", "10.255.1.11"], ["10.1.1.11/32", "10.255.2.12"], ["10.1.2.0/24", "10.255.1.13"], ["10.1.2.0/24", "10.255.2.13"], ["10.2.0.0/16", "10.255.2.11"], ["10.2.0.0/16", "10.255.2.14"]]]
    expected: ["10.1.1.11/32", "10.2.0.0/16"]
    label: "both inter-site circuits down: sin partitioned, multipath prefixes"
  - args: ["leaf3.ams", [["spine1.ams", "10.255.1.1"], ["spine2.ams", "10.255.1.2"], ["leaf1.ams", "10.255.1.11"], ["leaf2.ams", "10.255.1.12"], ["leaf3.ams", "10.255.1.13"], ["leaf4.ams", "10.255.1.14"], ["spine1.sin", "10.255.2.1"], ["spine2.sin", "10.255.2.2"], ["leaf1.sin", "10.255.2.11"], ["leaf2.sin", "10.255.2.12"], ["leaf3.sin", "10.255.2.13"], ["leaf4.sin", "10.255.2.14"]], [["leaf1.ams", "spine1.ams", "up"], ["leaf1.ams", "spine2.ams", "up"], ["leaf2.ams", "spine1.ams", "up"], ["leaf2.ams", "spine2.ams", "up"], ["leaf3.ams", "spine1.ams", "up"], ["leaf3.ams", "spine2.ams", "up"], ["leaf4.ams", "spine1.ams", "up"], ["leaf4.ams", "spine2.ams", "up"], ["leaf1.sin", "spine1.sin", "up"], ["leaf1.sin", "spine2.sin", "up"], ["leaf2.sin", "spine1.sin", "up"], ["leaf2.sin", "spine2.sin", "up"], ["leaf3.sin", "spine1.sin", "up"], ["leaf3.sin", "spine2.sin", "up"], ["leaf4.sin", "spine1.sin", "up"], ["leaf4.sin", "spine2.sin", "up"], ["spine1.ams", "spine1.sin", "up"], ["spine2.ams", "spine2.sin", "down"]], [["10.1.1.0/24", "10.255.2.12"], ["10.1.1.0/24", "10.255.1.11"], ["10.1.1.11/32", "10.255.2.12"], ["10.1.2.0/24", "10.255.1.13"], ["10.1.2.0/24", "10.255.2.13"], ["10.2.0.0/16", "10.255.2.11"], ["10.2.0.0/16", "10.255.2.14"]]]
    expected: []
    label: "one circuit still up: the detour keeps every next hop reachable"
  - args: ["leaf1.ams", [["leaf1.ams", "10.255.1.11"], ["spine1.ams", "10.255.1.1"]], [["leaf1.ams", "spine1.ams", "down"]], [["10.1.1.0/24", "10.255.1.11"], ["10.255.1.1/32", "10.255.1.1"], ["192.0.2.0/24", "192.0.2.1"]]]
    expected: ["10.255.1.1/32", "192.0.2.0/24"]
    label: "every link down: only the router's own loopback resolves"
  - args: ["spine1.ams", [["spine1.ams", "10.255.1.1"], ["spine2.ams", "10.255.1.2"], ["leaf1.ams", "10.255.1.11"], ["leaf2.ams", "10.255.1.12"], ["leaf3.ams", "10.255.1.13"], ["leaf4.ams", "10.255.1.14"], ["gw1.ams", "10.255.1.201"], ["gw2.ams", "10.255.1.202"]], [["leaf1.ams", "spine1.ams", "up"], ["leaf1.ams", "spine2.ams", "up"], ["leaf2.ams", "spine1.ams", "up"], ["leaf2.ams", "spine2.ams", "up"], ["leaf3.ams", "spine1.ams", "down"], ["leaf3.ams", "spine2.ams", "down"], ["leaf4.ams", "spine1.ams", "up"], ["leaf4.ams", "spine2.ams", "up"], ["gw1.ams", "spine1.ams", "up"], ["gw1.ams", "spine2.ams", "up"], ["gw2.ams", "spine1.ams", "down"], ["gw2.ams", "spine2.ams", "up"]], []]
    expected: []
    label: "empty BGP table"
  - args: ["gw1.ams", [["gw1.ams", "10.255.1.201"], ["spine1.ams", "10.255.1.1"], ["leaf1.ams", "10.255.1.11"], ["leaf2.ams", "10.255.1.12"]], [["gw1.ams", "spine1.ams", "down"], ["spine1.ams", "gw1.ams", "up"], ["leaf1.ams", "spine1.ams", "down"], ["spine1.ams", "leaf2.ams", "up"]], [["10.1.1.0/24", "10.255.1.11"], ["10.1.2.0/24", "10.255.1.12"], ["10.1.1.0/24", "10.255.1.12"], ["10.1.3.0/24", "10.255.1.11"]]]
    expected: ["10.1.3.0/24"]
    hidden: true
    label: "parallel links and reversed link order"
  - args: ["leaf2.ams", [["leaf2.ams", "10.255.1.12"], ["leaf4.ams", "10.255.1.14"], ["rr1.ams", "10.255.1.101"], ["leaf9.ams", "10.255.1.19"]], [["leaf2.ams", "spine2.ams", "up"], ["spine2.ams", "leaf4.ams", "up"], ["spine2.ams", "rr1.ams", "up"]], [["203.0.113.0/24", "10.255.1.19"], ["10.1.1.0/24", "10.255.1.14"], ["198.51.100.0/25", "10.255.1.19"], ["203.0.113.0/24", "198.51.100.1"], ["198.51.100.0/25", "10.255.1.250"], ["10.255.1.101/32", "10.255.1.101"]]]
    expected: ["203.0.113.0/24", "198.51.100.0/25"]
    hidden: true
    label: "transit spine with no loopback listed, a decommissioned leaf, repeated dead prefix"
  - args: ["r1.sjc", [["r1.sjc", "10.255.3.21"], ["r2.sjc", "10.255.3.22"], ["r3.sjc", "10.255.3.23"], ["r4.sjc", "10.255.3.24"], ["r5.sjc", "10.255.3.25"], ["r6.sjc", "10.255.3.26"], ["r7.sjc", "10.255.3.27"], ["r8.sjc", "10.255.3.28"]], [["r1.sjc", "r2.sjc", "up"], ["r2.sjc", "r3.sjc", "up"], ["r3.sjc", "r4.sjc", "up"], ["r4.sjc", "r5.sjc", "up"], ["r5.sjc", "r6.sjc", "down"], ["r6.sjc", "r7.sjc", "up"], ["r7.sjc", "r8.sjc", "up"], ["r8.sjc", "r6.sjc", "up"]], [["10.3.8.0/24", "10.255.3.28"], ["10.3.7.0/24", "10.255.3.27"], ["10.3.6.0/24", "10.255.3.26"], ["10.3.5.0/24", "10.255.3.25"], ["10.3.4.0/24", "10.255.3.24"], ["10.3.3.0/24", "10.255.3.23"], ["10.3.2.0/24", "10.255.3.22"], ["10.3.1.0/24", "10.255.3.21"]]]
    expected: ["10.3.8.0/24", "10.3.7.0/24", "10.3.6.0/24"]
    hidden: true
    label: "a chain broken in the middle: everything past the break"
  - args: ["leaf5.ams", [["spine1.ams", "10.255.1.1"], ["spine2.ams", "10.255.1.2"], ["spine3.ams", "10.255.1.3"], ["spine4.ams", "10.255.1.4"], ["leaf1.ams", "10.255.1.11"], ["leaf2.ams", "10.255.1.12"], ["leaf3.ams", "10.255.1.13"], ["leaf4.ams", "10.255.1.14"], ["leaf5.ams", "10.255.1.15"], ["leaf6.ams", "10.255.1.16"], ["leaf7.ams", "10.255.1.17"], ["leaf8.ams", "10.255.1.18"], ["leaf9.ams", "10.255.1.19"], ["leaf10.ams", "10.255.1.20"], ["leaf11.ams", "10.255.1.21"], ["leaf12.ams", "10.255.1.22"], ["leaf13.ams", "10.255.1.23"], ["leaf14.ams", "10.255.1.24"], ["leaf15.ams", "10.255.1.25"], ["leaf16.ams", "10.255.1.26"], ["rr1.ams", "10.255.1.101"], ["rr2.ams", "10.255.1.102"], ["gw1.ams", "10.255.1.201"], ["gw2.ams", "10.255.1.202"], ["spine1.sin", "10.255.2.1"], ["spine2.sin", "10.255.2.2"], ["spine3.sin", "10.255.2.3"], ["spine4.sin", "10.255.2.4"], ["leaf1.sin", "10.255.2.11"], ["leaf2.sin", "10.255.2.12"], ["leaf3.sin", "10.255.2.13"], ["leaf4.sin", "10.255.2.14"], ["leaf5.sin", "10.255.2.15"], ["leaf6.sin", "10.255.2.16"], ["leaf7.sin", "10.255.2.17"], ["leaf8.sin", "10.255.2.18"], ["leaf9.sin", "10.255.2.19"], ["leaf10.sin", "10.255.2.20"], ["leaf11.sin", "10.255.2.21"], ["leaf12.sin", "10.255.2.22"], ["leaf13.sin", "10.255.2.23"], ["leaf14.sin", "10.255.2.24"], ["leaf15.sin", "10.255.2.25"], ["leaf16.sin", "10.255.2.26"], ["rr1.sin", "10.255.2.101"], ["rr2.sin", "10.255.2.102"], ["gw1.sin", "10.255.2.201"], ["gw2.sin", "10.255.2.202"], ["spine1.sjc", "10.255.3.1"], ["spine2.sjc", "10.255.3.2"], ["spine3.sjc", "10.255.3.3"], ["spine4.sjc", "10.255.3.4"], ["leaf1.sjc", "10.255.3.11"], ["leaf2.sjc", "10.255.3.12"], ["leaf3.sjc", "10.255.3.13"], ["leaf4.sjc", "10.255.3.14"], ["leaf5.sjc", "10.255.3.15"], ["leaf6.sjc", "10.255.3.16"], ["leaf7.sjc", "10.255.3.17"], ["leaf8.sjc", "10.255.3.18"], ["leaf9.sjc", "10.255.3.19"], ["leaf10.sjc", "10.255.3.20"], ["leaf11.sjc", "10.255.3.21"], ["leaf12.sjc", "10.255.3.22"], ["leaf13.sjc", "10.255.3.23"], ["leaf14.sjc", "10.255.3.24"], ["leaf15.sjc", "10.255.3.25"], ["leaf16.sjc", "10.255.3.26"], ["rr1.sjc", "10.255.3.101"], ["rr2.sjc", "10.255.3.102"], ["gw1.sjc", "10.255.3.201"], ["gw2.sjc", "10.255.3.202"]], [["leaf1.ams", "spine1.ams", "up"], ["leaf1.ams", "spine2.ams", "down"], ["leaf1.ams", "spine3.ams", "up"], ["leaf1.ams", "spine4.ams", "up"], ["leaf2.ams", "spine1.ams", "up"], ["leaf2.ams", "spine2.ams", "down"], ["leaf2.ams", "spine3.ams", "up"], ["leaf2.ams", "spine4.ams", "up"], ["leaf3.ams", "spine1.ams", "up"], ["leaf3.ams", "spine2.ams", "up"], ["leaf3.ams", "spine3.ams", "up"], ["leaf3.ams", "spine4.ams", "up"], ["leaf4.ams", "spine1.ams", "up"], ["leaf4.ams", "spine2.ams", "up"], ["leaf4.ams", "spine3.ams", "up"], ["leaf4.ams", "spine4.ams", "up"], ["leaf5.ams", "spine1.ams", "up"], ["leaf5.ams", "spine2.ams", "up"], ["leaf5.ams", "spine3.ams", "up"], ["leaf5.ams", "spine4.ams", "up"], ["leaf6.ams", "spine1.ams", "up"], ["leaf6.ams", "spine2.ams", "up"], ["leaf6.ams", "spine3.ams", "up"], ["leaf6.ams", "spine4.ams", "up"], ["leaf7.ams", "spine1.ams", "up"], ["leaf7.ams", "spine2.ams", "down"], ["leaf7.ams", "spine3.ams", "up"], ["leaf7.ams", "spine4.ams", "up"], ["leaf8.ams", "spine1.ams", "up"], ["leaf8.ams", "spine2.ams", "up"], ["leaf8.ams", "spine3.ams", "up"], ["leaf8.ams", "spine4.ams", "up"], ["leaf9.ams", "spine1.ams", "up"], ["leaf9.ams", "spine2.ams", "up"], ["leaf9.ams", "spine3.ams", "up"], ["leaf9.ams", "spine4.ams", "up"], ["leaf10.ams", "spine1.ams", "down"], ["leaf10.ams", "spine2.ams", "up"], ["leaf10.ams", "spine3.ams", "up"], ["leaf10.ams", "spine4.ams", "up"], ["leaf11.ams", "spine1.ams", "up"], ["leaf11.ams", "spine2.ams", "up"], ["leaf11.ams", "spine3.ams", "up"], ["leaf11.ams", "spine4.ams", "up"], ["leaf12.ams", "spine1.ams", "up"], ["leaf12.ams", "spine2.ams", "down"], ["leaf12.ams", "spine3.ams", "down"], ["leaf12.ams", "spine4.ams", "down"], ["leaf13.ams", "spine1.ams", "up"], ["leaf13.ams", "spine2.ams", "up"], ["leaf13.ams", "spine3.ams", "up"], ["leaf13.ams", "spine4.ams", "up"], ["leaf14.ams", "spine1.ams", "up"], ["leaf14.ams", "spine2.ams", "up"], ["leaf14.ams", "spine3.ams", "up"], ["leaf14.ams", "spine4.ams", "up"], ["leaf15.ams", "spine1.ams", "up"], ["leaf15.ams", "spine2.ams", "up"], ["leaf15.ams", "spine3.ams", "up"], ["leaf15.ams", "spine4.ams", "up"], ["leaf16.ams", "spine1.ams", "up"], ["leaf16.ams", "spine2.ams", "up"], ["leaf16.ams", "spine3.ams", "up"], ["leaf16.ams", "spine4.ams", "down"], ["rr1.ams", "spine1.ams", "up"], ["rr1.ams", "spine2.ams", "up"], ["rr1.ams", "spine3.ams", "up"], ["rr1.ams", "spine4.ams", "down"], ["rr2.ams", "spine1.ams", "up"], ["rr2.ams", "spine2.ams", "up"], ["rr2.ams", "spine3.ams", "up"], ["rr2.ams", "spine4.ams", "up"], ["gw1.ams", "spine1.ams", "up"], ["gw1.ams", "spine2.ams", "up"], ["gw1.ams", "spine3.ams", "down"], ["gw1.ams", "spine4.ams", "up"], ["gw2.ams", "spine1.ams", "up"], ["gw2.ams", "spine2.ams", "up"], ["gw2.ams", "spine3.ams", "up"], ["gw2.ams", "spine4.ams", "up"], ["leaf1.sin", "spine1.sin", "up"], ["leaf1.sin", "spine2.sin", "down"], ["leaf1.sin", "spine3.sin", "down"], ["leaf1.sin", "spine4.sin", "up"], ["leaf2.sin", "spine1.sin", "up"], ["leaf2.sin", "spine2.sin", "up"], ["leaf2.sin", "spine3.sin", "up"], ["leaf2.sin", "spine4.sin", "up"], ["leaf3.sin", "spine1.sin", "up"], ["leaf3.sin", "spine2.sin", "up"], ["leaf3.sin", "spine3.sin", "down"], ["leaf3.sin", "spine4.sin", "down"], ["leaf4.sin", "spine1.sin", "up"], ["leaf4.sin", "spine2.sin", "up"], ["leaf4.sin", "spine3.sin", "up"], ["leaf4.sin", "spine4.sin", "up"], ["leaf5.sin", "spine1.sin", "up"], ["leaf5.sin", "spine2.sin", "up"], ["leaf5.sin", "spine3.sin", "up"], ["leaf5.sin", "spine4.sin", "up"], ["leaf6.sin", "spine1.sin", "up"], ["leaf6.sin", "spine2.sin", "up"], ["leaf6.sin", "spine3.sin", "up"], ["leaf6.sin", "spine4.sin", "up"], ["leaf7.sin", "spine1.sin", "down"], ["leaf7.sin", "spine2.sin", "up"], ["leaf7.sin", "spine3.sin", "up"], ["leaf7.sin", "spine4.sin", "up"], ["leaf8.sin", "spine1.sin", "up"], ["leaf8.sin", "spine2.sin", "up"], ["leaf8.sin", "spine3.sin", "up"], ["leaf8.sin", "spine4.sin", "up"], ["leaf9.sin", "spine1.sin", "up"], ["leaf9.sin", "spine2.sin", "up"], ["leaf9.sin", "spine3.sin", "up"], ["leaf9.sin", "spine4.sin", "up"], ["leaf10.sin", "spine1.sin", "up"], ["leaf10.sin", "spine2.sin", "up"], ["leaf10.sin", "spine3.sin", "up"], ["leaf10.sin", "spine4.sin", "up"], ["leaf11.sin", "spine1.sin", "down"], ["leaf11.sin", "spine2.sin", "up"], ["leaf11.sin", "spine3.sin", "up"], ["leaf11.sin", "spine4.sin", "up"], ["leaf12.sin", "spine1.sin", "down"], ["leaf12.sin", "spine2.sin", "up"], ["leaf12.sin", "spine3.sin", "up"], ["leaf12.sin", "spine4.sin", "up"], ["leaf13.sin", "spine1.sin", "up"], ["leaf13.sin", "spine2.sin", "up"], ["leaf13.sin", "spine3.sin", "down"], ["leaf13.sin", "spine4.sin", "up"], ["leaf14.sin", "spine1.sin", "up"], ["leaf14.sin", "spine2.sin", "up"], ["leaf14.sin", "spine3.sin", "up"], ["leaf14.sin", "spine4.sin", "up"], ["leaf15.sin", "spine1.sin", "up"], ["leaf15.sin", "spine2.sin", "up"], ["leaf15.sin", "spine3.sin", "down"], ["leaf15.sin", "spine4.sin", "up"], ["leaf16.sin", "spine1.sin", "up"], ["leaf16.sin", "spine2.sin", "up"], ["leaf16.sin", "spine3.sin", "up"], ["leaf16.sin", "spine4.sin", "up"], ["rr1.sin", "spine1.sin", "up"], ["rr1.sin", "spine2.sin", "up"], ["rr1.sin", "spine3.sin", "up"], ["rr1.sin", "spine4.sin", "up"], ["rr2.sin", "spine1.sin", "up"], ["rr2.sin", "spine2.sin", "up"], ["rr2.sin", "spine3.sin", "up"], ["rr2.sin", "spine4.sin", "down"], ["gw1.sin", "spine1.sin", "up"], ["gw1.sin", "spine2.sin", "up"], ["gw1.sin", "spine3.sin", "up"], ["gw1.sin", "spine4.sin", "up"], ["gw2.sin", "spine1.sin", "up"], ["gw2.sin", "spine2.sin", "up"], ["gw2.sin", "spine3.sin", "up"], ["gw2.sin", "spine4.sin", "up"], ["leaf1.sjc", "spine1.sjc", "up"], ["leaf1.sjc", "spine2.sjc", "up"], ["leaf1.sjc", "spine3.sjc", "up"], ["leaf1.sjc", "spine4.sjc", "up"], ["leaf2.sjc", "spine1.sjc", "up"], ["leaf2.sjc", "spine2.sjc", "up"], ["leaf2.sjc", "spine3.sjc", "down"], ["leaf2.sjc", "spine4.sjc", "up"], ["leaf3.sjc", "spine1.sjc", "up"], ["leaf3.sjc", "spine2.sjc", "up"], ["leaf3.sjc", "spine3.sjc", "down"], ["leaf3.sjc", "spine4.sjc", "up"], ["leaf4.sjc", "spine1.sjc", "up"], ["leaf4.sjc", "spine2.sjc", "up"], ["leaf4.sjc", "spine3.sjc", "up"], ["leaf4.sjc", "spine4.sjc", "up"], ["leaf5.sjc", "spine1.sjc", "up"], ["leaf5.sjc", "spine2.sjc", "up"], ["leaf5.sjc", "spine3.sjc", "up"], ["leaf5.sjc", "spine4.sjc", "up"], ["leaf6.sjc", "spine1.sjc", "up"], ["leaf6.sjc", "spine2.sjc", "down"], ["leaf6.sjc", "spine3.sjc", "up"], ["leaf6.sjc", "spine4.sjc", "up"], ["leaf7.sjc", "spine1.sjc", "up"], ["leaf7.sjc", "spine2.sjc", "up"], ["leaf7.sjc", "spine3.sjc", "up"], ["leaf7.sjc", "spine4.sjc", "up"], ["leaf8.sjc", "spine1.sjc", "up"], ["leaf8.sjc", "spine2.sjc", "up"], ["leaf8.sjc", "spine3.sjc", "up"], ["leaf8.sjc", "spine4.sjc", "up"], ["leaf9.sjc", "spine1.sjc", "up"], ["leaf9.sjc", "spine2.sjc", "up"], ["leaf9.sjc", "spine3.sjc", "up"], ["leaf9.sjc", "spine4.sjc", "up"], ["leaf10.sjc", "spine1.sjc", "up"], ["leaf10.sjc", "spine2.sjc", "up"], ["leaf10.sjc", "spine3.sjc", "down"], ["leaf10.sjc", "spine4.sjc", "up"], ["leaf11.sjc", "spine1.sjc", "up"], ["leaf11.sjc", "spine2.sjc", "up"], ["leaf11.sjc", "spine3.sjc", "up"], ["leaf11.sjc", "spine4.sjc", "up"], ["leaf12.sjc", "spine1.sjc", "up"], ["leaf12.sjc", "spine2.sjc", "up"], ["leaf12.sjc", "spine3.sjc", "down"], ["leaf12.sjc", "spine4.sjc", "up"], ["leaf13.sjc", "spine1.sjc", "up"], ["leaf13.sjc", "spine2.sjc", "up"], ["leaf13.sjc", "spine3.sjc", "up"], ["leaf13.sjc", "spine4.sjc", "up"], ["leaf14.sjc", "spine1.sjc", "up"], ["leaf14.sjc", "spine2.sjc", "up"], ["leaf14.sjc", "spine3.sjc", "up"], ["leaf14.sjc", "spine4.sjc", "up"], ["leaf15.sjc", "spine1.sjc", "up"], ["leaf15.sjc", "spine2.sjc", "up"], ["leaf15.sjc", "spine3.sjc", "up"], ["leaf15.sjc", "spine4.sjc", "up"], ["leaf16.sjc", "spine1.sjc", "up"], ["leaf16.sjc", "spine2.sjc", "up"], ["leaf16.sjc", "spine3.sjc", "up"], ["leaf16.sjc", "spine4.sjc", "up"], ["rr1.sjc", "spine1.sjc", "up"], ["rr1.sjc", "spine2.sjc", "up"], ["rr1.sjc", "spine3.sjc", "up"], ["rr1.sjc", "spine4.sjc", "up"], ["rr2.sjc", "spine1.sjc", "up"], ["rr2.sjc", "spine2.sjc", "up"], ["rr2.sjc", "spine3.sjc", "up"], ["rr2.sjc", "spine4.sjc", "up"], ["gw1.sjc", "spine1.sjc", "up"], ["gw1.sjc", "spine2.sjc", "up"], ["gw1.sjc", "spine3.sjc", "up"], ["gw1.sjc", "spine4.sjc", "up"], ["gw2.sjc", "spine1.sjc", "up"], ["gw2.sjc", "spine2.sjc", "up"], ["gw2.sjc", "spine3.sjc", "up"], ["gw2.sjc", "spine4.sjc", "up"], ["spine1.ams", "spine1.sin", "up"], ["spine2.ams", "spine2.sin", "up"], ["spine1.sin", "spine1.sjc", "down"], ["spine2.sin", "spine2.sjc", "down"]], [["10.2.246.0/24", "10.255.1.22"], ["10.2.246.0/24", "10.255.2.14"], ["10.2.246.0/24", "10.255.2.4"], ["10.9.219.0/24", "10.255.2.19"], ["10.9.240.0/24", "10.255.3.19"], ["10.9.240.0/24", "10.255.2.11"], ["10.3.195.0/24", "10.255.2.26"], ["10.9.168.0/24", "10.255.1.19"], ["10.2.254.0/24", "10.255.2.12"], ["10.1.91.0/24", "10.255.2.22"], ["10.1.91.0/24", "10.255.2.15"], ["10.1.91.0/24", "10.255.2.4"], ["10.2.254.0/24", "10.255.3.22"], ["10.2.120.0/24", "10.255.2.202"], ["10.2.120.0/24", "10.255.1.101"], ["10.2.168.0/24", "10.255.1.21"], ["10.2.168.0/24", "10.255.1.12"], ["10.2.168.0/24", "10.255.2.16"], ["10.1.113.0/24", "10.255.2.102"], ["10.9.168.0/24", "10.255.2.20"], ["10.9.168.0/24", "10.255.2.23"], ["10.9.168.0/24", "10.255.2.24"], ["10.3.215.0/24", "10.255.3.1"], ["10.3.215.0/24", "10.255.1.2"], ["10.3.215.0/24", "10.255.3.19"], ["10.2.213.0/24", "10.255.1.102"], ["10.9.70.0/24", "10.255.1.14"], ["10.1.22.0/24", "10.255.3.101"], ["10.1.22.0/24", "10.255.3.14"], ["10.3.78.0/24", "10.255.3.101"], ["10.3.46.0/24", "10.255.1.13"], ["10.3.133.0/24", "10.255.3.24"], ["10.3.133.0/24", "10.255.1.13"], ["10.3.133.0/24", "10.255.3.15"], ["10.1.74.0/24", "192.0.2.1"], ["10.9.246.0/24", "10.255.1.25"], ["10.2.199.0/24", "10.255.2.11"], ["10.9.169.0/24", "10.255.1.13"], ["10.9.169.0/24", "10.255.1.22"], ["10.2.203.0/24", "10.255.2.19"], ["10.2.203.0/24", "10.255.2.23"], ["10.2.203.0/24", "10.255.1.20"], ["10.3.79.0/24", "10.255.1.2"], ["10.3.79.0/24", "10.255.2.14"], ["10.3.79.0/24", "10.255.2.15"], ["10.9.73.0/24", "10.255.2.19"], ["10.9.73.0/24", "10.255.1.16"], ["10.9.113.0/24", "10.255.3.22"], ["10.3.86.0/24", "10.255.2.2"], ["10.1.52.0/24", "10.255.2.202"], ["10.2.122.0/24", "192.0.2.1"], ["10.3.221.0/24", "198.51.100.0"], ["10.9.127.0/24", "10.255.1.24"], ["10.1.191.0/24", "10.255.1.17"], ["10.1.191.0/24", "10.255.3.20"], ["10.3.86.0/24", "10.255.3.202"], ["10.1.235.0/24", "10.255.3.21"], ["10.3.85.0/24", "10.255.3.4"], ["10.3.225.0/24", "10.255.3.3"], ["10.3.225.0/24", "10.255.2.201"], ["10.3.225.0/24", "10.255.3.1"], ["10.1.73.0/24", "10.255.2.13"], ["10.1.48.0/24", "10.255.2.4"], ["10.9.107.0/24", "10.255.1.16"], ["10.9.183.0/24", "10.255.1.12"], ["10.9.102.0/24", "10.255.3.201"], ["10.9.102.0/24", "10.255.3.12"], ["10.1.8.0/24", "10.255.1.25"], ["10.1.48.0/24", "10.255.2.23"], ["10.1.48.0/24", "10.255.1.202"], ["10.9.236.0/24", "10.255.1.12"], ["10.9.236.0/24", "10.255.1.21"], ["10.9.236.0/24", "10.255.1.19"], ["10.9.78.0/24", "10.255.1.23"], ["10.9.145.0/24", "10.255.3.201"], ["10.3.164.0/24", "10.255.3.17"], ["10.2.34.0/24", "10.255.2.22"], ["10.9.170.0/24", "10.255.3.22"], ["10.9.170.0/24", "10.255.3.13"], ["10.9.170.0/24", "10.255.2.17"], ["10.2.158.0/24", "10.255.2.20"], ["10.2.158.0/24", "10.255.2.11"], ["10.1.188.0/24", "10.255.2.12"], ["10.1.188.0/24", "10.255.3.4"], ["10.3.130.0/24", "10.255.1.2"], ["10.2.34.0/24", "10.255.1.11"], ["10.3.119.0/24", "10.255.1.3"], ["10.1.94.0/24", "10.255.1.24"], ["10.1.162.0/24", "10.255.2.23"], ["10.1.136.0/24", "10.255.1.26"], ["10.1.136.0/24", "10.255.3.25"], ["10.1.136.0/24", "10.255.1.13"], ["10.2.11.0/24", "10.255.1.20"], ["10.3.108.0/24", "10.255.3.13"], ["10.3.65.0/24", "10.255.2.13"], ["10.3.65.0/24", "10.255.1.25"], ["10.3.65.0/24", "10.255.1.1"], ["10.3.26.0/24", "10.255.1.1"], ["10.3.74.0/24", "10.255.3.202"], ["10.3.67.0/24", "10.255.2.3"], ["10.3.67.0/24", "10.255.2.202"], ["10.3.67.0/24", "10.255.1.20"], ["10.9.80.0/24", "10.255.1.13"], ["10.2.122.0/24", "192.0.2.1"], ["10.2.96.0/24", "10.255.1.102"], ["10.1.31.0/24", "10.255.1.21"], ["10.1.31.0/24", "10.255.1.201"], ["10.9.254.0/24", "192.0.2.1"], ["10.9.121.0/24", "10.255.2.23"], ["10.9.121.0/24", "10.255.2.12"], ["10.2.193.0/24", "10.255.2.21"], ["10.3.63.0/24", "10.255.2.18"], ["10.2.251.0/24", "10.255.3.22"], ["10.3.218.0/24", "10.255.3.20"], ["10.3.218.0/24", "10.255.3.17"], ["10.3.218.0/24", "10.255.3.22"], ["10.9.101.0/24", "10.255.3.23"], ["10.3.224.0/24", "10.255.2.15"], ["10.3.169.0/24", "10.255.2.202"], ["10.9.208.0/24", "10.255.2.16"], ["10.9.208.0/24", "10.255.1.25"], ["10.9.39.0/24", "10.255.1.4"], ["10.9.191.0/24", "10.255.3.15"]]]
    expected: ["10.1.22.0/24", "10.3.78.0/24", "10.1.74.0/24", "10.9.113.0/24", "10.2.122.0/24", "10.3.221.0/24", "10.1.235.0/24", "10.3.85.0/24", "10.9.102.0/24", "10.9.145.0/24", "10.3.164.0/24", "10.3.108.0/24", "10.3.74.0/24", "10.9.254.0/24", "10.2.251.0/24", "10.3.218.0/24", "10.9.101.0/24", "10.9.191.0/24"]
    hidden: true
    label: "three full-size sites, random failures, sjc cut off"
  - args: ["gw2.ams", [["spine1.ams", "10.255.1.1"], ["spine2.ams", "10.255.1.2"], ["leaf1.ams", "10.255.1.11"], ["leaf2.ams", "10.255.1.12"], ["gw1.ams", "10.255.1.201"], ["gw2.ams", "10.255.1.202"]], [["leaf1.ams", "spine1.ams", "up"], ["leaf1.ams", "spine2.ams", "up"], ["leaf2.ams", "spine1.ams", "up"], ["leaf2.ams", "spine2.ams", "up"], ["gw1.ams", "spine1.ams", "up"], ["gw1.ams", "spine2.ams", "up"], ["gw2.ams", "spine1.ams", "down"], ["gw2.ams", "spine2.ams", "down"]], [["0.0.0.0/0", "10.255.1.202"], ["10.1.1.0/24", "10.255.1.11"], ["10.1.1.0/24", "10.255.1.12"], ["203.0.113.0/24", "10.255.1.201"]]]
    expected: ["10.1.1.0/24", "203.0.113.0/24"]
    hidden: true
    label: "a gateway with both uplinks down still resolves its own loopback"
  - args: ["leaf7.ams", [["spine1.ams", "10.255.1.1"], ["leaf8.ams", "10.255.1.18"]], [], [["10.1.8.0/24", "10.255.1.18"], ["10.1.8.0/24", "10.255.1.18"], ["0.0.0.0/0", "10.255.1.1"]]]
    expected: ["10.1.8.0/24", "0.0.0.0/0"]
    hidden: true
    label: "no links at all, a router with no loopback entry, a duplicated identical path"
  - args: ["leaf1.ams", [["leaf1.ams", "10.255.1.11"], ["spine1.ams", "10.255.1.1"]], [], [["10.1.1.0/24", "10.255.1.11"], ["10.1.1.0/24", "10.255.1.1"]]]
    expected: []
    hidden: true
    label: "a live path followed by a dead one: the prefix stays resolved"
time_limit_ms: 4000
---
A BGP session can be Established, the BGP table can hold every route you expect, and traffic can still go nowhere. This problem asks you to find those routes: the ones that look healthy in BGP and would black-hole.

### The networking idea in one minute

A data-centre fabric runs two routing protocols stacked on top of each other.

The **IGP** (interior gateway protocol; IS-IS in Meridian's fabric) runs on every link between switches. Each router uses it to advertise its **loopback**, a stable `/32` address that belongs to the router itself rather than to any one cable. The IGP's job is narrow: it knows the topology, which links are up, and how to get from any router to any other router's loopback.

**BGP** (Border Gateway Protocol) carries everything else: tenant subnets, host routes, routes from the internet. Every BGP route carries a **next hop**, the address of the router that is the exit for that prefix. Inside one autonomous system (iBGP), the next hop is normally the originating router's loopback, and it is passed along unchanged. `leaf1.ams` may hold a route for `10.1.2.0/24` with next hop `10.255.1.13`, which means "send it to `leaf3.ams`".

To forward a packet, the router must turn that next hop into a physical way out: it looks the next hop up in the IGP's routes. This is **recursive next-hop resolution**. BGP picks the exit; the IGP says how to get there. If the IGP has no route to the next hop, because the owning router is cut off by failed links, or because the next hop is an address the IGP never carried, the path is **unresolvable**. The route stays in the BGP table and the BGP session stays up, which is why dashboards that count received routes report it as healthy, but the path is unusable. The classic cause of the second kind is a border router that forgot **next-hop-self**: it passes an internet route into iBGP with the ISP's link address as the next hop, which the IGP does not carry.

The examples use Meridian's Amsterdam (`ams`) and Singapore (`sin`) sites. Loopbacks are `10.255.<site>.<n>`: spines `n = 1, 2`, leaves `n = 11, 12, ...`, gateways `n = 201, 202`. External addresses come from the documentation ranges `192.0.2.0/24`, `198.51.100.0/24` and `203.0.113.0/24` (RFC 5737).

### The task

Write `unresolvable_next_hops(router, loopbacks, links, routes)`.

- `router` is the name of the router whose BGP table you are checking.
- `loopbacks` is a list of `[name, address]` pairs: the loopback each router advertises into the IGP. Addresses are unique. A router can appear in `links` without a loopback entry; it still forwards traffic, nobody uses it as a next hop.
- `links` is a list of `[a, b, state]` triples, one per IGP adjacency, with `state` either `"up"` or `"down"`. Links are bidirectional and may be listed in either direction. The same pair can appear more than once (parallel links); the pair is connected if any of its links is up.
- `routes` is the BGP table: a list of `[prefix, next_hop]` pairs. A prefix can appear several times with different next hops; each entry is one path.

A path **resolves** if its next hop is the loopback of a router that `router` can reach over up links, `router` itself included (a router always reaches its own loopback). A prefix is **unresolvable** if none of its paths resolves.

Return the unresolvable prefixes, each once, in the order of their first appearance in `routes`.

### Examples

**Example 1.** A small Amsterdam fabric (2 spines and 4 leaves, a simplification of the full 4-spine, 16-leaf site) with both gateways. Every leaf and gateway has a link to each spine. Three links are down: both of `leaf3.ams`'s uplinks (it is rebooting) and `gw2.ams`–`spine1.ams`. The BGP table on `leaf1.ams`:

| Prefix | Next hop | Owner | Resolves? |
|---|---|---|---|
| `10.1.1.0/24` | `10.255.1.11` | `leaf1.ams` itself | yes |
| `10.1.2.0/24` | `10.255.1.13` | `leaf3.ams` | no: both its links are down |
| `10.1.2.20/32` | `10.255.1.13` | `leaf3.ams` | no |
| `0.0.0.0/0` | `10.255.1.201` | `gw1.ams` | yes, via either spine |
| `198.51.100.0/24` | `10.255.1.202` | `gw2.ams` | yes: one link is down, the path through `spine2.ams` remains |
| `192.0.2.0/24` | `198.51.100.2` | nobody | no: an ISP's link address, a missing next-hop-self |

Output: `["10.1.2.0/24", "10.1.2.20/32", "192.0.2.0/24"]`.

Note that `0.0.0.0/0` here is a BGP route like any other, a default route announced by `gw1.ams`, and `198.51.100.0/24` happens to cover the ISP address `198.51.100.2`. Neither makes a next hop resolvable: in this problem, resolution goes through the IGP's loopbacks only, never through another BGP route. Real routers can be configured either way, and operators commonly forbid resolving next hops over a default or covering route, for the reason the follow-up explores.

**Example 2.** Two small sites, `ams` and `sin`, each 2 spines and 4 leaves. The sites are joined by two long-haul circuits, `spine1.ams`–`spine1.sin` and `spine2.ams`–`spine2.sin`, and both are down. The BGP table on `leaf3.ams`:

| Prefix | Next hop | Owner |
|---|---|---|
| `10.1.1.0/24` | `10.255.2.12` | `leaf2.sin` |
| `10.1.1.0/24` | `10.255.1.11` | `leaf1.ams` |
| `10.1.1.11/32` | `10.255.2.12` | `leaf2.sin` |
| `10.1.2.0/24` | `10.255.1.13` | `leaf3.ams` itself |
| `10.1.2.0/24` | `10.255.2.13` | `leaf3.sin` |
| `10.2.0.0/16` | `10.255.2.11` | `leaf1.sin` |
| `10.2.0.0/16` | `10.255.2.14` | `leaf4.sin` |

Output: `["10.1.1.11/32", "10.2.0.0/16"]`. Acme's `10.1.1.0/24` is stretched across both sites, so its Amsterdam path survives. The host route for `acme-web2` exists only in Singapore and dies with the partition, and `10.2.0.0/16` has two paths, both into the partitioned site. Bring either circuit back up and the output is `[]`: the traffic detours through the sister spine.

**Example 3.** `leaf1.ams` with its only link, to `spine1.ams`, down:

| `routes` | Output |
|---|---|
| `[["10.1.1.0/24", "10.255.1.11"], ["10.255.1.1/32", "10.255.1.1"], ["192.0.2.0/24", "192.0.2.1"]]` | `["10.255.1.1/32", "192.0.2.0/24"]` |

The router's own loopback still resolves; the spine's does not; an address no router owns never does.

### Constraints

- `1 ≤ number of routers ≤ 10⁴`, `0 ≤ len(links) ≤ 5 · 10⁴`, `0 ≤ len(routes) ≤ 10⁵`.
- Router names and addresses are non-empty strings; `router` may have no links and no loopback entry.
- Next hops may be any IPv4 address, including ones no router owns.

### Follow-up

"Now the links carry IS-IS metrics and some routers have the **overload bit** set: they can be reached but must never be used as transit. And the IGP also carries a summary `10.255.0.0/16`, so a next hop can be resolved by longest-prefix match through a covering route instead of the owner's `/32`. Which prefixes are now unresolvable, which are worse than unresolvable, and how would you recompute the answer after a single link flap without redoing the whole table?"

## Solution

### The naive approach

For each path, run a BFS from `router` over the up links and check whether the next hop's owner is reached. With `R` paths and a graph of `N` routers and `L` links, that is `O(R · (N + L))`: 10⁵ paths times a 6 · 10⁴-element graph is about 6 · 10⁹ steps. A slightly better naive version caches the BFS per distinct next hop, which is `O(H · (N + L))` for `H` distinct next hops, and still repeats the same traversal for every leaf in the fabric.

### The insight

Every BFS starts from the same router over the same graph. The question "can `router` reach X?" has the same answer machinery for every X: the set of routers reachable from `router`. Compute that set once, in one traversal, and every path's check becomes a hash lookup. This is exactly how a real router does it: the IGP runs one SPF (shortest path first) computation from itself and produces a route to every reachable loopback; BGP then checks each next hop against that result.

Two lookups remain. A next hop is an address, the reached set holds router names, so map addresses to owners. And the answer is per prefix, not per path, so group paths by prefix and remember whether any one resolved.

### The optimal approach

1. Build an adjacency list from the links whose state is `"up"`, adding each in both directions. Down links are simply not edges. Parallel links and either listing order need no special handling.
2. BFS from `router`. Seed the visited set with `router` itself, so its own loopback resolves even when it has no links.
3. Map each loopback address to its owner.
4. Walk `routes` once. On the first sight of a prefix, record it in order with a flag `False`. Set the flag to `True` when a path's next hop has an owner in the visited set.
5. Return the prefixes whose flag is still `False`, in recorded order.

```python
from collections import deque


def unresolvable_next_hops(router: str, loopbacks: list[list[str]], links: list[list[str]], routes: list[list[str]]) -> list[str]:
    adjacency: dict[str, list[str]] = {}
    for a, b, state in links:
        if state != "up":
            continue                                  # a down link is not an IGP adjacency
        adjacency.setdefault(a, []).append(b)
        adjacency.setdefault(b, []).append(a)

    reached = {router}                                # a router always reaches its own loopback
    queue = deque([router])
    while queue:
        node = queue.popleft()
        for neighbour in adjacency.get(node, []):
            if neighbour not in reached:
                reached.add(neighbour)
                queue.append(neighbour)

    owner = {address: name for name, address in loopbacks}

    resolves: dict[str, bool] = {}                    # insertion order = first appearance
    for prefix, next_hop in routes:
        if prefix not in resolves:
            resolves[prefix] = False
        if owner.get(next_hop) in reached:            # unknown address -> None -> not reached
            resolves[prefix] = True
    return [prefix for prefix, ok in resolves.items() if not ok]
```

Trace example 2. The up links connect the six Amsterdam routers to each other and the six Singapore routers to each other; the two circuits are down, so the BFS from `leaf3.ams` reaches exactly the Amsterdam half. `10.1.1.0/24`'s first path (`leaf2.sin`) does not resolve, its second (`leaf1.ams`) does, so its flag ends `True`. `10.1.1.11/32` has one path into Singapore: `False`. `10.1.2.0/24` resolves through `leaf3.ams` itself. Both `10.2.0.0/16` paths point into Singapore: `False`.

**Complexity.** Building the adjacency list and the BFS cost `O(N + L)`, the owner map `O(N)`, and the pass over the table `O(R)` with expected-`O(1)` hash operations. Total `O(N + L + R)` time. Space `O(N + L)` for the graph and visited set plus `O(P)` for the `P` distinct prefixes.

### Common mistakes

- **One BFS per route.** Correct, and quadratic in practice. The source is fixed, so one traversal answers every question.
- **Reporting per path instead of per prefix.** `10.1.1.0/24` in example 2 has a dead path and a live one; BGP simply uses the live one. Reporting it is a false alarm, and reporting `10.2.0.0/16` twice is a duplicate.
- **Treating links as directed.** IGP adjacencies are two-way; a link listed as `[spine1.ams, gw1.ams]` connects `gw1.ams` to the spine too.
- **Letting a down link cancel an up one.** With parallel links, the pair is connected if any link is up. Building the graph only from up links gets this right without thinking about it; deleting edges when you see a down entry gets it wrong.
- **Forgetting the router itself.** Seeding the visited set with an empty set (or only adding nodes when you pop a neighbour) makes a router with no up links unable to resolve its own loopback.
- **Crashing on an unknown next hop.** `owner[next_hop]` raises on `198.51.100.2`. An address with no owner is the missing next-hop-self case and must simply count as unresolvable.

### How to discuss it

Start with the networking framing in one sentence: BGP names the exit, the IGP must be able to reach it, and a route whose exit is unreachable sits in the table looking fine. Then say the algorithmic point: the source is fixed, so reachability is one BFS, and each path becomes a set membership check. Name the two non-graph details before coding: next hops are addresses, so you need an address-to-owner map, and the answer is per prefix, so you need an "any path resolves" flag. Trace example 2, because it exercises the partition, the surviving multipath prefix and the router's own loopback in one table.

If asked why BFS rather than DFS or union-find: any of them works for plain reachability. BFS is the natural stepping stone to the follow-up, where the real router runs Dijkstra with metrics, and union-find becomes attractive only if you must answer reachability for many different source routers at once.

### Networking follow-ups

A network-org interviewer will push from the toy model to how routers actually behave.

- **"Add metrics."** Reachability does not change with metrics: a reachable router is reachable at some cost. What changes is which path, and therefore which spines, the resolved next hop uses. Replace BFS with Dijkstra and keep every equal-cost predecessor: that set of first hops is the ECMP group the FIB (forwarding information base, the table in the forwarding hardware) gets for every BGP prefix behind that next hop.
- **"Routers with the overload bit."** In IS-IS, a router with the overload bit set stays reachable (its own loopback has a route) but SPF never routes *through* it. In the BFS, you may visit an overloaded router but must not expand its neighbours, unless it is the starting router. Operators set it while a router boots, so it does not attract traffic before BGP has converged, and during maintenance. A common wrong answer is to delete the overloaded router from the graph, which wrongly makes its own routes unresolvable.
- **"A covering route in the IGP."** If `10.255.0.0/16` is in the routing table, a longest-prefix-match resolver finds a route for a dead loopback and calls the next hop resolved. Traffic is forwarded towards the summary's next hops and dropped where the `/32` really ends: the prefix is black-holed *while looking resolved*, which is worse than unresolvable, because BGP will not fail over to another path. This is why resolvers should resolve loopback next hops only through host routes and never through a default route. The tooling answer: report each next hop with the prefix length that resolved it, and alert on any loopback resolved by less than a `/32`.
- **"After one link flap, recompute fast."** Two layers. The IGP side runs incremental or partial SPF, recomputing only what the changed link affects. The BGP side uses **next-hop tracking**: BGP registers each distinct next hop with the routing table manager and is told only when that next hop's resolution changes. Because many prefixes share a few next hops (a fabric has thousands of prefixes and tens of loopbacks), the work is proportional to next hops, not prefixes. Hardware follows with a hierarchical FIB (BGP prefix independent convergence): prefixes point at a shared next-hop object, so one write repoints a million prefixes. In your solution, the equivalent is to invert the table once into next hop to prefixes and re-evaluate only the prefixes behind next hops whose owners changed reachability.
- **"The BGP session is still up; why is the route dead?"** The iBGP session runs over TCP between loopbacks, so a partition kills it too, but only when the hold timer expires (90 or 180 seconds by default depending on the platform, unless tightened or paired with BFD, bidirectional forwarding detection). Until then BGP still holds the routes. Next-hop resolution reacts in IGP time, typically well under a second; the session reacts in hold-timer time. That gap is why next-hop reachability deserves its own signal rather than being inferred from session state.
- **"Where do route reflectors fit?"** Meridian's reflectors sit beside the spines, out of the forwarding path, but they still resolve next hops to choose a best path. A reflector that cannot reach a next hop treats that path as unusable and may not reflect it, even if its clients could reach it. Reflector placement and redundant reflector pairs exist partly for this reason.
- **"What would you put on a dashboard?"** Per router: prefixes received, prefixes with at least one resolvable path, and prefixes with none, the output of this function. Per next hop: resolved or not, through which route and which prefix length, and the IGP event that changed it. A burst of next hops going unresolvable together with loopbacks leaving IS-IS is an underlay incident, and the alert should say so, not page the BGP team.

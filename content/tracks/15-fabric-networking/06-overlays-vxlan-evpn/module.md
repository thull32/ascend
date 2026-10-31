---
slug: overlays-vxlan-evpn
title: "Overlays: VXLAN, EVPN and multi-tenancy"
description: Why fabrics carry tenants in tunnels, VXLAN byte by byte, EVPN as the control plane that tells every leaf where every host lives, VRFs and routing between tenants' subnets, BUM traffic, multihoming, the full overlay packet walk, and MPLS for comparison.
prerequisites: [fabric-networking/bgp-fundamentals]
---
The underlay routes between devices, but customers and tenants live on layer-2 segments, need isolation from one another, and often reuse the same private addresses. An overlay solves both problems at once. The ingress leaf wraps the tenant's frame in a new header addressed to the egress leaf's loopback. The spines forward on that outer header alone, and the egress leaf unwraps it. BGP, extended with EVPN, tells every leaf which tenant MAC and IP lives behind which leaf, so nothing has to be flooded to be found.

The module starts with why overlays exist, then VXLAN's header stack field by field, including the 50 bytes of overhead and the MTU consequence. EVPN's route types come next, with route distinguishers and route targets, then VRFs and symmetric IRB for routing between a tenant's subnets. Then broadcast and unknown traffic (ingress replication versus multicast) and multihoming with ethernet segments. All of it comes together in the overlay packet walk between two sites, followed by the incident where a duplicated route target leaked one tenant's routes into another. The module closes with MPLS and segment routing, the backbone's answer to the same problem.

By the end you can draw every header of a tenant packet at every hop of the Meridian fabric and explain who learned what from whom.

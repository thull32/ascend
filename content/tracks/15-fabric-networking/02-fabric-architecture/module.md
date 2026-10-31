---
slug: fabric-architecture
title: Data center fabric architecture
description: Why data centers became leaf-spine Clos fabrics, how ECMP spreads traffic and when it fails, the physical layer underneath, how sites connect over long-haul circuits, and how fabrics are built to degrade instead of failing.
prerequisites: [fabric-networking/from-zero]
---
A modern data center network is not a tree of ever-bigger switches. It is a Clos fabric: every leaf connects to every spine, so any server reaches any other server in the same number of hops over many equal paths. That one shape explains most of what follows: why the underlay must make every loopback reachable, why spines don't need to know about customers, why ECMP hashing matters, and why a single failing link quietly removes a fraction of capacity rather than taking anything down.

The module builds the fabric from its motivation (east-west traffic and the collapse of the three-tier design), through the scale arithmetic of leaf-spine and super-spine designs, to ECMP and its failure modes. Then it goes down to the physical layer (optics, cables, FEC and light levels, where many incidents start) and out to the backbone: how sites connect over leased circuits, why a sparse "square" beats a full mesh, and what latency distance costs. It ends with redundancy and failure domains: pairs everywhere, headroom math, and designing for maintenance.

You will use the Meridian sites from here on. By the end you can size a fabric, explain why traffic between two leaves takes the path it does, and predict what a spine failure or a dirty optic does to throughput.

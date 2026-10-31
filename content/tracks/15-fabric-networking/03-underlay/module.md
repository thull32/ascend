---
slug: underlay
title: "The underlay: routing inside the fabric"
description: How routing protocols fill forwarding tables, IS-IS from first principles, BGP used as a data center IGP, how fast a fabric heals and why, and the underlay failures that take everything above them down.
prerequisites: [fabric-networking/fabric-architecture]
---
The underlay has one job: make every device's loopback reachable from every other device, and keep it that way when links fail. Everything else (BGP sessions, EVPN routes, VXLAN tunnels, RoCE traffic) rides on top of that one guarantee. When the underlay breaks, every service above it breaks at once, usually while dashboards that only check the upper layers stay green.

The module explains what a routing protocol does, then takes IS-IS apart: adjacencies, link-state packets, flooding, sequence numbers and lifetimes, SPF and levels. It shows the alternative many data centers chose, BGP as the only protocol with an AS number per leaf, and argues both sides of the "why IS-IS and not eBGP?" question. Then convergence: what happens in the milliseconds between a fibre cut and recovered traffic, and how BFD shortens it. It ends with the failures operators actually see, including a purge storm in which one device's clock jump erased the topology for every router in its area.

By the end you can explain how a fabric learns its own shape, how long recovery takes and where that time goes, and how to debug an adjacency that won't come up.

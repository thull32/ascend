---
slug: bgp-in-the-real-world
title: BGP in the real world
description: Policy and communities, steering traffic across two ISPs, how the internet's networks interconnect, leaks, hijacks and RPKI, convergence at scale, and how to change BGP without causing an outage.
prerequisites: [fabric-networking/bgp-fundamentals]
---
Knowing how BGP chooses a path is half the story. The other half is what operators do with it: write policy that tags routes as they arrive and acts on the tags as they leave, steer traffic between two upstream providers, peer at internet exchanges, and defend against other networks' mistakes. That half is where the famous outages come from, from a single network hijacking YouTube in 2008 to Facebook withdrawing itself from the internet in 2021.

The module covers policy and communities, then the two-ISP problem that interviewers love, worked end to end: LOCAL_PREF for traffic leaving, prepending and more-specific prefixes for traffic arriving, and why you can only influence the second. It explains how the internet's networks are glued together through transit, peering and exchanges, and how leaks and hijacks spread and what RPKI does about them. It ends with convergence at scale and with operating BGP safely, including the maintenance mistake of costing out a router before withdrawing its routes.

By the end you can design an edge policy for a multi-homed network, explain a public BGP incident mechanism by mechanism, and list what to monitor beyond "the session is up".

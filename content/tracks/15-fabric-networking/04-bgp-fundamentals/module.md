---
slug: bgp-fundamentals
title: BGP from first principles
description: What BGP is for, how sessions come up, what an UPDATE carries, how iBGP avoids loops, why route reflectors exist, how the best path is chosen, and the black hole every network engineer is asked about.
prerequisites: [fabric-networking/underlay]
---
BGP is the protocol network interviews return to most, because it is where networking stops being about shortest paths and becomes about policy. It glues the internet's tens of thousands of networks together. Inside a fabric it carries the customer and tenant routes the underlay knows nothing about. Its behaviour follows from a handful of rules, and most "BGP mysteries" are one of those rules applied faithfully.

The module builds BGP from the ground up. Autonomous systems and why policy beats distance come first, then the session itself: TCP port 179, the OPEN and KEEPALIVE messages, and the finite state machine you will be asked to recite. Next, what an UPDATE carries and the RIBs it flows through. iBGP and its loop-prevention rule explain why route reflectors exist. The best-path algorithm is worked step by step on competing routes. The module ends with the classic trap: BGP sessions are all up, and traffic still vanishes into a router that never heard of the destination.

By the end you can say what OpenSent and OpenConfirm mean, why BGP rides on TCP, which route wins and why, and how BGP and the underlay split the work: BGP says which exit, the IGP says how to get there.

---
slug: from-zero
title: "Networking from zero: how a packet really moves"
description: Frames, switches, VLANs, subnets, the routing table, ARP and the hop-by-hop packet walk, built from nothing, ending with what a switch and a Linux host actually do with every packet.
---
Network engineers carry a picture in their heads that most software engineers never had to build: what is in a frame, which box looks at which header, and why the MAC address changes at every hop while the IP address does not. Every later module rests on that picture. A BGP route is useless until you can say how a packet reaches its next hop, and VXLAN is meaningless until you know what a frame is.

The module starts with the wire: links, speeds, delays and the Ethernet frame field by field. Then switching (MAC learning, flooding, VLANs, and why loops are fatal at layer 2), addressing (subnet math by hand), the routing table and longest-prefix match, and ARP and the default gateway. All of it comes together in the packet walk, hop by hop and then end to end from a new laptop to a website. It closes with transport as the network sees it (the 5-tuple, MTU and path-MTU black holes), what is inside a switch (control, data and management planes, ASICs, network operating systems), and the host's own path through the Linux kernel.

No prior networking knowledge is assumed. By the end you can answer "a server can't ping its default gateway: what do you check?" one layer at a time, and draw the headers of any packet at any hop.

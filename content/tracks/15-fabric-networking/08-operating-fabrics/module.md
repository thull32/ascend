---
slug: operating-fabrics
title: "Operating fabrics: automation, telemetry and troubleshooting"
description: "What software engineers build for network organisations: intent-based automation and a source of truth, configuration APIs, streaming telemetry, active measurement, a troubleshooting method, safe change procedures, and the incidents that justify all of it."
prerequisites: [fabric-networking/fabric-architecture]
---
Network outages are caused far more often by changes than by hardware, and operators manage thousands of devices across many vendors. Network organisations therefore hire software engineers to build the systems that change the network safely and watch it continuously. This module is about those systems and the networking knowledge each one depends on.

It starts with automation: a source of truth, templates, the diff between intended and running configuration, and why deleting configuration is the hard part. It continues through the configuration APIs devices expose (NETCONF and YANG, gNMI and OpenConfig, NVUE's REST model, SONiC's databases) and streaming telemetry, including where collectors should live so the platform can tell "the device is dead" from "I can't see it". Then active measurement: probes that cover every ECMP path, and the troubleshooting method network engineers actually use (scope first, then reachability, capacity and the host), worked on real cases. It ends with the procedure every change follows (pre-check, drain, validate, work, restore, validate) and a set of incident case studies, each ending with what a platform should have detected.

By the end you can design the automation and observability for a fabric, and describe in the network team's own terms what the software has to do.

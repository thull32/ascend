---
slug: ai-fabrics
title: "AI and HPC fabrics: GPUs, RDMA and RoCE"
description: Why AI training traffic breaks ordinary network assumptions, how parallelism and NCCL collectives turn into flows, NVLink and scale-up domains, RDMA from zero, InfiniBand versus RoCE, lossless Ethernet with PFC, ECN and DCQCN, what goes wrong, fabric topologies for tens of thousands of GPUs, and getting to line rate.
prerequisites: [fabric-networking/fabric-architecture]
---
A training job is thousands of GPUs computing for a few hundred milliseconds, then all exchanging gradients at once. The step finishes only when the slowest transfer finishes, so a single congested link idles every GPU in the job. Traffic comes as a few enormous flows that hash poorly, everyone sends at the same moment, and an idle GPU costs real money every second. Ordinary data center networking, built for millions of small independent flows, gets all of this wrong, which is why AI clusters run their own fabrics with their own transport.

The module starts with the traffic. A training step, the parallelism strategies and what each sends on the wire, and the collectives NCCL runs (ring and tree all-reduce, with the bandwidth arithmetic). Then the hardware: NVLink and NVSwitch inside a rack, and RDMA from zero (queue pairs, memory registration, one-sided writes). InfiniBand and RoCE are compared next. Lossless Ethernet is traced end to end: PFC pause frames, ECN marking, congestion notification packets and DCQCN rate control. Then what goes wrong: PFC storms, head-of-line blocking and deadlock. The module closes with rail-optimised topologies and adaptive routing at the scale of tens of thousands of GPUs, and tuning a fresh install to line rate with perftest and nccl-tests.

The Meridian San Jose cluster is the running example. By the end you can explain why the AI team sees latency the network team's dashboards don't, and which counters on which side prove it.

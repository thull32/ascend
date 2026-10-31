---
lesson: collectives-and-nccl
source: b8729171b8f707f0
fit: partial
desk:
  - "The ring all-reduce trace, step by step, with the sample element per chunk, and the ring all-reduce visualisation"
  - "The alpha-beta formula and the scaling table from 2 to 1,024 ranks"
  - "The double binary tree diagram, the ring against tree model in Python and its output"
  - "The nccl-tests output and the bus bandwidth factor table"
  - "The NCCL workflow diagram, the topology path table, the protocol table and the annotated debug log"
  - "The failure modes table, the trade-offs table and the log audit script"
  - "Exercises: simulate a ring all-reduce, and compute algorithm and bus bandwidth"
---
## Introduction

After every backward pass, each of the 1,024 GPUs in Meridian's San Jose cluster holds 2 gigabytes of gradients, and none may update its weights until all of them hold the sum. If every GPU sent its 2 gigabytes to every other, each would push about 2 terabytes onto a 400 gigabit link: 40 seconds per step. A good all-reduce sends under 4 gigabytes per GPU and keeps each NIC busy for about 10 milliseconds.

The difference is an algorithm, and NCCL, NVIDIA's collective library, pronounced nickel, picks it without asking you. Four ideas: what each collective promises, why a ring sends two times n minus one over n of the data, why small messages go by tree, and how NCCL turns all this into flows on the fabric.

## Four collectives

A collective is an operation every GPU in a group must join; each participant is a rank. Define one by what each rank holds before and after. Take four ranks holding 1, 2, 3 and 4.

All-reduce: every rank ends with the sum, 10. That is data parallelism summing gradients. Reduce-scatter: each rank ends with a different shard of the sum. All-gather: each rank starts with one shard and ends with all of them. Sharded training, FSDP and ZeRO, uses those two. Broadcast: the root's vector ends up everywhere, as when a job copies initial weights from rank 0.

Two identities matter. All-reduce is a reduce-scatter followed by an all-gather: once each rank owns one summed shard, gathering the shards gives everyone the whole sum. And floating-point addition is not associative, so a ring and a tree, adding in different orders, differ in the last bit. Teams that need bit-for-bit reproducible runs pin the algorithm, the protocol and the channel count.

## The ring, step by step

Four ranks: GPU 0 of the first four servers, all on one rail 1 leaf, each with a 400 megabyte gradient and a NIC moving 50 gigabytes a second each way.

The obvious ways fail. Everyone sending to everyone: each rank sends 1,200 megabytes, 24 milliseconds, growing with the rank count. A central summer receives everything and sends it back, so one NIC bounds the job, and it is the worst case of incast.

Now the ring: 0 to 1 to 2 to 3 and back to 0. Cut each vector into four chunks of 100 megabytes. Every step, each rank sends one chunk right and receives one from the left, so every NIC runs at full rate both ways.

Follow one sample element per chunk, chosen so the digits show who has contributed. Rank 0 holds 1, 2, 3, 4. Rank 1 holds tens, rank 2 hundreds, rank 3 thousands. Everyone must end with 1111, 2222, 3333, 4444.

Phase one, the reduce-scatter. Watch chunk 0. Rank 0 sends its 1 to rank 1, which adds its 10: 11. Rank 1 passes 11 to rank 2, which adds 100: 111. Rank 2 passes 111 to rank 3, which adds 1,000: 1111. Complete, having visited every rank. The other chunks did the same at the same time, each starting one position further round. After three steps each rank owns one complete chunk.

Phase two, the all-gather. Each rank sends its complete chunk right, and the receiver overwrites instead of adding. Three more steps and everyone holds the answer.

Six steps, one 100 megabyte chunk per step: 600 megabytes per rank, one and a half times the vector. 2 milliseconds a step, 12 in all, half either obvious method, with every link equally loaded. Real NCCL pipelines small slices, so a rank adds the first slice of a chunk while its neighbour still receives the last.

How it breaks: each step forwards what the last delivered, so the ring runs at the pace of its slowest hop. One NIC that negotiated 200 gigabits instead of 400 halves the whole collective. The signal: bus bandwidth low on the full server set, normal on pairs.

## The math, and rings across servers

Generalise. With n ranks and a vector of S bytes, each phase takes n minus one steps of one nth of the vector. So each rank sends two times n minus one over n times S, in two times n minus one steps.

Here is the number to remember: the bytes per rank never exceed twice the vector. For a 2 gigabyte gradient, 4 ranks send 3 gigabytes, 8 send 3.5, and 1,024 send 4. From 8 ranks to 1,024 adds 14 percent, not 128 times, which is why data parallelism scales at all. And the ring is bandwidth-optimal while only GPUs add: a rank must receive everyone's contribution to its shard, then every shard it does not own. The only way past the bound is to let the network add.

But steps grow linearly. 1,024 ranks means 2,046 steps; at 5 microseconds each, 10 milliseconds of pure latency whatever the size.

A real ring keeps seven of every eight hops inside a server on NVLink, about 450 gigabytes a second each way, and one leaves through a NIC. NCCL builds at least one ring per NIC, each leaving on a different rail. Across eight rings, each NIC carries 500 megabytes: 10 milliseconds. All hops on the network would mean 4 gigabytes per NIC, 80 milliseconds. The hierarchy buys a factor of eight, if the fabric keeps each ring's network hop on its rail.

All-gather and reduce-scatter alone are each half an all-reduce. Fully sharded training all-gathers parameters before the forward and the backward pass, then reduce-scatters gradients: one and a half times the bytes, so no GPU stores the whole model. Broadcast runs down a pipelined chain: 400 megabytes as 100 slices, each forwarded on arrival, done in about 8.2 milliseconds against 24 for sending three copies.

## Trees, and letting the network add

So, before I tell you: if the ring is bandwidth-optimal, why does NCCL ever use anything else?

[pause]

Because bandwidth is not latency. A tree adds up and broadcasts back down, about twice its depth in steps: 14 for 128 ranks against the ring's 254.

A single binary tree makes interior ranks send three times the vector. NCCL's double binary tree, since 2019, uses two trees each carrying half the data, built so every rank is interior in one and a leaf in the other. About twice the vector per rank, close to the ring, in logarithmic steps.

The lesson models both, with an illustrative 5 microseconds per step and trees charged 15 percent of bandwidth. For 64 kilobytes, the tree wins by three and a half times on 16 ranks and 17 times on 128. Large messages go by ring. The crossover moves with the job: about 11 megabytes at 16 ranks, 163 at 128. So a 25 megabyte PyTorch bucket goes by ring in a 16-node job and by tree in a 128-node one. A hard-coded choice is wrong somewhere.

Trees break at interior ranks, which take two-to-one fan-in, small incasts a ring never makes.

If a switch does the adding, each rank sends its vector once and gets the sum back: half the bytes. SHARP does it in NVIDIA's InfiniBand switches, and NVLS in the NVSwitch. The cost: reduction state lives in the network, so a failing switch stalls collectives, and resources are finite. The signal is NCCL's log falling back to ring or tree, and step time jumping.

## Bus bandwidth

nccl-tests prints two numbers, and confusing them is the commonest misreading. Algorithm bandwidth is size over time, what the application sees. The four-rank ring: 400 megabytes in 12 milliseconds, 33.3 gigabytes a second.

Bus bandwidth multiplies by the collective's factor, two times n minus one over n for all-reduce: 33.3 times one and a half is 50. That is the rate each link ran at, so it is what you compare with hardware. Algorithm bandwidth falls as ranks are added even on a perfect fabric; bus bandwidth stays at the link rate.

A sample four-rank run shows 46.6 against a 50 gigabyte NIC: 93 percent, healthy, after headers and synchronisation. With full eight-GPU servers, seven hops in eight are NVLink, so the yardstick is all eight NICs together, around 400. Compare with the slowest resource in the path, and know which one that is. And small-message bus bandwidth is low on any fabric; compare latency there instead.

## Inside NCCL

NCCL runs one workflow for every job, and each stage decides something about the network.

The communicator is NCCL's object for one group of ranks. Rank 0 makes a unique ID, the framework hands it out, and ranks exchange descriptions over plain TCP on an ordinary interface, normally the front end. A rank that picks an interface the others cannot reach, a container bridge or a management port, hangs the whole group at start-up.

Topology detection builds each server's graph: PCIe, NVLink, NICs. A GPU and NIC under one PCIe switch is the best case; across CPU sockets is usually too far for GPUDirect RDMA, so data is staged through host memory. And NCCL sees nothing past the NIC: no leaves, no spines, no rails. The fabric must match the rank order NCCL will choose.

Then a graph search lays rings and trees through the servers, keeping each network hop on one rail. On every call the tuner picks algorithm and protocol by a latency-plus-bandwidth model. Simple is nearly all payload, for large messages. LL puts a 4-byte flag beside every 4 bytes of data: lowest latency, half the bandwidth. LL128 carries 120 bytes in every 128. Forcing a choice is for benchmarks, never production.

Each collective is split across channels, each run on one of the GPU's streaming multiprocessors. For the fabric, channels are flows: each has its own queue pair, and a RoCEv2 NIC usually derives the UDP source port from it. Channels times queue pairs per connection is the number of distinct five-tuples ECMP sees: your entropy lever.

Over the network a CPU proxy thread posts RDMA writes. Two settings decide the packets' fate: the traffic class, which sets the DSCP that puts them in the lossless queue, and the GID index, which decides whether they leave as routable RoCEv2.

With debug logging on, every rank prints these choices. The alarming lines: NET Socket, meaning TCP over the front end because RDMA failed; a network hop without GDRDMA, meaning staged through host memory; and SHM between GPUs that have NVLink. None of them errors, both of the first two pass every switch dashboard, and one such host sets the whole job's pace.

To the fabric, a collective is a few low-entropy elephants, starting within microseconds. The classic story: same job, same 64 servers, 30 percent slower after a restart, pairwise tests normal. New queue pairs gave new source ports, and elephants now share a spine uplink. So the platform should show bus bandwidth baselines, NCCL's decisions parsed per host, per-port rates compared across the job, host RDMA counters beside switch counters, and a rank-to-port map, so "rank 133 is slow" becomes server 17, GPU 5, its port on rail 6.

## In the interview

A follow-up from the lesson. nccl-tests on new servers shows all-reduce bus bandwidth of 23 gigabytes a second on 400 gigabit NICs. What do you check?

[pause]

Scope first: all servers or some. Then NCCL's log for the socket fallback and missing GDRDMA, the topology dump's GPU-to-NIC paths, NIC speed and errors, and whether RoCE is in the lossless class. Bisect the servers for one slow host. The wrong answers: comparing algorithm bandwidth with the link rate, or blaming switches before reading the host. It is honest to defer to the network team on buffer and ECN settings, while bringing per-port rates and the rank-to-port map.

And why report bus bandwidth at all? Because algorithm bandwidth falls with rank count on a perfect fabric, and the factor converts it into the per-link rate. The common wrong answer is that bus bandwidth is the aggregate over all GPUs.

## Recap

All-reduce is a reduce-scatter then an all-gather, and the ring does exactly that, in two times n minus one steps.

Each rank sends two times n minus one over n of the vector, never more than twice it, but steps grow linearly and the slowest hop sets the pace.

Trees take logarithmic steps for about the same bytes, so they win small messages, and the crossover grows with the job. Only in-network reduction halves the bytes.

Read nccl-tests by bus bandwidth against the slowest resource, and read NCCL's log before blaming the fabric.

At your desk: the ring trace and its visualisation, the scaling table, the tree diagram and model, the nccl-tests output, the workflow, protocol and log details, the failure and trade-off tables with the audit script, and the two exercises.

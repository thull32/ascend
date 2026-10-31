---
lesson: tuning-and-benchmarking-rdma
source: ed08b9695e32fcde
fit: partial
desk:
  - "The RoCEv2 packet field by field and the RoCE MTU table of ceilings and packet rates"
  - "The perftest commands and their outputs: the bandwidth header and result, and the latency rows before and after tuning"
  - "The rdma-write visualisation: a TCP send against one 1 mebibyte RDMA WRITE"
  - "The MTU signals, the ibv devinfo output and the PCIe link table with the lspci link status"
  - "The scale-up-vs-out visualisation, the nvidia-smi topology matrix, its codes table and the socket diagram"
  - "The NCCL log lines, the ring-allreduce visualisation and the nccl-tests output read in bands"
  - "The nccl-tests checker and the ceiling model in Python, with their outputs"
  - "The nine-step bring-up table for srv113, the failure modes table and the which-test-proves-what table"
---
## Introduction

Sixteen new servers arrive for Meridian's San Jose training cluster, srv113 to srv128, each with eight GPUs and eight 400 gigabit network cards. Every link light is green and ping works between every pair. They are not ready. A server can pass all of that and still deliver half its bandwidth: a card in a slot wired with half its lanes, a packet size left at the factory default, a card that cannot reach GPU memory directly. In a synchronous training job the slowest server sets the pace for every GPU, so one bad server slows the whole job.

The method works bottom up. Compute the number you should see, measure one layer at a time with a tool that tests only that layer, and let the size of the shortfall name the layer: first for one server, then for the batch.

## The ceiling, and perftest

400 gigabits per second, the line rate, counts every bit on the wire. The benchmark reports payload. A large RDMA write's packets carry 4,096 bytes of payload and 82 bytes of headers, checksums and framing, so payload is 98 percent of the wire. Here is the number to remember: on a 400 gigabit link, 392 gigabits per second is the ceiling for a perfect bandwidth test.

That fraction is set by the RoCE MTU, the largest payload one RDMA packet carries: five possible values, 256 to 4,096 bytes. At 1,024 the ceiling is 370. That gap of 22 gigabits is the commonest fresh-install shortfall, and at 1,024 bytes every device handles almost four times the packets for the same data.

perftest is the standard RDMA micro-benchmark suite: each tool exercises one RDMA operation between two machines. With no GPU or collective library involved, it answers one question: what can this card, host and path do? The lesson tests srv113's card 0 against card 0 of srv112, an existing server already proven good, through one rail leaf.

The bandwidth tool is ib write bw, with three flags that matter: a GID index, which picks the card's RoCE version 2 IPv4 address entry; four queue pairs; and reporting in gigabits, because otherwise the megabytes column counts units of two to the twentieth bytes, a classic missing 5 percent. The tuned result: 389.7 gigabits per second, 99.4 percent of 392. Done. Two more flags change what you measure: both directions at once, which catches a host that manages 390 one way but not 780 both ways, and GPU memory as the buffer, the GPUDirect test.

Why four queue pairs? One queue pair is one flow, one UDP source port, one ECMP path, and one ordered stream of work for the card, and on some cards one may fall short at 400 gigabits. One at 300 and four at 390 means per-flow processing. Four at 300 means look lower down.

Latency is ib send lat, a ping-pong of 2-byte messages that measures fixed costs: the doorbell across PCIe, the switch, the far card. On a tuned host, 1 to 2 microseconds through one switch is normal. Quote the typical value for the fixed cost and the 99.9th percentile for the tail. srv113's first run: typical 1.96 microseconds, tail 38.6. A fine typical with a tail 20 times higher is the host's signature: something sometimes takes the benchmark's CPU.

## MTU and PCIe

Three MTUs must agree. The host interface MTU, factory default 1,500 bytes. The RoCE MTU the driver derives from it: 1,500 gives 1,024, and anything from about 4,200 up gives 4,096. And every switch port on the path, which must carry a frame of about 4,174 bytes. Meridian runs switch ports at 9,216 and hosts at 9,000.

A host left at 1,500 silently caps every test at 370. Worse is a host at 9,000 behind one switch port left at 1,500. Before I tell you: what does that look like?

[pause]

Small messages fit in small packets and pass, so latency tests succeed. Full-size packets are dropped at the port: RoCE packets cannot be fragmented, and no ICMP message adjusts the RDMA stack the way path MTU discovery adjusts TCP. Large writes retransmit until the queue pair fails with retry exceeded. The signals: a 9,000-byte ping with don't-fragment fails, bandwidth tests hang while latency tests pass, and the card's acknowledgement timeout counter rises.

Now the link nobody draws. Diagrams stop at the card, but data crosses PCIe to reach memory and the GPU, a serial link of 1 to 16 lanes. Gen4 with sixteen lanes carries about 230 gigabits of payload each way. So does Gen5 with eight: half the lanes at twice the speed. Either caps a 400 gigabit card at about 57 percent. Gen5 with sixteen lanes carries about 461, roughly 18 percent of headroom, and a ConnectX-7 needs exactly that.

Width and speed are negotiated at boot. A card not fully seated or a riser wired for eight lanes trains the link down without an error. lspci shows the word downgraded, and the result sticks at 220 to 230 gigabits whatever you change. No network counter will show it.

## Placement, interrupts and GPUDirect

A two-socket server is two computers in one box, each socket with its own memory and PCIe controller. That is NUMA. Each card belongs to one socket, and a host-memory test should run on that socket's cores and memory.

For GPU traffic, what matters is each GPU's distance to its card, printed by nvidia-smi as a topology matrix. Meridian's servers put two GPUs and their two cards under each PCIe switch, so GPU 0 to card 0 is PIX, one switch, the intended pairing. Through the CPU is marginal, and NCCL stages it through host memory by default. SYS, across sockets, is to avoid. It breaks when a container runtime, job script or device renumbering pairs a GPU with a distant card.

Interrupts are subtler than "pin your IRQs". perftest and NCCL poll their completion queues, so a polled RDMA path raises no interrupts at all. Affinity still matters in three places. Interrupts from disks, timers or the card's Ethernet queues land on the polling core and steal microseconds: the 41 microsecond worst case in srv113's first run. Kernel traffic should be handled on the card's own socket. And an application that sleeps until a completion interrupt wakes wherever that interrupt points. It breaks when a package update re-enables irqbalance.

GPUDirect RDMA lets the card read and write GPU memory directly, with no copy through host memory. It needs four things, and each fails differently. A kernel path to map GPU memory, the nvidia peermem module or DMA-BUF: without it, the GPU test exits with a registration error. A short PCIe path, or NCCL turns GPUDirect off and stages through host memory: slower, still running. Peer traffic allowed to stay in the PCIe switch: ACS, an isolation feature for virtual machines, forces it up through the CPU, and a BIOS update that re-enables it is a classic "worked last week" cause. And NCCL actually using it: its log marks each channel that does with GDRDMA, and NET Socket means it found no RDMA device and runs over TCP. Every fallback gives correct results. That is why they hide.

## nccl-tests and bus bandwidth

A training job runs collectives through NCCL, and the workhorse is all-reduce, which leaves every rank holding the sum of everyone's gradients. nccl-tests is the matching benchmark: here 16 ranks, eight on each of two servers, sweeping sizes from 8 bytes to 8 gibibytes.

Algorithm bandwidth is size over time: 1 gibibyte in 5.59 milliseconds is 192 gigabytes per second. It falls as the group grows, because all-reduce moves more bytes per rank. Bus bandwidth multiplies by the bytes each rank really sends, two times n minus one, over n, for ring all-reduce: 1.875 for 16 ranks, 1.98 for 128. That is the rate the links ran at, comparable whatever the rank count.

The ceiling: NCCL's rings cross NVLink inside each server and leave through all eight cards, so bus bandwidth is bounded by the server's total network bandwidth, eight times 50, 400 gigabytes per second. A result of 360 means the eight cards together ran at 90 percent. Healthy runs land at 85 to 95 percent, so keep a baseline per hardware generation.

Read the output in bands. Small messages are latency-bound: judge them by time, about 31 microseconds here. Large messages give the plateau: 362, 90 percent. The average line at the bottom mixes the two, so never quote it. And the wrong column must be zero. Anything else is silent data corruption from a GPU, card, memory or driver fault, and it outranks any performance finding.

Meridian's tooling refuses wrong results, recomputes bus bandwidth from the raw time, and reports the plateau against the ceiling. Two servers: 90 percent. The whole new batch, 128 ranks: 297, only 74 percent.

## One server, from 222 to 390

The reading rule: within 5 percent of a ceiling, that layer is the bottleneck. Well below every ceiling, the limit is something the model leaves out: queue pairs, NUMA, the GPU path, the host CPU.

srv113's card 0 starts before any traffic. The device info says RoCE MTU 1,024, and lspci says PCIe trained at eight lanes, downgraded. Two faults in seconds. The first bandwidth run gives 221.6. Which ceiling is that on?

[pause]

PCIe at eight lanes, about 230. Reseat the card in its riser: 368.4, now on the 370 ceiling of the 1,024 MTU, because the interface is still at 1,500. Set it to 9,000: 389.7 against 392. Both directions: 778, so PCIe has room both ways.

Then GPU memory: 261.3, on no ceiling at all, 67 percent of the link. The module is loaded, the topology says PIX, but ACS redirection is on at the PCIe switch ports, after a BIOS update. ACS off: 388. Last, latency: stop irqbalance, pin the interrupts and the test to socket 0, and the tail falls from 38.6 microseconds to 3.5. Then repeat for cards 1 to 7.

Two habits make this work: change one thing per step, and keep a known-good peer at the other end, which rules out the far end and most of the path.

## From one pair to the fabric

Every server can pass alone while the batch fails together: a short pair test misses faults that need sustained load and paths it never crosses. A synchronous all-reduce runs at its slowest ring hop, so one bad link among 128 drags the whole result down.

Bisect with nccl-tests on halves of the batch, then quarters. Or test pairs on each rail, including the rail's other leaf, for 60 seconds each, because the default test lasts tens of milliseconds.

About 20 seconds in, every pair involving srv121's card 4, on rail 5, fell to about 250 gigabits while every other pair held 389. The leaf port facing it showed forward error correction climbing as the optic warmed, then CRC errors once correction could not keep up, and the receiving cards counted out-of-sequence packets. An optic failing under load with the link still up: a gray failure, and every dropped packet cost a go-back-N resend. Optic replaced, the 128-rank all-reduce reached 358, 89 percent.

Then prove congestion control with an incast, two or more senders into one receiver: ECN marks and congestion notification packets should appear first, PFC pauses rarely. Pauses without notifications means ECN is not reaching the hosts. Then burn in for hours, and the last gate is a real job's step time.

Narrow, fast tests localise; broad, slow ones convince. The platform makes this a gate before any job lands: results as ratios to ceilings, a pair matrix per rail as a heat map, any wrong result quarantining the server, and the cheap checks re-run after every firmware, BIOS or driver change.

## In the interview

The interviewer asks: ib write bw shows 225 gigabits on a 400 gigabit card. Where do you look?

[pause]

225 sits just under the roughly 230 gigabit ceiling of a Gen4 sixteen-lane or Gen5 eight-lane PCIe link, so first lspci for a downgraded link, then MTU, queue pairs and NUMA: compute each layer's ceiling and see which one the number sits on. The common wrong answer is "the network is congested", for a single pair no switch counter explains.

And if perftest hits line rate everywhere but nccl-tests is at half? Host-memory perftest skips the GPU path, NCCL's choice of cards and transport, and all eight rails at once: check the NCCL log for GDRDMA, then ACS, then the GPU-memory perftest.

## Recap

Start from computed ceilings: 392 gigabits at a 4,096-byte RoCE MTU, 370 at 1,024, 230 for a halved PCIe link, and 400 gigabytes per second of bus bandwidth for eight 400 gigabit cards. A result within 5 percent of a ceiling names its layer. Change one thing at a time against a known-good peer. GPUDirect fails silently in four places: the module, the PCIe distance, ACS and the NCCL log. And read nccl-tests by its plateau and its wrong column, because all sixteen servers can pass alone while one warm optic slows the batch by a quarter.

At your desk: the packet and MTU tables, the perftest outputs, the three visualisations, the topology matrix, the NCCL log, the two Python checkers, and the bring-up, failure and test tables.

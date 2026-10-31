---
lesson: why-ai-traffic-is-different
source: 2fed13d9c7991ef0
fit: great
desk:
  - "The training step visualisation: one step healthy, then the same step with one link at half speed"
  - "The step timeline, the straggler comparison table and the tail at scale table"
  - "The RoCEv2 header field by field and the ECMP collision table"
  - "The incast visualisation and its microsecond trace table, lossy and with PFC"
  - "The idle GPU cost table, the job completion time worked example and the metrics comparison table"
  - "The failure modes and trade-offs tables"
  - "The job triage code and the step model code with their outputs"
  - "Practice problem: top k flows"
---
## Introduction

Meridian's Amsterdam fabric carries web requests, database queries and backups: thousands of connections per server, most a few kilobytes long, starting and stopping independently. They balance by the law of large numbers, and TCP resends a dropped packet while other flows carry on.

The 1,024-GPU training cluster in San Jose breaks every one of those assumptions. Its traffic is a few enormous flows per network card, all starting at the same instant, all needing to finish before any GPU can continue. One slow link stalls 1,024 GPUs. One hash collision halves the speed of the whole job. The dashboard can read 19 percent utilisation and zero drops while the machine learning team calls the network their bottleneck, and both are telling the truth.

Six ideas explain why: the shape of a training step, the rule that the slowest flow sets the pace, why AI flows defeat hashing, incast, what an idle GPU costs, and the metric an AI fabric is judged by.

The cluster: 128 servers of eight GPUs, joined inside each server by NVLink. Between servers, every GPU has its own 400 gigabit card speaking RoCE version 2, which lets one card write straight into another machine's memory, carried in UDP packets. Those cards form a back-end fabric for GPU traffic only, rail-optimised: the first GPU of every server plugs into rail 1's leaves, the second into rail 2's, and so on.

## A training step: compute, then communicate

Training repeats one loop, the step. The forward pass runs a batch through the model and measures the error. The backward pass computes a gradient for every parameter: which way, and how much, to nudge it. Then every GPU combines its gradients with every other GPU's, applies the result, and the next step begins.

That exchange exists because of data parallelism. Every GPU holds a full copy of the model and processes a different slice of each batch, and the copies must stay identical, so each GPU replaces its gradients with the average over all of them. That is an all-reduce: everyone contributes a buffer and everyone ends up with the sum. It is one of the collectives, fixed patterns every GPU in a group must join, implemented by NVIDIA's NCCL library.

Now with numbers. Eight GPUs on one rail 1 leaf, training a 1-billion-parameter model. Forward pass 100 milliseconds, backward 200. Gradients are two bytes per parameter: 2 gigabytes per GPU. In NCCL's ring algorithm, each GPU sends two times n minus one over n of its buffer, which for eight GPUs is 3.5 gigabytes. At 400 gigabits per second, which is 50 gigabytes per second, that takes 70 milliseconds.

So the step is 370 milliseconds, and for 70 of them, nearly 19 percent, every GPU is idle, waiting for the network. The network sees the mirror image: silence for 300 milliseconds, then every link at line rate at once for 70. A counter read every 30 seconds averages 81 of those bursts and reports 19 percent utilisation, while the link was saturated whenever it mattered.

Real frameworks overlap the two, all-reducing buckets of gradients while earlier layers still compute. If 50 of the 70 milliseconds overlap, the step drops to 320. Only exposed communication, the part no computation hides, costs step time, and overlap hides a slow network only while communication is shorter than the computation behind it.

## The slowest flow sets the step

An all-reduce is a barrier with arithmetic. No GPU can use the averaged gradient until it has everyone's contribution, so the collective ends for all when the last byte arrives anywhere. In the ring, each buffer is cut into eight chunks, and in each of 14 rounds every GPU sends one chunk to its neighbour. A round ends when its slowest transfer ends, because the next round forwards what the last one delivered. Every chunk passes through every link.

Why accept that? Synchrony keeps every copy identical with no other coordination, and letting fast workers run ahead gives stale gradients, which hurt convergence.

Here is how it breaks. Before step 2, server 5's link flaps and comes back at 200 gigabits, the two ends having negotiated a lower speed over a marginal copper cable. The link is up, so an up-or-down monitor is satisfied. Compute is unchanged. What happens to the step, and to whom?

[pause]

The all-reduce now moves 3.5 gigabytes at 25 gigabytes per second: 140 milliseconds instead of 70. The step grows from 370 to 440 milliseconds, for all eight GPUs, and idle time rises to almost 32 percent. The seven healthy links run at half rate, because a ring moves no faster than its narrowest segment. And since all eight GPUs report the same step time, none can say which link is at fault.

The signal is the leaf's port counters during the all-reduce: seven ports carrying 200 gigabits at half their speed, one carrying the same 200 at the full limit of a reduced speed. An alert on operational speed differing from intended speed catches it before any job notices.

Most stragglers are random, though: a retransmission, a brief queue. Suppose each link has a one in a thousand chance of being slow in a step. With 8 links, a step meets a slow one under 1 percent of the time. With 1,024, 64 percent. With 8,192, virtually always. This is "The Tail at Scale", which Jeff Dean and Luiz Barroso described for web services, in its extreme form: every GPU, every step, and no option to proceed on a partial answer. So AI fabric engineers watch the worst link, not the median.

Not every straggler is the network. A GPU throttling because it runs hot delays one participant, and everyone waits. Per-rank timing tells them apart: a slow GPU shows longer compute on one rank, a slow link shows normal compute everywhere and a longer collective everywhere.

## Elephants with almost no entropy

A leaf with equal uplinks uses ECMP: it hashes the five-tuple, the two addresses, the protocol and the two ports, and picks an uplink per flow. Entropy is the variety in those fields.

A RoCE packet between two GPUs gives the hash almost nothing. The protocol is always UDP, the destination port always 4791, and the addresses are fixed for that pair of cards. Only the source port varies, chosen per queue pair, one RDMA connection's send and receive queues. And NCCL opens one queue pair per connection by default, with two peers per GPU in a ring.

So the flows are few, huge, identical in size, simultaneous, and long-lived: the same queue pairs serve every step, so a collision repeats until the job restarts. Hash four of them onto four spine uplinks, where load exactly equals capacity. The lesson's simulation finds no collision in only about 9 percent of steps, and the busiest uplink carries 2.1 flows on average, so the collective runs 2.1 times slower. Eight flows on eight uplinks: 2.6 times slower. Average utilisation of the uplinks looks perfect throughout.

The tell is run-to-run variance. Queue pair numbers, and so source ports, change every time the job starts, so the same code on the same nodes is fast on Monday and 40 percent slower after Tuesday's restart. "Slower, and nothing changed" is a hash collision until proven otherwise. The fixes: rail-optimised placement keeps most traffic off hashing, more queue pairs add entropy, and adaptive routing chooses a path per packet by queue depth, as InfiniBand and NVIDIA's Spectrum-X do. The AI fabric topologies lesson goes deeper.

## Incast: many senders, one receiver

Incast is many senders transmitting to one receiver at the same moment. Each sender's link is fine; the receiver's link gets the sum. In AI clusters it comes from all-to-all collectives in mixture-of-experts models, and from storage reads.

The trace. Six servers each send 1 megabyte to server 1 at the same instant, through the rail 1 leaf. Every link is 400 gigabits, which is 50 kilobytes per microsecond, and the egress port towards server 1 may take 2 megabytes of buffer. 2,400 gigabits arrive, 400 leave. How long until the queue is full?

[pause]

8 microseconds. The queue grows at the difference, 250 kilobytes every microsecond. After that, five of every six arriving packets are dropped, and by 20 microseconds half the data, 3 megabytes, is gone. Switch buffers are shallow by design: a 51.2 terabit chip with on the order of 100 megabytes holds about 16 microseconds of its own bandwidth.

And a drop is expensive here. Over TCP, a sender that loses the tail of its burst waits for the retransmission timeout, 200 milliseconds minimum on Linux: a step 54 percent longer for all 1,024 GPUs. RDMA is no better. A reliable queue pair accepts packets only in order, so after the first loss the receiving card discards everything from that sender until the missing packet is resent. That is go-back-N, the classic RoCE behaviour, and the senders resend 3.6 megabytes, more than the switch dropped.

So the industry stops dropping. Priority flow control, PFC, lets a switch pause one traffic class on the port feeding it when its queue crosses a threshold. With 200 kilobytes per port, at 4.8 microseconds the leaf pauses all six senders, and each then averages a sixth of 400 gigabits. Nothing is dropped, and the burst completes in 120 microseconds, the minimum for one port. The cost moves upstream, where pauses can spread, which a later lesson covers. ECN marking with DCQCN exists to slow senders before that threshold.

The whole event lasted 60 to 120 microseconds. Over a 30-second poll, 6 megabytes is 1.6 megabits per second on a 400 gigabit port. Seeing incast takes counters built for it: peak queue occupancy since the last read, pause frames per priority, ECN marks, and out-of-sequence and sequence-error counts on the cards.

## What idle costs, and the metric that matters

At an illustrative 2 dollars 50 per GPU-hour, the cluster costs about 22.4 million dollars a year, whether its GPUs compute or wait. Here is the number to remember: every step 1 percent longer spends about 222,000 dollars a year waiting. The 200 gigabit straggler costs about 3.56 million. So network capacity is cheap insurance next to the GPU servers, and AI back ends are built non-blocking, with a 400 gigabit card per GPU, which would be absurd for a web tier.

The metric that captures everything is job completion time: wall-clock time from launch to target. In words, the number of steps times the step time, plus each interruption's lost work and restart. For a job of one million steps, about 104 hours on a healthy fabric, about 123 with the straggler, including two or three interruptions of about 25 minutes each, a rate scaled from Meta's Llama 3 report. The network feeds both terms: a degraded link lengthens every step, and a link down past the collective timeout hangs the job until it restarts from a checkpoint.

Average utilisation hides the bursts, and loss rate misses lossless classes, where congestion shows as pauses. So treat network metrics as causes and job metrics as effects, and build the join: per job, step time and exposed communication against its baseline, the ports it uses, speed mismatches, utilisation inside collectives, microburst counters beside the cards' counters, and compute against communication per rank.

## In the interview

A principal engineer asks: a 1,024-GPU job is 15 percent slower since yesterday. How do you tell whether it is the network?

[pause]

Scope first: this job or every job, these nodes or all. Then compute against communication per rank. One rank's compute grew means a GPU or host. Communication grew everywhere means the job's ports: a speed mismatch, CRC errors, a collision after the restart, pauses and ECN marks on one egress. Then nccl-tests on those nodes against the known-good bus bandwidth. It is honest to say you would defer to the network team on threshold tuning, but build the join from job to ports that tells them where to look. The wrong answer starts with the whole fabric's error summary.

The follow-up: why not buy deeper buffers? A six-to-one burst grows the queue at five times the port rate, so 10 more megabytes buy 40 microseconds, and an all-to-all across hundreds of GPUs lasts longer. Deep buffers cost power and port density, and a full one adds hundreds of microseconds of queueing to every packet behind it. AI back ends use shallow, fast switches, slow senders early with ECN, and keep PFC as the last line against drops.

## Recap

Five things to remember. A training step is compute with the network silent, then every link at line rate at once, and averages hide it. A synchronous collective ends when its slowest transfer ends, so one half-speed link slows every GPU. RoCE flows are few, huge and simultaneous, with only a source port to hash, so collisions are the norm and show as variance after a restart. Incast is a microsecond event in a shallow buffer, and go-back-N or a 200 millisecond timeout amplifies each drop. And idle GPUs cost real money, so job completion time and step time are the top-line metrics.

At your desk: the training step and incast visualisations, the straggler, tail and collision tables, the RoCE header, the cost and completion time tables, the triage and step model code, and the top k flows problem.

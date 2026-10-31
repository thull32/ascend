---
lesson: parallelism-tp-pp-dp
source: 8dd0683a65a267c8
fit: partial
desk:
  - "The model sizes table and the collectives table with bytes sent per GPU"
  - "The tensor-parallel matrix split traced in Python on a two-by-four example, and the all-reduce diagram"
  - "The 1F1B schedule traced slot by slot for two stages and four microbatches"
  - "The parallelism traffic visualisation: one step on 16 GPUs, NVLink against the rails"
  - "The traffic calculator and its output for layouts A to D"
  - "The placement table for the 1,024-GPU layout, the failure modes table and the trade-offs table"
---
## Introduction

A 13-billion-parameter language model needs about 200 gigabytes of memory to train, and an H100 GPU holds 80. Even if it fitted, one GPU would need about six years on a trillion tokens. So the work is split across many GPUs, four ways: copy the model and give each copy different data, split every matrix, split the stack of layers into stages, or, for mixture-of-experts models, put different experts on different GPUs.

Each split exchanges different bytes, at different moments, through a different collective. And here is the number to sit up for: the same 16-GPU job can push 160 mebibytes or nearly 19 gibibytes per GPU per step through the network, depending only on where its ranks land.

Training repeats a step: a forward pass, a backward pass that computes the gradient, one number per parameter, and an optimizer update. A batch is cut into microbatches, processed one after another. Training state costs about 16 bytes per parameter, so the running model, 12.6 billion parameters with a hidden size of 5,120, needs 201 gigabytes.

The cluster is Meridian's San Jose back end: 128 servers of 8 GPUs. Inside a server, NVLink gives each GPU about 450 gigabytes a second each way. Each GPU also has its own 400 gigabit NIC, 50 gigabytes a second each way: one ninth of NVLink. NIC k of every server sits on rail k's leaves. And one fact from collectives: an all-reduce sends almost twice the buffer per GPU, whatever the group size.

## Data parallelism

Every GPU holds a full copy of the model and processes different microbatches. After the backward pass the copies hold different gradients, so they all-reduce them, and every copy applies the same average.

One all-reduce per step, of the whole gradient. A 1-billion-parameter model has 2 gigabytes of gradients; with 8 replicas, each GPU sends 3.5 gigabytes per step, 70 milliseconds at 50 gigabytes a second. That follows model size, not batch size: the microbatches' gradients are added up locally and reduced once.

The timing makes it tolerable. Gradients become ready layer by layer during the backward pass, so PyTorch groups them into 25 megabyte buckets and starts an all-reduce as each fills. But only the last microbatch's backward pass can hide the exchange.

Plain data parallelism needs all 16 bytes per parameter on every GPU, so it cannot train this model. ZeRO and FSDP shard that state across the group. The lighter stages replace the all-reduce with a reduce-scatter plus an all-gather: the same bytes, in two halves. Full sharding also shards the weights, so each layer's weights are gathered before its forward and again before its backward: one and a half times plain data parallelism, and now sitting in front of computation.

How it breaks: at a fixed global batch, adding replicas shrinks each one's compute but not the exchange, so communication's share grows with scale, and one slow link stalls every replica. The signal is a burst of gigabytes on every NIC in the job at once, at the end of every step.

## Tensor parallelism, and why it stays in the server

Tensor parallelism, from Megatron-LM, splits each layer's matrix multiplications across a group that behaves like one bigger GPU. The trick is the order of the split. The MLP block expands the width four times, applies an activation, and contracts it back. Split the first matrix by columns, and each GPU applies the activation to its own columns with no communication. Split the second by rows, and each GPU gets a full-size result that is only a partial sum. One all-reduce adds them. Attention splits by heads the same way: 40 heads become 10 per GPU in a group of 4.

Now the bytes. The all-reduced tensor is a full activation: 4,096 tokens times 5,120 times 2 bytes, 40 mebibytes. Two per layer forward, two backward, and in a group of 4 each GPU sends 60 mebibytes per all-reduce. A pipeline stage of 20 layers makes 80 all-reduces per microbatch: 4,800 mebibytes per GPU per microbatch, 37.5 gibibytes per step. More than ten times the data-parallel traffic, in the middle of every layer.

Why can that not go through the NICs?

[pause]

Four reasons, each enough alone. Volume: about 5 gigabytes per microbatch is 11 milliseconds on NVLink; split the group two and two over two servers and each NIC carries half, 50 milliseconds. It blocks: layer 2 waits for layer 1's sums. Count: 640 all-reduces per step, so microseconds per hop become milliseconds. And compute per microbatch is only about 97 milliseconds, so NVLink is an 11 percent tax, while the NICs add half the compute time or more.

The rule: the tensor-parallel degree is at most the GPUs in the scale-up domain, 8 on an HGX H100 server. The domain is what NVLink reaches, not the chassis: on NVIDIA's 72-GPU NVL72 rack, tensor groups can span the rack. More is not free even inside: at 8 instead of 4, the tax goes from 11 to 27 percent. Use the smallest degree that fits the model in memory, and pipeline stages for the rest.

## Pipeline parallelism

Pipeline parallelism cuts the layers into stages. Here, stage 0 runs layers 1 to 20 and stage 1 runs 21 to 40. Each microbatch's activations go forward after layer 20, one point-to-point send of 40 mebibytes, and their gradient comes back. When each stage is itself a tensor group of 4, each GPU sends only its quarter, 10 mebibytes, to the same-index GPU of the next stage, which rebuilds the whole over NVLink. Per step, 80 mebibytes out and 80 in per GPU. One handoff takes about a fifth of a millisecond.

So pipeline traffic is the cheapest of the four and the most sensitive to delay, because a stage idles until its input arrives. Even with instant handoffs there is a bubble: stage 1 waits for the first microbatch, and stage 0 idles at the end. The idle fraction is the stages minus one, over the microbatches plus the stages minus one. Two stages and 8 microbatches: one ninth, 11 percent. With 32 microbatches, 3 percent. Interleaved schedules give each GPU several chunks of layers, dividing the bubble by the number of chunks and multiplying the traffic by the same: network bytes traded for idle time.

It breaks when one handoff is slow or one stage is heavier: every stage behind it stalls, every step. The signal is the same stages idling every step.

## Expert parallelism

A mixture-of-experts model replaces each MLP with many experts and a router that sends each token to its top few. Mixtral has 8 experts per layer and sends each token to 2; DeepSeek-V3 has 256 and activates 8. Parameters grow with the experts; compute only with how many are picked. Expert parallelism puts different experts on different GPUs, so every token travels to its experts and back.

That is two all-to-alls per layer forward, dispatch and combine, and two more backward. Give the running model 8 experts, top 2, and 4,096 tokens per GPU: dispatch moves 80 mebibytes per GPU. With 8 experts on the 8 GPUs of one server, that is 10.9 gibibytes per GPU per microbatch over 40 layers, about 26 milliseconds of NVLink. Now spread 64 experts over 8 servers. 56 of every 64 copies leave the server, so 10.9 gibibytes go through each NIC: 235 milliseconds, more than twice the dense model's compute per microbatch.

Three things make all-to-all the hardest pattern a fabric carries. Every GPU talks to every GPU: 64 times 63, about 4,000 flows at once, mostly crossing rails. The routing depends on the data: if a popular expert gets three times its share of tokens, its GPU receives three times the bytes, an incast at one NIC, and the whole layer waits. And it sits on the critical path. Frameworks cap tokens per expert with a capacity factor, typically 1.25, and add a load-balancing loss; DeepSeek-V3's node-limited routing sends each token to at most 4 servers, once each, then fans out over NVLink.

The signal: per-layer all-to-all time with a long tail, uneven bytes received per NIC within one job, and congestion marks or pause frames on the hot GPUs' ports.

## One step on 16 GPUs, then 1,024

Now a whole step. The job runs on srv001 and srv002 as tensor 4, pipeline 2, data 2. Megatron puts tensor innermost, then data, then pipeline, and ranks are numbered server by server. So GPUs 0 to 3 and 4 to 7 of each server are tensor groups, GPU k pairs with GPU k plus 4 of the same server for data parallelism, and the pipeline runs from srv001 to srv002.

Follow one microbatch. On srv001, each tensor group all-reduces 40 mebibytes twice per layer, over NVLink. After layer 20, each GPU sends its 10-mebibyte quarter through its own NIC to the same GPU on srv002: one rail leaf, one switch. srv002 gathers the full activation over NVLink and runs layers 21 to 40, while srv001 starts the next microbatch. At the end of the step, each GPU all-reduces about 3 gigabytes of gradients with its twin, on the same server: 7 milliseconds.

Per GPU per step: about 40.7 gibibytes over NVLink, 160 mebibytes through the NIC. 99.6 percent of the bytes never leave the server. Place it differently: a whole replica per server sends the 2.9 gibibyte gradient all-reduce over the rails, 63 milliseconds, partly hidden. Split each tensor group two and two, and about 19 gibibytes per NIC of blocking traffic adds roughly 0.4 seconds to an 870 millisecond step.

Now the full cluster: tensor 8 fills each server, pipeline 2, data 64. The story reverses. Each GPU sends 2.9 gibibytes of gradients through its NIC at the end of every step, all 1,024 NICs at once: the elephant flows the back end is built for. That needs at least 62 milliseconds, and only about 32 hides behind the last backward pass, so roughly 7 percent of a 435 millisecond step is exposed. A bigger data group barely changes the bytes, but puts more links in each ring, any one of which can stall all 1,024 GPUs.

## Placement and rack-awareness

The layout fixes the bytes. Placement, the mapping from ranks to physical GPUs, fixes which links carry them. The framework's rank order picks the groups, the launcher numbers ranks server by server, and the scheduler decides which servers the job gets, in what order. Topology awareness lives there: Slurm's topology plugins and topology-aware Kubernetes schedulers take a map of servers to leaves to spines and hand out contiguous blocks.

Give the 1,024-GPU job srv001 to srv128 in order. Stage 0 is srv001 to srv064, exactly one leaf per rail. Each data-parallel ring is GPU k of those 64 servers, all on one rail leaf: one switch, no spine. Only the light pipeline handoffs cross the spines.

Now let a topology-blind scheduler hand over the same servers shuffled. What changes on the network?

[pause]

The bytes do not; the links do. Each data ring now spans both leaves of its rail, so about half its hops cross the spines, hashed by ECMP over 8 of them. RDMA is a few huge flows, so collisions are likely, and two elephants on one 400 gigabit uplink get 200 each, which paces the whole ring. Same bytes, different step time, varying with hash luck.

The rule: the heaviest communicator gets the fastest, least-shared links. Tensor and expert groups inside the scale-up domain, data parallelism within a leaf or pod, pipeline across spines if anything must. Placement also sets the failure domain: that job's stage 0 depends on all eight leaf1 switches, and one leaf reboot cuts one GPU off in each of 64 servers and sends the job back to its last checkpoint. And rack-aware is a loose name here: a rail leaf serves 64 servers in many racks, so the unit of locality is the leaf.

## In the interview

A job was rescheduled on the same number of GPUs, and its step time went up 15 percent. Where do you look?

[pause]

Scope first: this job, or every job. Then compare placements: do its data groups now span leaves, does a tensor group cross servers, does a port on its path run slow or with errors? Then the hosts: NIC-to-GPU affinity and congestion counters. The wrong answer is average fabric utilisation, which looks normal while one ring sits on a collided uplink. Defer to the ML team on framework flags, but bring the before-and-after placement and the per-rail counters.

## Recap

Data parallelism all-reduces the gradients once per step, about twice their size per GPU, following model size, partly hidden behind the backward pass.

Tensor parallelism all-reduces a full activation four times per layer, blocking, so its degree stops at the scale-up domain.

Pipeline handoffs are the lightest traffic but sit on the critical path, and the bubble is stages minus one over microbatches plus stages minus one. Expert parallelism's all-to-alls are every-to-every, data-dependent and incast-prone.

The layout fixes the bytes; placement fixes the links. Keep data rings on one leaf, and ask for the rank-to-port map before reading any counter.

At your desk: the model and collectives tables, the matrix split in code, the pipeline schedule trace, the parallelism traffic visualisation, the traffic calculator, and the placement, failure and trade-off tables.

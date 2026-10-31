---
lesson: parallelism-tp-pp-dp
source: 4f515f954bc52600
---
## 1

A 13-billion-parameter model is trained with tensor parallelism of 4 inside each server. Per GPU per microbatch, the tensor-parallel all-reduces move about 5 gigabytes. Why is moving the tensor-parallel group across two servers so much worse than moving the data-parallel all-reduce across servers?

A, tensor-parallel all-reduces use a different protocol that RoCE NICs cannot accelerate in hardware. B, NCCL compresses data-parallel traffic before sending, but cannot compress tensor-parallel traffic. C, tensor-parallel traffic is sent as many tiny packets that the fabric's switches must reassemble. D, tensor-parallel traffic blocks every layer, while the data-parallel all-reduce mostly overlaps the backward pass.

[think]

The answer is D: tensor-parallel traffic blocks every layer, while the data-parallel all-reduce mostly overlaps the backward pass.

Tensor parallelism sends more bytes and, above all, sits on the critical path: the next layer cannot start until its sums arrive, 80 times per microbatch here, so the NIC's ninth of NVLink bandwidth adds directly to compute time. Data-parallel gradients are reduced bucket by bucket during the backward pass, so much of that time hides. Both run as NCCL collectives over the same RDMA transport, and neither is compressed by default.

## 2

A 16-GPU job runs as tensor parallelism 4, pipeline parallelism 2 and data parallelism 2, with stage 0 on srv001 and stage 1 on srv002. What crosses the network?

A, every tensor-parallel all-reduce, because the two servers share one tensor group per stage. B, the pipeline handoffs and the data-parallel all-reduce, since both span the two servers. C, the data-parallel gradient all-reduce, about 2.9 gibibytes per GPU, once per step. D, only the pipeline handoffs, 10 mebibytes per GPU per microbatch in each direction.

[think]

The answer is D: only the pipeline handoffs, 10 mebibytes per GPU per microbatch in each direction.

With tensor parallelism innermost and data parallelism next, each tensor group and each data-parallel pair sits inside one server, so their traffic stays on NVLink. Only the pipeline boundary between srv001 and srv002 crosses the rails: each GPU sends its quarter of the 40 mebibyte activations, 80 mebibytes out and 80 in per step. The data-parallel pair would cross the network only if each server held a whole replica.

## 3

A pipeline has 4 stages and runs 12 microbatches per step with the one-forward-one-backward schedule. Roughly what fraction of each stage's time is bubble?

A, about 20 percent, from the stages minus one, over the microbatches plus the stages minus one. B, about 33 percent, the ratio of stages to microbatches. C, about 25 percent, one stage's share of the pipeline. D, about 8 percent, one slot for every microbatch.

[think]

The answer is A: about 20 percent, from the stages minus one, over the microbatches plus the stages minus one.

That is 3 over 15, which is 20 percent: the pipeline needs 3 extra slots, one fewer than the number of stages, to fill and drain around the 12 microbatches. Dividing stages by microbatches, or taking one stage's share, gives the wrong denominator. More microbatches or interleaved stages shrink the bubble, the latter at the cost of more pipeline traffic.

## 4

A mixture-of-experts job with expert parallelism of 64 across 8 servers shows per-layer all-to-all times with a long tail, and two NICs receive about three times the bytes of the others. What is the most likely cause?

A, hot experts receiving far more tokens than average, an incast. B, a pipeline bubble that grows because there are too few microbatches. C, ECMP hashing placing the all-to-all flows on too few spines. D, gradient buckets that are too small for the data-parallel all-reduce.

[think]

The answer is A: hot experts receiving far more tokens than average, an incast.

All-to-all volume depends on the data: the router sends each token to its top few experts, and the GPUs of popular experts receive more. Uneven receive bytes per NIC within one job point at routing skew, which capacity factors and load-balancing losses address. ECMP collisions would slow particular uplinks, not concentrate received bytes on particular NICs, and bubbles and buckets belong to pipeline and data parallelism.

## 5

The same job, tensor parallelism 8, pipeline 2 and data parallelism 64, runs on all 128 servers, once with the servers in leaf order and once in shuffled order. What changes?

A, the bytes each GPU sends per step, which rise with the number of switches crossed. B, the tensor-parallel traffic, which moves from NVLink onto the rails in the shuffled order. C, how many data-parallel ring hops cross the spines, and so ECMP collisions and step-time variance. D, nothing on the network, because NCCL rebuilds its rings to match any server order.

[think]

The answer is C: how many data-parallel ring hops cross the spines, and so ECMP collisions and step-time variance.

The layout fixes the bytes; placement decides which links carry them. In leaf order each data-parallel ring sits on one leaf per rail, so it never touches a spine. Shuffled, about half of each ring's hops cross spines, where elephant flows hash onto uplinks and can collide. Tensor traffic stays inside each server either way, and NCCL orders its rings within the servers it was given; it cannot move ranks to other leaves.

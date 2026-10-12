---
lesson: failure-detection-and-leases
source: ef10f326c86c30a7
---
## 1

A node's heartbeat is 8 seconds late. Which cause can the failure detector rule out from the silence alone?

A, a partition, since the other links are healthy. B, a crash, since a crashed host always resets TCP. C, a garbage collection pause, since pauses never exceed a few seconds. D, none of them, because all three produce the same silence.

[think]

The answer is D: none of them, because all three produce the same silence.

Silence carries no information about its cause. Pauses can last tens of seconds, a crashed or frozen host need not send a reset, and healthy links elsewhere say nothing about this one. That is why acting on a detection must stay safe when the detection is wrong, through leases and fencing.

## 2

Heartbeat intervals have a mean of 1,000 milliseconds and a standard deviation of 100. Under the normal model, when does phi reach 8?

A, about 8 seconds after the last heartbeat. B, about 1.56 seconds after the last heartbeat. C, about 1.8 seconds after the last heartbeat. D, about 18.4 seconds after the last heartbeat.

[think]

The answer is B: about 1.56 seconds after the last heartbeat.

A phi of 8 means an upper-tail probability of 1 in 100 million, which the normal distribution reaches 5.61 standard deviations past the mean: 1,000 plus 561 milliseconds. 18.4 seconds is what Cassandra's exponential model gives for a one-second mean. Adding 8 standard deviations confuses phi with a z-score.

## 3

In the lesson's simulation, a phi accrual detector with a threshold of 8 and no pause allowance raised about 0.25 false suspicions per node-hour. Why so far above what the threshold implies?

A, its window held only calm heartbeats, so the fitted tail was too thin. B, the logistic approximation it used is inaccurate close to the mean. C, the population variance underestimated the true deviation tenfold. D, network jitter dominated the distribution of the inter-arrival times.

[think]

The answer is A: its window held only calm heartbeats, so the fitted tail was too thin.

Long pauses arrive about once an hour, so a window of 1,000 steady one-second heartbeats rarely contains one. The fitted normal tail says a 1.6-second silence is a one in 100 million event, and pauses make it routine. Akka's acceptable heartbeat pause setting encodes the missing tail. The simulation used the exact normal distribution, and jitter was a few milliseconds.

## 4

A lease lasts 10 seconds, clocks drift at most 200 parts per million, and the safety margin is 100 milliseconds. When must the holder stop acting?

A, 9.898 seconds after sending the request, on its monotonic clock. B, 10.102 seconds after sending the request, on its monotonic clock. C, 10 seconds after receiving the grant, on its wall clock. D, 9.898 seconds after the grantor's timestamp inside the grant.

[think]

The answer is A: 9.898 seconds after sending the request, on its monotonic clock.

The lease shrunk by the drift is 9.998 seconds, minus the 0.1 second margin, giving 9.898. It is measured from the send time, because the grantor's clock started at or after receipt, and on a monotonic clock, so an NTP step cannot move it. 10.102 seconds is the grantor's wait, and a timestamp from the grantor compares two different clocks.

## 5

Client B is granted fencing token 34, and reads a record. Client A's delayed write with token 33 then arrives, and B writes based on what it read. What closes this gap?

A, the lease service revokes token 33 at the resource on expiry. B, a shorter lease, so A's writes arrive before B is granted. C, A re-checks its lease immediately before sending each write. D, B touches the resource with token 34 before it reads anything.

[think]

The answer is D: B touches the resource with token 34 before it reads anything.

Storage rejects 33 only after it has seen 34. A fenced read, or a no-op write with 34, raises the stored highest token before B relies on the data, so A's late write is rejected. A re-check by A cannot help, because the write was already in flight, and the lease service has no channel to the resource.

## 6

A Kubernetes 1.32 node loses power. With default settings, roughly when are its Deployment's pods started on other nodes?

A, after about 6 minutes: a 50-second grace period, then a 300-second toleration. B, only once an operator deletes the node object from the cluster. C, after about 40 seconds, when the kubelet's node lease expires. D, after about 10 seconds, when the kubelet misses one node lease renewal.

[think]

The answer is A: after about 6 minutes: a 50-second grace period, then a 300-second toleration.

The node lifecycle controller marks the node unreachable when its lease has not been renewed within the monitor grace period, 50 seconds from version 1.32, and 40 before. Pods then wait out the default 300-second toleration for the unreachable taint before eviction. Waiting for a manual delete is what StatefulSet pods need, not Deployment pods.

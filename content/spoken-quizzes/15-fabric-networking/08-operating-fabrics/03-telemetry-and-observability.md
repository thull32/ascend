---
lesson: telemetry-and-observability
source: dbd764ff55892a68
---
## 1

Leaf2 in Amsterdam stops streaming gNMI telemetry during heavy load. Its gRPC keepalive goes unanswered, the out-of-band ping to its management address replies in under a millisecond, and both spines report their IS-IS adjacencies to it up, with close to 100 percent receive load from it. What is the right conclusion?

A, the device has crashed and must be power-cycled, since its gRPC keepalive fails. B, the collector has failed, since every device at the site is affected equally. C, the device is alive and forwarding; its telemetry is lost in congested uplinks. D, the management network is broken, since the out-of-band ping should not reply at all.

[think]

The answer is C: the device is alive and forwarding; its telemetry is lost in congested uplinks.

The out-of-band reply proves the device is powered and its CPU is answering, and the neighbours, whose own telemetry still flows, show it forwarding with saturated uplinks. The gRPC keepalive travels the same congested path as the data, so its failure cannot separate dead from congested. A collector failure would silence the whole site, not one leaf whose neighbours keep reporting.

## 2

A poller computes link rates from SNMP polls every 10 seconds, and the results are noisy even though the traffic is steady. What is the most likely cause?

A, the rates are divided by the poller's own send times, which jitter by seconds. B, SNMP traps arrive out of order and corrupt the counter values. C, bulk responses drop every second value to fit in one UDP datagram. D, 32-bit counters wrap several times between polls on the link.

[think]

The answer is A: the rates are divided by the poller's own send times, which jitter by seconds.

SNMP carries no device timestamp, so the poller divides by its own request times, while the agent reads the counter at some unknown moment during handling. A couple of seconds of jitter is negligible over 300 seconds, but up to 20 percent over 10. A 32-bit wrap produces wildly low readings, not noise around the true value; traps are not used for counter rates, and bulk requests do not drop values.

## 3

sFlow samples 1 packet in 20,000 on a spine port. An analyst wants to bill a tenant for a single small flow that received 25 samples in an hour. How good is the estimate?

A, worthless, because sFlow cannot estimate bytes from samples. B, within about 39 percent at 95 percent confidence, too loose to bill from. C, accurate to about 1 percent, because sampling is random and unbiased. D, accurate to about 4 percent, because 25 samples cover a full hour.

[think]

The answer is B: within about 39 percent at 95 percent confidence, too loose to bill from.

The 95 percent error bound is 196 times the square root of one over the sample count, in percent. The square root of one twenty-fifth is one fifth, and 196 divided by 5 is about 39 percent. Random sampling is unbiased, but few samples give wide error bars. Aggregates and large flows with thousands of samples are within a few percent; billing a small flow needs flow records or exact counters.

## 4

Engineers propose adding a queue-pair label to the NIC RoCE counters in the metrics store for Meridian's back end of 1,024 NICs. What is the main cost?

A, device CPU, since NICs cannot export per queue pair counters at all. B, millions of new series per day, since queue pair numbers change every job. C, network bandwidth, since queue pair labels exceed the 1 gigabit out-of-band links. D, storage bytes per sample, since queue pair counters compress poorly.

[think]

The answer is B: millions of new series per day, since queue pair numbers change every job.

Cost in a time-series store is driven by the number of series. About 400 queue pairs, times 5 counters, times 1,024 NICs, adds roughly 2 million live series, and because queue pair numbers are new for every job, the store churns millions of new series daily, each needing index memory. Compressed samples stay cheap. Per queue pair data belongs in an event or columnar store, with aggregates as metrics.

## 5

Where should a fabric's bulk telemetry and its heartbeats travel?

A, bulk out of band for safety, and heartbeats in-band to test the real path. B, both on the data network, so telemetry follows the same paths as traffic. C, bulk on the data network in a protected class, and heartbeats out of band. D, both out of band, so telemetry never competes with customer traffic.

[think]

The answer is C: bulk on the data network in a protected class, and heartbeats out of band.

Out-of-band links are often about 1 gigabit per second and sized for reachability, while 1 second counters and sFlow for a large fabric need hundreds of megabits, so volume rides the data network, marked into a protected queue. Heartbeats and collector health ride out of band, so that a data-plane failure is reported as "blind here" instead of silence. Heartbeats in-band share fate with the failure they should detect.

## 6

After a four-minute telemetry gap, leaf2's stream in Amsterdam resumes. How should the platform record the missing interval?

A, as zeros, because no traffic was reported during the gap. B, as a gap, with the counter's average over the gap available and marked as such. C, as a straight line, interpolated between the two sides of the gap. D, as the last value before the gap, repeated until data resumes.

[think]

The answer is B: as a gap, with the counter's average over the gap available and marked as such.

A cumulative counter gives the exact average across the gap, the change in the counter over the elapsed device time, but not the shape inside it. So the honest record is a marked gap with that average available. Zeros draw an idle link during the busiest minutes, repeating the last value hides the outage, and interpolation invents a shape that never existed.

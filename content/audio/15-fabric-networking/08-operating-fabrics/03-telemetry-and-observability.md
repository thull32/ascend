---
lesson: telemetry-and-observability
source: 8b776e5143f381f7
fit: great
desk:
  - "The telemetry-blind visualisation, both runs: leaf2.ams alive and congested, then the same silence when it loses power"
  - "The SNMP poll trace and output, the gNMI Notification field by field, and the dial-in versus dial-out table"
  - "The sFlow datagram and IPFIX record field by field, and the sFlow sampling simulation with its output"
  - "The syslog lines, the counters-that-matter table and the What Just Happened output"
  - "The cardinality and storage calculation, the collector placement diagram, and the rate and verdict classifier code"
  - "The trade-offs table and the failure modes table"
---
## Introduction

Five seconds after ten, a Globex batch job saturates the uplinks of leaf2 in Amsterdam. For the next half minute the dashboard shows that leaf at 38 percent utilisation, green. The switch's telemetry rides the same congested uplinks as the job, gets dropped with the job's packets, and the dashboard keeps drawing the last value it received.

Network telemetry is the data a network sends about itself: counters and state, which say how much and whether something is up; packet samples, which estimate who is sending; flow records, which say who talked to whom; and events, which say what changed. If you build the platform, you decide poll or push, which counters, sampled or exact, how many time series the store can afford, and where collectors sit so that their own failure is visible.

So: polling against streaming, the dead-or-congested story, samples and flow records, events and drop reasons, and what it costs and where collectors live.

## Polling and streaming

SNMP, the Simple Network Management Protocol, dates from 1988. A poller asks an agent on the device over UDP port 161, and the agent can send unsolicited traps to port 162. Every value has an object identifier, a dotted path in a global tree. To poll ten counters on 64 ports, the poller makes 15 to 25 round trips, each answered by a process on the switch's CPU, and five minutes later computes the rate: the change in the counter, times eight, over the time between polls.

That model runs out in four ways. Averages hide bursts: at 400 gigabits per second, a 100 microsecond burst is 5 megabytes, enough to overflow a port's buffer share, and invisible in a five-minute mean. The timestamp is the poller's, not the moment the agent read the counter. With 2 seconds of jitter, a 300 second poll is off by under 1 percent, a 10 second poll by up to 20. Faster SNMP is noisier SNMP. Every poller costs device CPU, and traps are fire and forget, lost silently, most often when the network is in trouble.

Streaming inverts the model: the device sends data on a schedule or on change, stamped with its own clock. The dominant protocol is gNMI, the gRPC Network Management Interface from the OpenConfig operator group, over HTTP 2, TLS and TCP. Its Subscribe call names paths, such as an interface's counters, and a mode. In stream mode, each path is either sampled at an interval, for counters, or sent on change, for state like a link or a BGP session, or left for the device to choose. A heartbeat interval forces a send at least that often, so silence can be told apart from "unchanged".

In dial-in, the collector opens TCP to the device and subscribes, so subscriptions live centrally, in code, and the collector notices its own failed dial. In dial-out, the device connects to the collector: easier across NAT and security zones, and a reconnect can land on any healthy collector. But subscriptions then live in every device's configuration, and a device can only retry, so the collector must alert on absence. Meridian uses dial-in from a collector at each site.

Under the hood, the switching chip increments counters at line rate for free; the expensive part is the CPU reading them. In SONiC, a process copies chip counters into a database about once a second, and gNMI is answered from there. So a 100 millisecond subscription returns ten copies of each reading and loads the CPU for nothing. It breaks when subscriptions outrun the CPU, and when an in-band stream stalls with the very congestion it should report.

## Dead or congested

Back to the opening, with two spines, so leaf2 has 800 gigabits of uplink. The collector streams leaf2's counters every 10 seconds over the data network, marked best effort. A separate monitor reaches every device's management port over the out-of-band network.

Five seconds after ten, the job offers about 1.1 terabits per second to those 800 gigabits, and the telemetry is tail-dropped with it. Thirty seconds after ten, three samples have been missed, and an absence alert fires. The gRPC keepalive is unanswered too, but it travels the same data path, so it cannot tell dead from congested.

Before I tell you: what signal would?

[pause]

Two independent witnesses. The out-of-band ping to leaf2's management address answers in 0.6 milliseconds: the box is powered and its CPU answers. A dead device does not reply. And both spines, whose own telemetry still flows, report their links to leaf2 up, IS-IS adjacencies up, and 399 of 400 gigabits arriving from it on each port. Verdict: alive, telemetry blind, uplinks saturated. The stream resumes four minutes and ten seconds after ten.

Run it again with leaf2 losing power. The same alert fires, but this time the out-of-band pings time out while the rest of the management switch answers, and both spines report loss of signal and adjacencies down. Verdict: dead, page on-call. An out-of-band reply with adjacencies down would mean a third state: alive, but cut off from the fabric.

Three design rules follow. Alert on absence: missing data crosses no threshold, so the collector must know how often each device should report. Keep the heartbeat off the data path. IS-IS hellos survived because switches send routing packets in a network-control queue; best-effort telemetry gets no such priority, so the durable fix marks it CS2, DSCP 16, the class set aside for operations and management, with a guaranteed queue share. And record a gap as a gap. Zeros would draw an idle link in the busiest four minutes of the day. The cumulative counter still gives the average across the gap, 389 gigabits per second over 250 seconds, but not the shape inside it.

## Samples and flow records

Whose traffic it is needs headers, and no switch can export every header at 400 gigabits. sFlow samples in the chip: after each sample it picks a random skip count averaging N, then copies the first 128 bytes of the packet it lands on to the CPU, which sends them over UDP. No per-flow state, so it is cheap enough for every port. Meridian samples 1 in 20,000 on 400 gigabit ports, about 500 samples a second per busy port.

The 128 bytes reach inside the tunnel: VXLAN's outer headers take 50 bytes, and the inner headers end at byte 104, so the collector sees the tenant's five-tuple, the addresses, ports and protocol of a flow, and the VNI, the segment number. The VNI is not optional. Acme's web server and Globex's app server both have the address 10.1.1.10. Key flows on the inner IP alone and you merge two customers.

How accurate is a sample? The 95 percent error bound is 196 times the square root of one over the sample count, in percent: 10,000 samples give plus or minus 2 percent; 100 give 20. In the lesson's one-minute simulation, every large flow lands within its bound and a thousand small flows together are within 1 percent. But one small flow with 17 samples is good to about 48 percent: fine for ranking, not for billing. A 60-packet probe has a 0.3 percent chance of being sampled at all. And sFlow samples packets, not bytes, so a jumbo-frame flow carrying the most bytes gets fewer samples and a wider error bar.

IPFIX, the standard form of NetFlow version 9, keeps a flow cache instead and exports a record when a flow ends: after an inactive timeout, say 15 seconds, or every active timeout, usually 60, for long flows. A 150 second download at 1 gigabit per second makes three records: 7.5 gigabytes, 7.5 again, then 3.75 when the FIN arrives. Records follow templates, so a restarted collector cannot decode anything until the exporter resends them. Data center chips mostly do sFlow, because a per-flow cache at hundreds of millions of packets a second needs memory most chips lack; edge routers commonly export IPFIX.

## Events, counters and drop reasons

Counters say how much; events say what changed. Syslog's priority is the facility times eight plus the severity, so 187 means local7 error. But the message is free text, worded differently by every vendor and release, so a release that rewords a message silently breaks an alert, and over UDP it is lost exactly when links fail. Prefer structured events where you can: gNMI on-change for link, adjacency and session state, and for BGP, BMP, which streams every session change and route. Keep syslog for what no model records: a crash, a failed login, a hardware fault.

The counters that matter are few: corrected FEC codewords, which climb for days before a gray failure; checksum errors and discards; per-queue drops and buffer watermarks; PFC pauses; and on hosts, retransmits and RoCE congestion counters, the half of congestion switches do not show.

Three rules turn counters into answers. Compute rates on the device's timestamps, and discard a step where the counter went backwards, a reboot or a clear. Compare both ends of every link: packets out of one side minus packets into the other is the link's loss, and if far-end checksum errors match it, the link corrupts frames; if nothing matches, something drops silently. And prefer watermarks to utilisation: a watermark holds the peak since it was last read, so a 10 second watermark catches a 50 microsecond burst an average never shows.

A drop counter says how many died, not which or why. NVIDIA's What Just Happened, on Spectrum switches, has the chip copy each dropped packet's headers to the CPU, rate-limited, with a reason: blackhole route, TTL too small, ACL, tail drop on a named queue. On leaf1 it can name a configuration bug without a packet capture: Acme's web server sending to a subnet its VRF black-holes. Filter harmless traceroute expiries before paging, and split reasons into configuration and capacity, because they go to different teams. In-band telemetry, INT, goes further: each switch appends metadata such as hop latency and queue depth to selected packets. This packet waited 41 microseconds in queue 3 at spine2. Four fields over three hops add 64 bytes that must fit under the MTU, so it is enabled selectively.

## Series and collectors

A time-series store keeps one series per unique combination of metric name and labels. Compressed samples are cheap; the number of series, the cardinality, is what costs, because each live series needs index memory. Meridian's San Jose GPU back end comes to about 245,000 series: about 3 gigabytes a day at 10 second resolution, 32 at 1 second. Ten times the storage, and affordable.

Now someone adds one label: the RDMA queue pair. Here is the number to remember: about 2 million extra live series, and because queue pair numbers are new every job, 12 million new series a day. Their index alone needs about 8 gigabytes, against 1 for everything else. So keep only bounded labels in the metrics store: device, port, queue, tenant, site. Per-flow and per-queue-pair data goes to an event or columnar store, or into a top-k aggregate. And downsample gauges like watermarks by keeping the maximum, because an average of peaks is not a peak.

Where do collectors live? Out-of-band links are commonly 1 gigabit, already busy with SSH and configuration. The back end's counters at 1 second need about 200 megabits, and sFlow adds about 500. So Meridian splits. Volume rides the data network, marked CS2 into a protected queue, to a collector in each site. Heartbeats and collector health ride out of band. And watch the watchers: if Amsterdam's collector loses its path to the central store, nothing arrives and nothing alerts, so a prober in Singapore and an alert on no data from Amsterdam for 2 minutes make "blind at Amsterdam" a state of its own.

## In the interview

Telemetry from a device stops. How do you tell dead from congested?

[pause]

An absence alert starts triage. The gNMI keepalive cannot decide, because it shares the data path. The out-of-band ping says whether the box is alive; the neighbours' link state, adjacency and receive load say whether it forwards and how hard. Prevention is a protected queue for telemetry. The common wrong answer is pinging its loopback over the same congested fabric.

Another: why move from SNMP to gNMI, when polling every 10 seconds works? Device timestamps, one read fanned out to many consumers, on-change events, and structured models. But subscriptions cost device CPU. The wrong answer is "gNMI is real time". It is periodic sampling with better timestamps.

## Recap

Five things. Silence is a state to classify, streaming, blind but alive, cut off, dead, or collector-blind, from signals independent of the silent device. Streaming beats polling on timestamps and fan-out, but it is still sampling. Quote sFlow with its error bar, and key tenant flows on the VNI. Read both ends of a link, prefer watermarks and drop reasons to utilisation, and record gaps as gaps. And budget telemetry in series, with volume in-band in a protected class and heartbeats out of band.

At your desk: the telemetry-blind visualisation, the SNMP and gNMI traces, the sFlow and IPFIX packets and sampling simulation, the syslog and drop-reason output, the cardinality code and collector diagram, the classifier, and the trade-off and failure tables.

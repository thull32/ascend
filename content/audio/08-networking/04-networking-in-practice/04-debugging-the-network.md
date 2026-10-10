---
lesson: debugging-the-network
source: b53ae1b70e18542d
fit: partial
desk:
  - "The curl verbose output and the two timing runs, subtracted into phases"
  - "The dig versus getent comparisons, and the order to run them in"
  - "The mtr report, hop by hop, and the TCP-mode run"
  - "The ss and nstat triage table"
  - "The four packet captures: a healthy exchange, a refused port, dropped SYNs, and a reset on a reused connection"
  - "Exercise: turn curl's cumulative timings into phases"
---
## Introduction

Users in Sydney report that the API is slow. The service dashboard shows a 99th percentile handler time of 45 milliseconds, all green. Both are true, because they measure different things. The dashboard times the handler. The user times DNS, a TCP handshake, a TLS handshake, every router between Sydney and Virginia, the queue in front of your process, the handler, and the response body crossing an ocean. Somewhere in that list is the answer, and "the network is slow" is not one.

Network debugging is cutting that list into phases and timing each one from where the problem happens. Each tool answers exactly one question. Knowing which question you are asking is most of the skill.

Five tools, then, and the trap in each. curl, a stopwatch for one request. dig, which is not what your process sees. mtr, which lies at intermediate hops. ss and nstat, the kernel's own counters. And tcpdump, the ground truth. Then the trick of reading a latency number as the name of a timer.

## The method

Split every request into phases: name resolution, the path, the connection, TLS, the transfer, and the application. Ask of each one whether it is the slow part.

Two rules make that work. First, measure from where the problem is. The same request from your laptop, from a pod in the cluster and from the user's region can take three different paths through three different resolvers. If the complaint comes from a pod, run the tools inside that pod's network. Second, go cheapest first. A timed curl takes a second and often names the phase outright. A packet capture takes an hour to read, and is for when the cheap tools disagree.

## curl: a stopwatch

curl in verbose mode narrates a request: which addresses DNS returned and which one it tried, the TLS version, the negotiated HTTP version, the certificate's subject and expiry, and every header on the way. In the lesson's example, two response headers said a CDN edge answered from a copy cached six seconds earlier. The origin was never involved.

With its write-out option, curl prints a timestamp for each phase. Here is the trap: those timings are cumulative. Each is measured from the start of the request, not from the previous phase. You subtract to get phases.

From the lesson's machine to a CDN-hosted site: DNS 31 milliseconds, TCP 54, TLS 55, request to first byte 61. Every phase after DNS was about one round trip of roughly 55 milliseconds. Nothing was slow.

Now the Sydney complaint, as an illustrative run to Virginia. TCP 201 milliseconds, TLS 207, the request and server 243, the body transfer 206. Total 861. The server spent about 40 of those. Optimising the handler saves at most 40 milliseconds. The fix is fewer round trips: terminate TLS at an edge near users, cache at a CDN, or run closer to them.

And a warning. On that same access link, three consecutive connections took 30, 54 and 157 milliseconds. One sample proves nothing. Run it several times and compare distributions.

## dig, and what your process sees

dig sends a DNS query straight to a server. Your application does not. It calls the system resolver, which reads the hosts file first, may go through a caching stub, applies search domains, and may cache again inside the runtime. A correct dig answer proves only that DNS is correct.

The lesson's example: dig says payments dot internal is one address, and getent, which asks the way the process does, says another. Someone left a line in the hosts file. When the two differ, the application is right about what it is doing, and dig is right about what it should be doing.

So compare in order: getent, what the process gets; dig against the configured resolver; dig against a public resolver; and dig with trace, straight to the authoritative servers. The first place answers diverge is the layer with the problem. Inside Kubernetes, read the pod's resolver config too: an ndots setting of 5 turns one lookup of an external name into several search-domain queries that each fail first.

## mtr: reading the path without being fooled

mtr sends probes with increasing time-to-live, so each router on the path reveals itself, and keeps per-hop statistics, which is what intermittent problems need.

Here is a question the lesson expects you to get right. mtr shows 40 percent loss at hop 5 and none at any hop after it, including the destination. Is hop 5 the problem?

[pause]

No. If hop 5 really dropped forwarded traffic, every later hop would show at least that much loss. Routers forward packets in hardware but answer probes addressed to themselves from a rate-limited, low-priority CPU. Hop 5 is declining to answer probes, not dropping traffic. Loss only counts if it continues to the destination.

The same rule applies to latency. In the lesson's output, one router averaged 108 milliseconds with a worst case near 760, and the very next hop averaged 22. That router was busy answering probes, not delaying packets. The real cost appeared at hop 3, the access link, adding about 20 milliseconds that every later hop inherited. Latency only counts if it persists.

Two more. The path back is usually not the path out, so send output from both ends when you report a problem. And TCP-mode probes to a CDN edge can show heavy loss at the destination while real connections succeed every time, because the edge may treat a burst of half-open connections as a flood. Confirm any mtr finding with the application's own protocol.

## The kernel's counters, and the capture

ss reads socket state from the kernel and answers what this host is doing on the network right now. Counting sockets by state often says enough. Thousands in time-wait on a client: connections are not being reused. A growing close-wait: your code is not closing sockets after the peer hung up, a bug in your process, not the network. Many in syn-sent: connection attempts are not being answered. And a full receive queue on a listening socket: the accept queue is full and new connections are being dropped. nstat adds the counters, like listen overflows, and printing the change since its last run tells you exactly what one experiment did.

When the cheap tools disagree, capture the packets, narrowly and to a file, with a filter on the conversation you care about. Capture at both ends when you can: the difference between what one side sent and the other received is the network.

The lesson reads four captures. Learn their signatures. A SYN answered at once by a reset: the host is up and nothing listens on that port, connection refused. A SYN, then the same SYN again after about a second, and again: nothing is answering. A firewall dropping, a host that is down, or a full accept queue.

That last one is worth the detail. The lesson ran a server that never accepted, and four clients. The capture showed SYNs arriving and never answered, and the server's listen-overflow counter rose by exactly four. The kernel drops those SYNs after the capture point, which is why you see them arrive. From the client side, this is indistinguishable from a lossy network. The server's counters name it.

And the fourth: a reset on a reused connection. The server closes connections idle for two seconds and sends a FIN. The client's kernel acknowledges it, but the application is not reading, so it does not notice. A second later it writes the next request into the half-closed connection, and the server's kernel, whose socket is gone, answers with a reset. A load balancer in the client's position returns a 502.

One last trap. In a capture taken on the sending host, you will see "incorrect" checksums and single packets of 64 kilobytes. Those are offload artefacts: the network card fills in checksums and cuts segments to size after the capture point. Do not open an incident about them.

## When the number is the clue

Latency that clusters at a particular value is a timer firing, and the value names the timer.

About one second, then more: SYN retransmission. A connection attempt went unanswered. About 200 milliseconds extra: a data segment retransmitted after a timeout, often tail loss. About 40 milliseconds: Nagle's algorithm meeting delayed acknowledgements on small writes. About 5 seconds: a DNS query lost, the resolver's default timeout. Exactly 30 or 60 seconds: someone's configured timeout; find whose. And multiples of the round trip: handshakes and slow start. Physics, not a fault.

That distinction is what lets you write an incident summary a director can act on. In the curl trace, every phase was a multiple of one round trip: physics. In the accept-queue capture, a timer fired: a fault.

## In the interview

A follow-up the lesson expects. curl says the time to first byte is 950 milliseconds. How much of that is the server?

[pause]

Not 950. The timings are cumulative, so subtract the moment the request was ready to send, which includes DNS, TCP and TLS. Then subtract one more round trip, which you can read from the TCP handshake, because the request itself has to travel. If the handshake took 90 milliseconds and the request was ready at 181, roughly 680 milliseconds is the server: queueing, the handler, or its dependencies.

And another. A service's latency has spikes at exactly one second. That is the initial SYN retransmission timeout, so a SYN or the handshake's last acknowledgement was dropped. Check the server's listen overflows, the node's connection-tracking table and any firewall in the path, then confirm with a capture showing the repeated SYN. The wrong answer is garbage collection pauses, which do not cluster at exactly one second.

## Recap

Four things to remember. Debug by phase, from where the problem is, cheapest tool first, and never trust one sample. curl's timings are cumulative milestones, and dig is not what your process sees: check getent first. In mtr, loss and latency only count if they persist to the destination. And read latency clusters as timers: one second is a dropped SYN, 200 milliseconds a retransmission, 40 Nagle, 5 seconds DNS.

At your desk: the curl output and timing runs, the dig and getent comparisons, the mtr report, the ss triage table, the four packet captures, and the curl phases exercise.

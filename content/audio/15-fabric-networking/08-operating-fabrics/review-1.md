---
review: operating-fabrics
source: 35bea38fd78ce96f
---
## Introduction

Twelve questions from the operating fabrics module, first part. Answer out loud before the answer comes.

They run in the order of the lessons: network automation and the source of truth, configuration APIs, telemetry and observability, and active measurement. Each one has four options, A to D, then a few seconds for you to commit to one.

## Question 1

The source of truth no longer contains Acme's staging segment, VLAN 300 on VNI 10102. The automation renders leaf1's configuration in Amsterdam and pushes it in merge mode, and the push reports success. What is on the device afterwards?

A, the push is rejected, because VLAN 300 conflicts with the render. B, VLAN 300 is removed, because the render no longer contains it. C, VLAN 300 is disabled but kept, because merge marks absent lines inactive. D, VLAN 300 is still configured, because merge only sets the paths it names.

[think]

The answer is D: VLAN 300 is still configured, because merge only sets the paths it names.

A merge adds or overwrites every setting the payload names and leaves everything else alone, and a render can only name what exists. VLAN 300 is not named, so it stays, and the device keeps advertising its EVPN type-3 route. Removing it needs an explicit delete computed from a diff against running, or a replace of the section. Nothing conflicts and nothing is marked inactive: the push succeeded exactly as designed.

## Question 2

The nightly diff shows the IS-IS metric on leaf1's port swp52 at 1000 on the device and 10 in the source of truth. An engineer set it by hand during an incident. What should the platform do?

A, ignore it, because IS-IS metrics are operational state, not configuration. B, revert it automatically, because the source of truth always wins. C, raise it as drift, for the owner to revert or to record as an exception. D, update the source of truth to 1000, because the device reflects reality.

[think]

The answer is C: raise it as drift, for the owner to revert or to record as an exception.

Either side can be right: the override may still be needed, with the optic still failing, or be stale, with the optic replaced. A person decides, and the platform records the decision: a revert, or an exception with an owner and an expiry so the diff stops reporting it until then. Automatic revert can undo an emergency fix mid-incident, and blindly adopting the device's value turns every manual change into intent.

## Question 3

A source-of-truth query times out and returns leaf1 with no segments. The automation renders and pushes the VLAN and EVPN sections in replace mode. What happens, and what guard prevents it?

A, only new VLANs are blocked, and the existing ones are kept until a merge. B, every VLAN on the leaf is deleted, and a limit on deletions per push stops it. C, the device rejects the replace, because empty sections are invalid on every network operating system. D, nothing changes, because replace mode skips sections whose payload is empty.

[think]

The answer is B: every VLAN on the leaf is deleted, and a limit on deletions per push stops it.

Replace makes the payload the complete content of the section, so an empty section means delete everything in it, and every tenant on the leaf loses connectivity. The diff is correct given its input. The fix is a circuit breaker in front of the push that refuses deletions above a threshold without a person's approval. Devices do not treat empty payloads specially, and replace does not fall back to merge.

## Question 4

The automation commits a new management access list to leaf1 in Amsterdam with commit confirmed, a 120 second timeout and a persist token. The list has a typo that blocks the automation's own address. What happens if nobody intervenes?

A, the change stays until an engineer removes it from the console, as with a plain commit. B, the device rolls back the instant the automation's NETCONF session times out. C, the commit is refused, because validation rejects an access list that blocks its own client. D, the device rolls back to the previous revision when the 120 second timeout expires.

[think]

The answer is D: the device rolls back to the previous revision when the 120 second timeout expires.

With persist, the pending confirmed commit survives the session, so the rollback comes from the timer, at 120 seconds. Without persist, it would roll back as soon as the session ended. Validation cannot catch the typo: the address is a well-formed prefix, and YANG checks form, not intent. A plain commit is what would leave the change in place.

## Question 5

A gNMI Set request contains a replace at the path holding all access-list sets, and its value holds only the new MGMT-IN list. The device also had an SNMP-IN list. What is the result?

A, SNMP-IN is kept until a separate delete for its path is sent in another request. B, SNMP-IN is deleted, because replace makes the value the whole content at that path. C, the request is rejected, since a replace may not remove an existing list. D, MGMT-IN is replaced and SNMP-IN is kept, since the value does not mention it.

[think]

The answer is B: SNMP-IN is deleted, because replace makes the value the whole content at that path.

Replace means the value is the complete new content at the path, so every sibling the value omits is deleted. Keeping unmentioned siblings is what update does, because update merges. Nothing in gNMI forbids the deletion. The fix is to replace at the narrowest path that holds the change: the MGMT-IN list itself.

## Question 6

On a SONiC leaf, a tool writes VLAN 300 into CONFIG DB and gets success. Which check best shows the VLAN is actually in force?

A, running config save and confirming that the saved config file contains the VLAN. B, reading the VLAN key back from CONFIG DB and comparing every field. C, reading the VLAN's state in STATE DB, which daemons write after acting. D, confirming the Redis write returned OK and the CONFIG DB key count grew.

[think]

The answer is C: reading the VLAN's state in STATE DB, which daemons write after acting.

CONFIG DB holds what was asked for. The manager daemons, the orchestration agent and syncd act on it asynchronously, and STATE DB records what actually came up. Reading CONFIG DB back, or saving it to disk, only proves the request was stored, which the successful write already told you.

## Question 7

Leaf2 in Amsterdam stops streaming gNMI telemetry during heavy load. Its gRPC keepalive goes unanswered, the out-of-band ping to its management address replies in under a millisecond, and both spines report their IS-IS adjacencies to it up, with close to 100 percent receive load from it. What is the right conclusion?

A, the device has crashed and must be power-cycled, since its gRPC keepalive fails. B, the collector has failed, since every device at the site is affected equally. C, the device is alive and forwarding; its telemetry is lost in congested uplinks. D, the management network is broken, since the out-of-band ping should not reply at all.

[think]

The answer is C: the device is alive and forwarding; its telemetry is lost in congested uplinks.

The out-of-band reply proves the device is powered and its CPU is answering, and the neighbours, whose own telemetry still flows, show it forwarding with saturated uplinks. The gRPC keepalive travels the same congested path as the data, so its failure cannot separate dead from congested. A collector failure would silence the whole site, not one leaf whose neighbours keep reporting.

## Question 8

Where should a fabric's bulk telemetry and its heartbeats travel?

A, bulk out of band for safety, and heartbeats in-band to test the real path. B, both on the data network, so telemetry follows the same paths as traffic. C, bulk on the data network in a protected class, and heartbeats out of band. D, both out of band, so telemetry never competes with customer traffic.

[think]

The answer is C: bulk on the data network in a protected class, and heartbeats out of band.

Out-of-band links are often about 1 gigabit per second and sized for reachability, while 1 second counters and sFlow for a large fabric need hundreds of megabits, so volume rides the data network, marked into a protected queue. Heartbeats ride out of band, so that a data-plane failure is reported as "blind here" instead of silence. Heartbeats in-band share fate with the failure they should detect.

## Question 9

After a four-minute telemetry gap, leaf2's stream in Amsterdam resumes. How should the platform record the missing interval?

A, as zeros, because no traffic was reported during the gap. B, as a gap, with the counter's average over the gap available and marked as such. C, as a straight line, interpolated between the two sides of the gap. D, as the last value before the gap, repeated until data resumes.

[think]

The answer is B: as a gap, with the counter's average over the gap available and marked as such.

A cumulative counter gives the exact average across the gap, the change in the counter over the elapsed device time, but not the shape inside it. So the honest record is a marked gap with that average available. Zeros draw an idle link during the busiest minutes, repeating the last value hides the outage, and interpolation invents a shape that never existed.

## Question 10

A ping between agents behind leaf1 and leaf3 in Amsterdam gets 100 replies out of 100, while about a quarter of Acme's connections between those racks retransmit heavily. The fabric has four spines. What is the most likely explanation?

A, ICMP is prioritised over TCP, so ping hides the congestion that TCP feels. B, ping uses a smaller MTU, so it passes a link that drops only large frames. C, the ping hashes onto one spine, and a link on another path drops packets. D, the retransmissions are caused by the hosts, since the network showed zero loss.

[think]

The answer is C: the ping hashes onto one spine, and a link on another path drops packets.

ICMP has no ports, so every echo between the two addresses hashes to the same spine and tests one path in four. A gray link on another spine damages the quarter of connections hashed onto it. Prioritisation or an MTU problem could also make ping disagree with TCP, but neither explains a clean quarter split, and 100 clean pings only bound the loss below about 3 percent on one path.

## Question 11

A TWAMP sender's clock is 1.5 milliseconds behind the reflector's. What does that do to the measurements?

A, the round trip is correct, but the one-way delays are off by 1.5 milliseconds. B, both the round trip and the one-way delays are off by 1.5 milliseconds. C, the round trip is off by 3 milliseconds, twice the offset, and the one-way delays are correct. D, nothing, because the reflector subtracts the offset before replying.

[think]

The answer is A: the round trip is correct, but the one-way delays are off by 1.5 milliseconds.

The round trip is measured from the sender's send to its receive, less the reflector's dwell, and each of those differences is taken on one clock, so any offset cancels. One-way delay, from the sender's send to the reflector's receive, mixes the two clocks and absorbs the whole offset. The reflector reports raw timestamps and an error estimate; it cannot know the sender's offset.

## Question 12

Probes from leaf1 to leaf3 through spine3 lose 4 percent. Probes from leaf2 to leaf3 through spine3 also lose 4 percent. Probes from leaf1 to leaf2 through spine3 lose nothing. Which element is the prime suspect?

A, spine3 itself, since every bad path crosses it. B, leaf3's uplinks towards all four spines. C, the link from leaf1 up to spine3. D, the link from spine3 down to leaf3.

[think]

The answer is D: the link from spine3 down to leaf3.

The elements common to the two bad paths are spine3 and its downlink to leaf3. The good leaf1 to leaf2 path crosses spine3 and leaf1's uplink to it, which clears both. Only the spine3 to leaf3 link is on every bad path and on no good one. A fault in leaf3's uplinks generally would show on every spine, not on one alone.

## Recap

Three ideas kept coming back. Absence means different things to different operations: a merge never deletes what it does not name, a replace deletes everything it does not name, and an empty render under replace wipes a leaf unless a deletion limit stops it. Success at one layer is not proof at the next: a stored write is not a running VLAN, a silent telemetry stream is not a dead device, and a clean ping tests one path out of four. And localising a fault means comparing paths: spread probes across the hash, then find the one element on every bad path and on no good one.

---
lesson: cap-and-pacelc
source: 714dd3fcbafc25b9
fit: great
desk:
  - "The etcd and Cassandra partition traces, and the partial-partition flapping trace"
  - "The PACELC latency simulation code and its table"
  - "The two-region placement table, rows A to E"
  - "The escrow trace and the per-operation decision flowchart"
---
## Introduction

An interviewer asks: is your system CP or AP? The answer they are listening for is not two letters. They are checking whether you know the question is malformed. CAP is about one moment: the network has split, a node has a request in hand, and it must either answer with what it has, and risk being wrong, or refuse, and be unavailable. Everything else attributed to CAP, "pick two", "CA databases", the idea that it describes normal operation, is folklore.

The real decision is made per operation, with numbers: how long partitions last, what a quorum round trip costs, what the user sees either way. Four ideas, then. What the theorem actually says. What a real CP store and a real AP store each do through a partition. The latency you pay every day when nothing is partitioned. And how to choose per operation, including how to remove the coordination altogether.

## What CAP says

Gilbert and Lynch's formal statement, from 2002, is about a single value replicated across nodes. Consistency means linearizability: every read returns the latest acknowledged write, as if there were one copy. It is not the C in ACID. Availability means every request to a non-failed node eventually gets a non-error response. Not fast, and not "the service is up": every node must answer. Partition tolerance means operating while messages between nodes are dropped or delayed indefinitely.

The proof is one paragraph. Split the nodes into two groups that cannot talk. A client writes x equals 1 to group one; another client reads x from group two, which has not heard of the write. If group two answers, it answers 0 and breaks linearizability. If it refuses, or waits for the partition to heal, it breaks availability.

Four consequences that most descriptions get wrong. First, P is not a choice. Switches fail, a firewall drops one direction, a 20-second garbage collection pause makes a node look partitioned with no packet lost. A system that "chose CA" has simply not decided what it does during a partition, so it does something arbitrary. Second, CAP says nothing about normal operation; with a healthy network nothing stops a system being both. Third, it is per operation: a store can refuse writes to a key whose leader is unreachable and serve every other key. And fourth, availability is binary in the theorem and continuous for users. A node that answers after 30 seconds is available to the theorem and down to users. The moment you set a timeout, you have chosen: a CP store returns errors, an AP store returns stale data.

## A CP store through a partition

Three etcd members, with n1 leading. Heartbeats every 100 milliseconds, an election timeout of one second. At time zero a switch failure isolates n1. A client on n1's side writes x equals 1. n1 appends it to its log, but it cannot reach a majority, so the write is never committed. At about one second, two things happen. n1 notices it has not heard from a majority for an election timeout, and steps down. On the other side, n2 times out, wins an election with n3's vote, and by about 1.2 seconds writes commit again on n2 and n3.

Five minutes later the partition heals. n1 hears the newer term, follows n2, and throws away its uncommitted write. Nothing acknowledged is lost, because that client was never told it succeeded.

Count the cost. Clients on the majority side lost one to two seconds to the election. Clients on the minority side lost the whole partition. That is what CP means: refuse on the side that cannot reach a quorum, and never acknowledge what might be lost.

Real partitions are often partial, and that is worse. A failing switch drops traffic between n1 and n3, while both still reach n2. With plain Raft, n3 hears no heartbeat, campaigns, and wins with n2's vote. Then n1, now cut off from the new leader, times out and bumps the term, which knocks n3 out. Then n3 campaigns again. A new election every few seconds, terms climbing, no committed write lost, but writes stalling for as long as the switch misbehaves, while every member looks healthy.

Two features fix it. Pre-vote: a would-be candidate first asks whether it could win, without touching its term. CheckQuorum: a follower that has heard from a live leader recently refuses such requests. With both on, as etcd configures them, n2 refuses n3, n1 keeps leading with n2, and only n3's own clients fail. One member lost, instead of the whole cluster flapping. Cloudflare described this class of failure in production in 2020: a partially failed switch, repeated etcd elections, and an outage in everything that depended on that etcd.

## An AP store through a partition

Now Cassandra. Three replicas of a key: A and B in region one, C in region two, clients reading and writing at consistency level one. At time zero the link between regions fails. In region one, a user's theme is set to dark, with timestamp 1000. A minute later the same user, now served by region two, chooses blue. But C's clock runs 5 milliseconds slow, so that write gets timestamp 998. Both sides answered, no errors. Twenty minutes later the link heals, the stored hints replay, and every replica compares timestamps. What does the user end up with?

[pause]

Dark. 1000 beats 998, last write wins per cell, and the user who chose blue a minute later sees dark. No error was ever returned. Both sides stayed available and the replicas converged, to the wrong answer, because the later write came from a node with a slow clock.

Two more edges. Hints are kept only while a replica has been unreachable for less than the hint window, three hours by default, so a longer partition leaves replicas divergent until a repair runs. And a repair skipped for longer than the grace period, 10 days, can resurrect deleted data.

Choosing AP is half a decision; the merge rule is the other half. From worst to best: last-writer-wins on wall clocks, where clock skew picks which write you lose. Keeping both versions as siblings for the application to merge, as Riak and the original Dynamo do. A data type whose merge is defined, a CRDT. Or giving each key a home region and forwarding writes to it.

## PACELC: the cost you pay every day

Abadi's extension: if there is a partition, choose availability or consistency; else, choose latency or consistency. That "else" is 99.9 percent of the time. The lesson simulated writes with one replica next to the coordinator, 10 percent jitter on every round trip, and an assumed 2 percent chance per replica of a stall of 50 to 300 milliseconds.

Across three availability zones, a write acknowledged by the local replica took 1 millisecond at the median; a majority, 1.6. Across three regions, local was still 1 millisecond, and a majority was about 65. A consistent write across regions costs about 65 times a local one, every time. That is why Spanner-style systems keep a row's quorum inside the region that writes it.

The tail tells the other story. Waiting for a majority hides one slow replica, while waiting for all three exposes you to every stall. In the zones, majority writes had a 99th percentile of 2.3 milliseconds. Local-only writes: 179, because the one replica you wait for is sometimes the stalled one. Waiting for all three: 261. With any real stall rate, two out of three can have a better tail than a single node.

Now price a real brief. Users write in US East, a second region, US West, 65 milliseconds away, exists for disaster recovery, and the business asks for no data loss if a region goes down. Hold that one; it is the interview question at the end.

## Choose per operation

For each operation, ask two things. What does the user see if it returns stale data? And what do they see if it errors for the length of a partition, say two minutes? Pick the cheaper failure.

Add to cart: stale costs nothing, errors cost sales, so accept it locally and merge carts by union. That is the call Amazon's Dynamo paper made, accepting that a deleted item occasionally reappears. Apply a single-use coupon: stale means used twice, an error means a retry, so it goes consistent. Reserve inventory at checkout, consistent, with a conditional write on the leader. Show a balance: available, labelled with the time it was true. Transfer money: consistent. A like counter: available, with a CRDT counter that sums both sides.

When a stale result is harmful and the client cannot wait, the senior move is to remove the coordination instead of paying for it. The lesson's example is escrow. A concert has 1,000 seats and buyers in three regions. Coordinating every sale through one leader costs remote buyers 65 to 150 milliseconds each and fails them all during a partition. Instead, the US, Europe and Asia-Pacific each hold a block of 300 seats, and 100 stay in a reserve. Each region sells from its own block with a local conditional decrement, and asks the reserve for a batch of 50 when its block falls to 25.

Then Asia-Pacific is partitioned. It keeps selling from its own block for 78 seconds, and only when the block is empty do its buyers see "sold out here, retry shortly". No seat is ever sold twice, and coordination falls from 1,000 cross-region decrements to two batch requests. The cost is stranding: seats held where there is no demand look sold out elsewhere, so blocks are sized to each region's demand and returned to the reserve as the event nears.

The same thinking applies to fan-out reads. A search across 100 shards, each unreachable 0.1 percent of the time, answers only 90.5 percent of the time if it needs every shard. Answer with the shards that responded, with a completeness flag, and nobody notices a few missing results. A balance or an order total cannot do that: a partial sum is a wrong number.

## In the interview

Back to the brief. Writes come from US East, and the business wants zero data loss if a region burns down. Where do the replicas go?

[pause]

A majority must always include a replica outside the writing region. With only two regions, every write waits for the other one: about 65 milliseconds at the median, and any partition between them stops writes everywhere. Add a witness in a third region. Two replicas in each main region plus a witness gives a five-member majority that survives losing any single region. With the witness in Europe, the simulated median was 62 milliseconds; with it close to the writer, in US Central, 25. If the business can accept seconds of loss, keep two replicas in the East and one in the West: 1.6 milliseconds at the median, losing whatever the West had not yet received. And for plain asynchronous replication, put the loss in front of them as write rate times lag: at 5,000 writes a second and 200 milliseconds of lag, 1,000 writes. Lag spikes to seconds during exactly the incidents that cause failovers. The wrong answer is "synchronous replication to the second region", without noticing that it turns a cross-region partition into an outage for both.

And the opening question, answered properly. Is your design CP or AP? Neither, as a whole. Checkout and inventory reservation refuse rather than oversell during a partition. Browsing, cart edits and the feed keep serving, each with a named merge rule: union for carts, CRDT counters for likes. The wrong answer is "AP, because availability matters more", with no merge rule.

## Recap

Four things to remember. CAP constrains only what a node does during a partition, P is not optional, and the theorem's choice is made per operation, the moment you set a timeout. A CP store refuses only on the minority side, after an election of a second or two, and needs pre-vote and CheckQuorum to survive partial partitions; an AP store stays up and needs a named merge rule, because last-writer-wins lets clocks pick the loser. PACELC is the everyday bill: about 65 times the latency for a cross-region majority, while a majority's tail beats a single node's. And choose per operation, putting a number on the loss, and look for ways like escrow to remove coordination from the hot path.

At your desk: the partition traces, the latency simulation, the two-region placement table, and the escrow trace.

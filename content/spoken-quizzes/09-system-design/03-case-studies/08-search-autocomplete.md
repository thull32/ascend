---
lesson: search-autocomplete
source: 707b92df8c2343f6
---
## 1

Why does precomputing a top-k list at every trie node matter so much for autocomplete?

A, it shrinks the trie, because nodes store IDs instead of full strings. B, it avoids ranking a short prefix's huge subtree on every keystroke. C, it lets the trie support deletions without rebuilding the snapshot. D, it makes each insertion constant time, so the index can update in real time.

[think]

The answer is B: it avoids ranking a short prefix's huge subtree on every keystroke.

Walking to the prefix node costs time proportional to the prefix length, but ranking its subtree costs time proportional to the subtree's size, and 11.3 percent of the measured queries sat under the single letter t. Precomputing moves that cost to the offline build. It adds memory rather than saving it, which is the trade-off.

## 2

In the measured log, a radix trie averaged 2.2 top-k IDs per node, with k of 8. Why so few?

A, most nodes are deep, and have only one or two queries beneath them. B, the build drops IDs whose scores fall below the distinct-user limit. C, radix nodes share one top-k list between each parent and its child. D, the overlay holds most of the top-k entries, outside the base index.

[think]

The answer is A: most nodes are deep, and have only one or two queries beneath them.

A node can list at most as many queries as sit beneath it, and in a trie most nodes are near the leaves, so only 3.3 percent of prefixes had a full list of 8. Budgeting 8 IDs per node overstates that part of the index 3.6 times. The threshold filters candidates before the build, and lists are not shared.

## 3

The autocomplete index is estimated at 6 to 8 gigabytes, and peak origin traffic is 56,000 requests a second. What is the best serving topology?

A, query the search engine's primary index directly on each keystroke. B, load the full snapshot on every node, and scale out with replicas. C, shard the trie by first letter across 26 nodes behind a router. D, store every prefix in a Redis cluster, and query it per keystroke.

[think]

The answer is B: load the full snapshot on every node, and scale out with replicas.

Full replicas behind a plain load balancer make every node interchangeable. Sharding what fits on one machine adds routing and hot shards, since prefixes starting with s carry far more traffic than those starting with x. A Redis prefix map works, but costs about 46 gigabytes per replica, plus a network hop per keystroke.

## 4

With a 7-day half-life, a query searched 50,000 times, once, competes with one searched 1,000 times every day. Roughly how long does the spike outrank the steady query?

A, about 7 days. B, about 17 days. C, about 1 day. D, about 50 days.

[think]

The answer is B: about 17 days.

The steady query's score converges to about 9,600. The spike starts near 45,300 and halves every 7 days, crossing 9,600 after about 17 days. The raw ratio of 50 to 1 ignores that the steady query's score accumulates.

## 5

A client sends a request for the prefix n e t f, then for n e t f l 70 milliseconds later. The response for the shorter prefix arrives last, because it hit a slow origin. What should the client do?

A, merge both lists, because together they cover more possible queries. B, render it, because the newest response always reflects newer data. C, retry the longer prefix, because the slow response means the edge cache is stale. D, discard it, because its sequence number is older than the one shown.

[think]

The answer is D: discard it, because its sequence number is older than the one shown.

Responses can arrive out of order, so the client tags each request with a sequence number, and ignores any response older than the one it has rendered. Otherwise the box flips back to suggestions for a prefix the user has already typed past. Arrival order says nothing about which prefix is current.

## 6

Which rule most directly prevents autocomplete from exposing one person's private search to others?

A, encrypting the search logs at rest and in the ranking pipeline. B, suggesting only queries searched by at least N distinct users. C, using a short half-life, so that rare queries decay out quickly. D, rate limiting the suggest endpoint per user and per IP address.

[think]

The answer is B: suggesting only queries searched by at least N distinct users.

A distinct-user threshold ensures that a query entered by one person never becomes a suggestion, however often they repeat it. Encryption protects the logs, but does not stop the pipeline promoting a unique query, and a private query searched today still scores high today, whatever the half-life.

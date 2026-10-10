---
lesson: web-crawler
source: 9467ab35dd81fc6e
fit: great
desk:
  - "The one-URL trace, with its fetch timing breakdown"
  - "The polite frontier code and its four-URL trace"
  - "The Bloom filter and SimHash table arithmetic, and the freshness formula"
  - "Exercise: size a Bloom filter"
---
## Introduction

A crawler is breadth-first search over a graph you cannot see. The textbook version fits in ten lines: pop a URL, fetch it, push its links, keep a visited set. Every one of those lines breaks at scale. The queue does not fit in memory. The visited set has ten billion entries. "Fetch it" means hitting servers whose owners will block you, or fall over, if you send them two thousand requests a second just because their links were at the front of your queue. And some sites generate infinite URLs, so a naive crawler spends its whole budget on one calendar widget.

Here is what the interviewer is really testing. The binding constraint is not bandwidth or storage, which are modest. It is politeness: a per-host rate limit that turns throughput into a scheduling problem across tens of thousands of hosts.

Three deep dives after the numbers: the frontier, where politeness lives; the seen test and near-duplicate detection; and how to spend a recrawl budget so pages are actually fresh.

## Requirements and the numbers

Start from seeds and sitemaps, fetch HTML, follow links, respect robots dot text and per-host rate limits, store every page for the indexer, detect duplicate URLs and near-duplicate content, and recrawl pages on a schedule that tracks how often they change. The target: 5 billion fetches a month, 10 billion known URLs, and one connection per host at about one request a second at most, slower for slow hosts.

5 billion a month is about 1,900 fetches a second. Provision 3 thousand to catch up after an outage; you choose when to crawl, so there is no daily peak. At about 100 kilobytes a page, that is 200 megabytes a second, and about 100 terabytes a month of compressed storage. Hardware is tens of machines.

Now the numbers that matter. Each page yields about 50 links, so 100 thousand discovered URLs a second must be normalised and tested against the seen set. And because each host can only be fetched slowly, 2 thousand pages a second needs about 15 thousand hosts ready at every moment. Hold onto that one; it comes from the frontier. And one big site with 100 million pages at one page a second takes 3.2 years for a single full pass.

So the design problem is a scheduler that keeps 15 thousand hosts busy without being rude to any one of them, and a dedupe path that stops 100 thousand URLs a second from becoming repeated work.

## The architecture, sharded by host

Everything is sharded by host name, with consistent hashing. Politeness, robots rules and the per-host queue are all per host, so a shard that owns a host owns everything about it, and politeness needs no global coordination. If you sharded by URL hash instead, every shard would hold some URLs for a big site, and enforcing one request a second would need a global per-host limiter consulted on every fetch.

Inside a shard: a frontier hands URLs to async fetchers, which keep their own DNS and robots caches. Pages go to a WARC writer that appends compressed records into one-gigabyte files in object storage, because object stores handle billions of tiny objects poorly and bill per request. A parser extracts and normalises links, a seen test filters them, and new ones go back to the frontier. Links to hosts owned elsewhere go through a router in batches, which is cheap because most links point to the same site.

Fetchers lease URLs rather than pop them. A fetcher that dies holding URLs does not lose them: the lease expires and they return to the frontier. That makes delivery at-least-once, and that is fine. A duplicate GET wastes bandwidth and corrupts nothing, and storage dedupes by content hash.

One URL's fetch, to make it concrete: with an 80 millisecond round trip, a DNS miss, the TCP handshake, TLS, the server's time and one more round trip for the rest of the body add up to about half a second. Then the host's next slot is set. And one normalisation detail interviewers like: lowercase the scheme and host, strip tracking and session parameters, but keep the path's case, because paths are case-sensitive.

## The frontier, where politeness lives

A single queue fails at once. A page from a big site yields 50 links to that same site, adjacent in the queue, and a pool of fetchers hits it 50 times in parallel.

The Mercator design splits the frontier in two. Front queues hold priority: about 10 queues by importance and staleness, with a biased selector that favours the high ones without starving the rest. Back queues hold politeness: each holds URLs for exactly one host, and a min-heap keyed by the earliest time that host may be fetched decides who goes next. A host is only in the heap while it has work and no fetch in flight. So it cannot be fetched early and never has two fetches at once. Politeness is a property of the data structure, not a rule someone must remember.

After each fetch, the host's next time is now plus the larger of its crawl delay and ten times the fetch duration. A server that took half a second waits 5 seconds. A struggling server that slows down automatically gets backed off.

[pause]

Now, why 15 thousand hosts? The lesson simulated fetch times with a median of half a second and a mean of 0.69. Each host's cycle, fetch plus gap, averages 7.6 seconds, so a host yields about 0.13 pages a second. 2 thousand divided by 0.13 is about 15 thousand hosts. Running the heap over that many busy hosts produced 2,006 pages a second with about 1,400 fetches in flight, exactly what Little's law predicts. With a flat one-second gap, 3,400 hosts would do. The self-adjusting gap costs four and a half times more breadth; that is the price of never hammering a slow server.

Two refinements. Shared hosting puts thousands of small sites on one IP address, so also limit per IP, say 10 requests a second. And the frontier lives on disk: only the head of each queue is in memory, so a restart loses nothing.

## The seen test and near-duplicates

For ten billion URLs, an exact set of 8-byte fingerprints is 80 gigabytes. A Bloom filter at a 1 percent false-positive rate is about 9.6 bits per URL, 12 gigabytes, with 7 hash functions.

Here is the subtle part. What does a false positive actually do to a crawler?

[pause]

A Bloom filter never says "no" to a URL it has seen. But it says "maybe" to 1 percent of genuinely new URLs, and if you trust that, 1 percent of new pages are silently never crawled. For low-priority links, acceptable. For sitemap and high-priority URLs, confirm the "maybe" against the URL table. And to avoid a disk seek per check, batch: buffer a few seconds of fingerprints, sort them, and merge them against the sorted on-disk keys in one sequential pass.

Then content. A SHA-256 hash catches exact copies. SimHash catches near-copies, like mirrors or pages that differ only in a timestamp. On an 800-word test page, swapping one word for a timestamp and adding an ad slot changed the SimHash by one bit, while an unrelated page differed in 33. Google's published work used 64-bit SimHash with a threshold of 3 bits.

Finding every stored fingerprint within 3 bits uses the pigeonhole principle: split the 64 bits into blocks, and some blocks must match exactly, so index by blocks. With 4 blocks of 16 bits, each probe at 8 billion pages returns about 122 thousand candidates. Far too many. With 6 blocks, at least 3 must match, which gives 20 tables keyed on about 32 bits, and about 2 candidates per probe. The price is 20 copies of the fingerprints. Size these indexes by candidates per probe, not only by bits.

## Recrawl and freshness

Most fetches after the first pass are refetches, and the intuitive policy is wrong. Take two equally important pages, both crawled daily. Page A changes every hour; page B changes every day. You can afford one extra crawl a day.

The lesson's freshness model says B goes from 63 percent fresh to 79 percent with a second daily crawl. A goes from 4 percent to 8. A changes faster than any affordable crawl rate, so budget spent on it buys almost nothing. Cho and Garcia-Molina proved that a uniform schedule always beats one proportional to change rate. Weight by importance instead, and give the hopeless-but-important pages, like a news homepage, a dedicated fast lane.

Mechanically: halve a URL's interval when its content hash changed, multiply it by 1.5 when it did not, and send conditional requests so an unchanged page costs a few hundred bytes of "not modified".

## Failure modes

Spider traps: one host's URL count grows without bound while yield, new non-duplicate pages per fetch, falls to zero. Cap URL length and depth, detect repeated path segments, strip session parameters, and give each host a URL budget scaled by importance.

Hostile servers that trickle bytes: a total deadline, not just an idle timeout, a 10 megabyte body cap, and at most 5 redirects. And redirects are new URLs that go through normalisation and the seen test, or two spellings of one page get crawled forever.

And robots dot text returning a server error. The tempting reading is "no rules". The standard says the opposite: treat it as complete disallow, though you may keep using a cached copy. A 404 means no restrictions. Crawling hard while a site is failing is exactly the rudeness the protocol exists to prevent.

## In the interview

One site has 100 million pages and allows one request a second. What do you do?

[pause]

A full pass is 3.2 years, so crawl what changed: sitemaps with last-modified dates, conditional requests that cost a "not modified", and importance ranking that accepts a stale tail. Then ask the site for a higher rate. The wrong answer is "add fetchers", which the politeness limit makes useless.

And: how do you know the crawler is wasting its budget? Measure yield per host and per priority tier, the not-modified rate on refreshes, and time since last change at fetch time. A high-volume, zero-yield host is a trap or a mirror. Do not answer "pages per second", which a spider trap maximises.

## Recap

Four things to remember. Politeness is the constraint: one connection per host and a gap of ten times the fetch time means about 15 thousand hosts ready at every moment, and a big site takes years. Shard by host, and make politeness structural with per-host back queues and a heap. A Bloom filter's false positives skip new URLs, so confirm the important ones; and size near-duplicate indexes by candidates per probe. And spend recrawl budget by importance, not change rate.

At your desk: the one-URL timing trace, the frontier code and its trace, the Bloom, SimHash and freshness arithmetic, and the Bloom sizing exercise.

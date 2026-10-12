---
lesson: web-crawler
source: b73be38b56f04b14
---
## 1

Fetch times average 0.69 seconds, and each host waits the larger of 1 second or 10 times the fetch time between requests. Roughly how many hosts with queued work does a crawl of 2,000 pages a second need?

A, about 2,000, one fetch per host per second. B, about 1,400, the number of fetches in flight. C, about 200, if each host is fetched ten times a second. D, about 15,000, since each host's cycle is about 7.6 seconds.

[think]

The answer is D: about 15,000, since each host's cycle is about 7.6 seconds.

Each host yields one page per cycle of fetch plus gap, 7.6 seconds on average in the simulation, so about 0.13 pages a second; 2,000 divided by 0.13 is about 15,000. The 1,400 figure is fetches in flight, from Little's law, which is a different quantity, and fetching a host ten times a second breaks politeness.

## 2

Why does the Mercator-style frontier keep one back queue per host, with a heap keyed by each host's next allowed fetch time?

A, to act as the visited set, so no URL is fetched twice. B, so politeness is structural, not a check in the fetcher. C, to make the breadth-first traversal constant time per URL. D, to keep each host's URLs in priority order for fetching.

[think]

The answer is B: so politeness is structural, not a check in the fetcher.

The heap returns a host only when its delay has expired and it is not in flight, so it cannot be fetched early, and never has two fetches at once. Priority is handled separately, by the front queues, and the seen set is a separate component.

## 3

A Bloom filter for 10 billion URLs targets a 1 percent false-positive rate. What does it need, and what does a false positive do?

A, about 12 gigabytes and 7 hashes, and a new URL is skipped. B, about 1.2 gigabytes and 3 hashes, and the filter must be rebuilt. C, about 12 gigabytes and 7 hashes, and a seen URL is fetched again. D, about 80 gigabytes and 1 hash, and a new URL is fetched twice.

[think]

The answer is A: about 12 gigabytes and 7 hashes, and a new URL is skipped.

The sizing formula gives about 9.6 bits per URL, or 12 gigabytes, and 6.6 hash functions, so 7. A false positive says "maybe seen" for a URL that is new, so trusting it skips the URL, while a seen URL never gets a no. That is why high-priority URLs confirm the maybes against the URL table.

## 4

Near-duplicate detection must find fingerprints within 3 bits of each other, among 8 billion 64-bit SimHashes. Why use 20 tables on keys of about 32 bits, rather than 4 tables on 16-bit keys?

A, 32-bit keys let the check skip the Hamming distance step. B, a 16-bit key returns about 122,000 candidates per probe. C, 16-bit keys miss pairs that differ in exactly 3 bits. D, 20 tables use less memory, because the keys are longer.

[think]

The answer is B: a 16-bit key returns about 122,000 candidates per probe.

Both layouts guarantee a match on at least one key by the pigeonhole principle, so neither misses pairs. The difference is selectivity: 8 billion divided by 2 to the 16th is about 122,000 candidates to check per probe, against about 2 for a 32-bit key. The price is 20 copies of the fingerprints, not less memory.

## 5

Pages A and B are equally important, and both are crawled once a day. A changes about once an hour, and B about once a day. You can afford one extra crawl per day. Which choice improves average freshness more?

A, crawl neither, and rely on sitemaps to signal the changes. B, crawl A more, because it changes 24 times as often. C, crawl B more, because one more crawl barely helps A's freshness. D, it makes no difference, since both pages matter equally.

[think]

The answer is C: crawl B more, because one more crawl barely helps A's freshness.

By the freshness formula, B goes from 63 percent to 79 percent fresh with a second daily crawl, while A only goes from 4 percent to 8, because it changes faster than any affordable crawl rate. Spending budget in proportion to change rate is the intuitive mistake.

## 6

A host's robots file returns HTTP 503 for an hour. What should the crawler do, under the robots exclusion standard?

A, crawl only the home page until the robots file returns. B, treat it as a full disallow until the robots file can be fetched. C, delete the host and its URLs from the URL table. D, treat the site as having no restrictions, and crawl normally.

[think]

The answer is B: treat it as a full disallow until the robots file can be fetched.

A server error on the robots file signals an unhealthy site, and the standard says to assume complete disallow, although a crawler may keep using its cached copy while the file is unreachable. A 404, in contrast, means no restrictions. Crawling hard while a site is failing is exactly the rudeness the protocol exists to prevent.

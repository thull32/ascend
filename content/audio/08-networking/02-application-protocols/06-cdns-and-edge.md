---
lesson: cdns-and-edge
source: 13d07812b511ed06
fit: great
desk:
  - "The anycast measurement and the annotated response headers"
  - "The cache-key normalisation code and the vendor key defaults"
  - "The nginx and Varnish mechanism table"
  - "Exercises: count origin fetches with and without coalescing, and decide what a shared cache does with a stored response"
---
## Introduction

At nine in the morning, a marketing email sends two million people to a new trailer page. The page sits behind a CDN with a five-minute TTL, and the origin melts anyway. Every link in the email carries a unique tracking parameter, the CDN includes the full query string in its cache key, and two million distinct URLs are two million cache misses. The CDN worked perfectly. It was asked to cache two million different pages.

A CDN is a distributed cache with a routing layer in front and a hierarchy behind. Whether it helps, or merely adds a hop, is decided by details a senior engineer is expected to own. Which point of presence a user reaches. How misses multiply through the tiers, and how simultaneous misses are collapsed. What is in the cache key. What the headers tell a shared cache, and how content is invalidated. And at the end, Netflix's Open Connect, a CDN built on knowing what users will ask for before they ask.

## Reaching the edge

First, what a CDN buys you, even on a miss. Take a user 150 milliseconds from the origin and 10 milliseconds from an edge. A cold HTTPS request straight to the origin costs three round trips, for TCP, TLS and the request: 450 milliseconds. Through the edge, those three round trips cost 30 milliseconds, and a miss adds one 150 millisecond trip on a connection the edge already holds open. 180 milliseconds. A hit costs 30. The edge wins even for content it cannot cache. And at a 98 percent hit ratio, the origin sees only 2 percent of requests.

How does the user get to an edge? Two ways. With DNS steering, your hostname points at the CDN's DNS, which answers with the address of a point of presence near the querying resolver. Fine control, but blind to where the user really is, and failover is bounded by DNS TTLs. With anycast, every point of presence announces the same addresses over BGP, and routing delivers each client to a nearby one. Failover is a route withdrawal, as fast as BGP converges. The cost is less control, and a route change can move a long-lived TCP flow to a site that has never seen it. Large CDNs combine them.

Here is a measurement from the lesson that is worth carrying around. A request to one Cloudflare anycast address was answered by the Los Angeles point of presence, with a cached copy about 2.8 hours old. A request to the same address a minute later was answered by Dallas, with a copy five seconds old. Routing had moved, and the two sites held independent copies. So "the CDN has it" always means "some points of presence have some copies".

## Tiers, ratios and coalescing

Behind the edge sits a shield, a regional tier, and behind that, the origin. Miss ratios multiply down the tiers. Take 100 thousand requests a second, edges that hit 90 percent, and a shield that hits 80 percent of what the edges miss. The edges pass on 10 thousand a second. The shield passes on 2 thousand. The origin sees 2 percent: one tenth times one fifth.

The shield matters most for the long tail. An object requested once in each of 50 points of presence costs 50 origin fetches without a shield, and one with it.

Watch two ratios, not one. Request hit ratio decides origin CPU and request load. Byte hit ratio decides origin bandwidth and egress cost. In the lesson's example, a minute of large video segments that hit 99.5 percent, mixed with a hundred thousand small API calls that hit 60 percent, gives a byte hit ratio of about 96 percent and a request hit ratio of about 60. The bandwidth dashboard looks excellent while the origin fields 40 thousand requests a minute.

Inside one point of presence, the front layer hashes the cache key to pick the one server responsible for it, so each object is stored once per site. Spread requests randomly instead, and every popular object ends up on every server: 20 servers with 10 terabytes each would hold about 10 terabytes of distinct content instead of about 200. The hashing is consistent, so losing a server moves only that server's keys. The cost is a hot key landing on one server.

Now the moment a hot object is missing. A new trailer page goes live, 10 thousand requests a second arrive at one site, and the origin fetch takes 80 milliseconds. Before I give you the number: how many requests arrive before that first fetch completes?

[pause]

About 800. Without coalescing, that is 800 origin fetches for one object. With request coalescing, the first miss starts the fetch, the key is marked in flight, and the other 799 wait on it. One fetch, 800 responses. Across 50 sites, per-site coalescing still sends 50 fetches, and the shield collapses those into one. The same thing recurs at every TTL expiry of a hot object. In nginx, by the way, coalescing is off by default.

## The cache key

Cache keys are the silent hit-ratio killer, and the default is what bites. Cloudflare's default key includes the full query string. CloudFront's recommended policy leaves query strings and cookies out entirely, which invites the opposite mistake: a parameter that does change the response serves one variant to everyone.

Anything that makes two equivalent requests produce different keys splits the cache. Tracking parameters. Parameters in a different order. A vary header on user agent, where the CDN honours it, which means thousands of distinct strings. Cookies in the key, which means one entry per session. A per-user experiment flag, where the fix is to put the bucket, not the user, in the key.

Here is the arithmetic. A page requested a thousand times a second at one site, with a 60-second TTL, misses once a minute: a hit ratio of about 99.998 percent. Split it into equally popular variants, and each variant misses once a minute. With 100 variants, 99.8 percent. With 10 thousand, 83 percent. And when every request is unique, as in the marketing email, zero.

The fix is a normalised key: lowercase the host, keep only an allowlist of the parameters that change the response, sort them, and normalise the device to a class. An allowlist beats a denylist, because a tracking parameter someone invents next quarter is ignored automatically.

## Freshness and invalidation

What do the headers tell a shared cache? s-maxage sets the freshness lifetime for shared caches like the CDN, and overrides max-age there. Browsers use max-age. So a response with a max-age of 60 and an s-maxage of 300 makes browsers revalidate every minute, while the CDN absorbs those revalidations for five minutes.

stale-while-revalidate is the directive that makes popular objects painless. Take an s-maxage of 60 and a stale-while-revalidate of 30. At 59 seconds, a fresh hit. At 70 seconds, the copy is stale but inside the 90-second window, so the CDN serves the stale copy and refreshes in the background. Nobody waits. Only if the object sits idle past 90 seconds does the next request wait for a synchronous refresh. A popular object is never waited on.

Purging is the slow, expensive and error-prone way to change cached content, so design to rarely need it. In order: versioned URLs for static assets, with a content hash in the filename and a one-year lifetime, which never need invalidating because the short-lived HTML decides which names are current. Short TTLs with stale-while-revalidate for content that changes on its own schedule. Purge by tag for content that must change now: tag responses with, say, title 42, and one purge invalidates every page that mentions it, including variants you did not know existed. And soft purge where supported, which marks content stale instead of deleting it.

Purges are not instant. Fastly documents about 150 milliseconds for a key purge and up to two minutes for a purge of everything. Cloudflare reported a median under 150 milliseconds. CloudFront states 5 seconds at the 95th percentile. So a purge followed by a check from one location proves little. And the failure to design against is the purge storm: a hard purge of a hot object, or of everything, makes every site miss at once. Without coalescing and a shield, that is a self-inflicted outage timed to your deploy.

## Edge compute and Open Connect

Edge compute runs your code in the point of presence. Good uses are small and stateless: rejecting requests with invalid tokens, normalising cache keys, redirects, and assigning users to experiment buckets. The limit that matters is data gravity. Edge code that reads a database 150 milliseconds away has added a hop. It pays off when its data is in the request, the cache, or an eventually consistent edge store.

Now Netflix. It delivers video through its own CDN, Open Connect, and the design inverts the usual assumptions, because the traffic is unusual: one tenant, a finite catalogue of very large objects, and demand predictable by title, region and hour.

Netflix provides appliances at no charge to qualifying ISPs, which install them inside their networks, so traffic never crosses the ISP's transit links. The control plane stays in AWS. When you press play, the playback services check authorisation and choose the files, and a steering service picks appliances that hold them, are healthy, and are close to you, and hands you their URLs. Most important: instead of pulling a title on its first miss, Netflix predicts what each location needs and fills the appliances in a nightly off-peak fill window. So evening peak traffic is almost entirely hits, and the fill uses capacity that would otherwise sit idle.

The transferable lesson is that first choice. When demand is predictable, push beats pull. A pull-through cache pays one miss per object per location, and suffers at launch and at expiry. A pre-positioned cache pays when you choose. Most products can predict partially: pre-warm before a launch, push the next release's assets before switching the HTML.

## In the interview

Here is a follow-up the lesson expects. Your edges hit 90 percent. Is a shield worth adding?

[pause]

It cuts origin traffic by the shield's hit ratio on edge misses: a shield hitting 80 percent of the edge misses takes the origin from 10 percent of traffic to 2. It matters most for the long tail spread thin across sites, and it collapses per-site stampedes into one fetch. The cost is an extra hop on shield misses. The wrong answer is "no, 90 percent is already high", which ignores that without it the origin sees five times more traffic.

And a diagnosis question: a page's hit ratio is 3 percent. How do you find out why? Count distinct cache keys per minute against requests per minute, then look at the query strings, vary values and cookies on sample misses, and check for private responses or set-cookie headers that make responses uncacheable. The wrong answer is "raise the TTL", which does nothing when every key is unique.

## Recap

Four things to remember. Miss ratios multiply through the tiers, and you track request and byte hit ratios separately. A point of presence is one cache among many: anycast can move you between sites holding different copies. Own the cache key, with an allowlist of parameters, because fragmenting a page into many variants divides its hit ratio. And against stampedes, rely on coalescing, a shield and stale-while-revalidate, and on versioned URLs rather than purges. Plus Open Connect's rule: predictable demand should be pre-positioned.

At your desk: the anycast measurement and the response headers, the cache-key code and vendor defaults, the nginx and Varnish table, and the two exercises on coalescing and cache decisions.

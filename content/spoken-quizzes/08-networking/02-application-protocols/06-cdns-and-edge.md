---
lesson: cdns-and-edge
source: 12e229a88d4780db
---
## 1

A campaign email links to a cached landing page, and the origin is overwhelmed despite a five-minute TTL at the CDN. Each link contains a unique tracking ID in its query string. What is the best fix?

A, allowlist only the query parameters that matter. B, raise the TTL to one day so entries live longer. C, add a vary header on user agent, so each device gets its own copy. D, purge the page every minute to keep it fresh.

[think]

The answer is A: allowlist only the query parameters that matter.

Every unique URL is a separate cache entry, so the hit ratio is near zero, whatever the TTL. A cache key that includes only the query parameters that change the response maps every recipient's URL to the same key, and restores sharing. Varying on user agent would fragment the cache further, and purging only creates more misses.

## 2

Edges hit 95 percent of requests. A shield tier is added that hits 70 percent of the requests the edges miss. What fraction of requests now reaches the origin?

A, half a percent. B, 5 percent. C, 3 and a half percent. D, 1 and a half percent.

[think]

The answer is D: 1 and a half percent.

Origin traffic is the edge miss rate times the shield miss rate: 5 percent times 30 percent, which is 1 and a half percent. The shield cut origin load by more than two thirds, without changing how the edges behave.

## 3

An origin returns a cache-control header saying public, a max-age of 60 seconds, and a shared max-age of 600 seconds. How long does each cache treat the response as fresh?

A, 60 seconds in the CDN and in the browser. B, 600 seconds in the CDN and in the browser. C, 600 seconds in the CDN, and 60 in the browser. D, 60 seconds in the CDN, and 600 in the browser.

[think]

The answer is C: 600 seconds in the CDN, and 60 in the browser.

The shared max-age applies only to shared caches, and overrides the max-age there. Browsers are private caches, and use the max-age. This split lets the CDN absorb browser revalidations, while content stays reasonably fresh for users.

## 4

Two requests to the same anycast IP address, a minute apart, return the same object, one with an age of 10,242 seconds and the other with an age of 5. What is the most likely explanation?

A, the first response was served stale after an origin error. B, they reached different points of presence, each holding its own copy. C, the origin changed the object between the two requests. D, the age counts the time since the browser last requested it.

[think]

The answer is B: they reached different points of presence, each holding its own copy.

Anycast routes each connection to a nearby point of presence, and routing can change. Each one caches independently, so the same object can be hours old in one and seconds old in another; in the lesson's measurement, the responses came from Los Angeles and then Dallas. The age is the age of the cache's copy, not of the browser's history.

## 5

A hot object's TTL expires while 10,000 requests per second arrive at a point of presence, and the origin fetch takes 80 milliseconds. Without request coalescing, roughly how many origin fetches does it send before the object is cached again?

A, about 800, one per request in the 80 milliseconds. B, exactly 1, since the first miss locks the key. C, about 10,000, one per request in that second. D, none, since the CDN serves the expired copy.

[think]

The answer is A: about 800, one per request in the 80 milliseconds.

Every request that arrives while no fresh copy exists goes to the origin, and at 10,000 a second, about 800 arrive during the 80 millisecond fetch. Coalescing would make that one fetch, and stale-while-revalidate would let the expired copy be served during the refresh. Without either, the stampede is the default.

## 6

What is the main reason Netflix's Open Connect can serve evening peak traffic almost entirely from cache?

A, anycast routes viewers to the nearest appliance. B, it fills appliances off-peak with predicted titles. C, its caches pull each title on first request, then keep it. D, its appliances have unusually large disks installed.

[think]

The answer is B: it fills appliances off-peak with predicted titles.

A pull-through cache misses on the first request at each location; a proactively filled cache does not. Netflix predicts which titles each location needs and fills the appliances during off-peak hours, using capacity that would otherwise sit idle, so content is present before demand arrives. Disk size helps only because the right content is placed on it in advance.

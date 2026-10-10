---
lesson: observability
source: c22d526dbd0977a8
fit: great
desk:
  - "The merged-histogram code: average of 99th percentiles against the fleet's"
  - "The bucket-boundary error table and how Prometheus interpolates quantiles"
  - "The head-versus-tail sampling trace and the collector pipeline diagram"
  - "The burn-rate derivation and the incident simulation table"
  - "Exercise: evaluate multi-window burn-rate alerts over per-minute data"
---
## Introduction

At ten past three in the morning the pager fires: CPU above 80 percent on one API server. The engineer on call logs in, sees CPU at 82 percent, sees no customer impact, silences it, and goes back to sleep. At twenty to four, the checkout error rate has been 12 percent for half an hour, and nobody was paged, because no alert was watching the thing customers experience. The system had dashboards for everything and observability for nothing.

Observability is the ability to ask a new question of a running system without shipping new code, and to be told, reliably and early, when users are being hurt. It is built from three signals with different costs and different answers, and it is aimed by service level objectives that say in numbers what "hurt" means.

Three ideas. Which signal answers which question, and how to keep its cost bounded with arithmetic. Why the tail lies to you unless you record it properly. And how to alert on symptoms, using burn rates, instead of on causes.

## Three signals

Metrics answer how much, how fast, how often, over time. Each event costs almost nothing, a counter increment, and you keep them for months. Logs answer what happened in this one specific case, and you pay in bytes per line. Traces answer where the time went across services: a trace can tell you that a request took 900 milliseconds and 700 of them were one inventory query, which no metric can, because metrics have thrown away which request was which.

The first rule of metrics: percentiles need histograms. A service with a median of 5 milliseconds and a 99th percentile of 500 has a mean near 10, which describes nobody's experience. So you record latency as counts in buckets, and compute percentiles when you query.

The second rule: you cannot average percentiles. The lesson builds a fleet of 50 instances, 49 healthy and one sick, where the sick one serves 2 percent of requests at 3 to 5 seconds. Average the 50 instances' 99th percentiles and you get 0.34 seconds. Looks healthy. Now sum the buckets across all instances first, then take the percentile, and the fleet's real 99th percentile is 3.75 seconds. A panel that averages percentiles is the most common observability mistake in design reviews.

And the buckets themselves matter. The percentile is interpolated inside whichever bucket it lands in. With Prometheus's default buckets, the lesson's simulated 99th percentile came out 23 percent too high, about a quarter. So if your goal is "requests under 300 milliseconds", put a bucket boundary at exactly 300, and the measurement becomes an exact count instead of a guess.

## Cardinality and cost

A metrics database stores every unique combination of labels as its own series, and a standard histogram is 14 series per combination. Label one request-duration histogram by instance, 200 of them, route, 40, and status code, 8 values. 200 times 40 times 8 times 14: about 900 thousand series. From one histogram. On disk that is 5 to 10 gigabytes a day. Managed vendors bill per series, and at list prices a million series runs from about 6,500 dollars a month at one vendor to about 50,000 at another.

Now someone adds customer ID as a label. Before I tell you, what do you think happens?

[pause]

With 50 thousand active customers, each spread across every instance by the load balancer, it comes to about 1.4 billion series. The metrics server runs out of memory within hours. Memory tracks active series, not stored history, which is why cardinality, not retention, is what takes a Prometheus server down. The fixes: status as a class, two hundreds, four hundreds, five hundreds, three values instead of eight. Drop the instance label for long-term storage. And put per-customer detail in trace attributes and exemplars, where cardinality costs nothing. A label is for dimensions with tens or hundreds of values.

Logs cost volume. 10 thousand requests a second at one kilobyte per line is 864 gigabytes a day, 26 terabytes a month, before indexing. At one vendor's list prices that is about 2,600 dollars a month to ingest, and another 27 to 41 thousand dollars to index with the shortest retention. A five-figure monthly bill for one service's access logs. So keep every error, with context, sample routine successes at around 1 percent, and move anything you count into metrics.

One more tool joins the worlds. An exemplar is a sample trace ID attached to a histogram bucket, so the spike in the 99th percentile on a dashboard opens a real trace from that bucket.

## Sampling traces

You cannot keep every trace: at 10 thousand requests a second, keeping everything is 3.5 terabytes a day. Keeping 1 percent is 35 gigabytes. But which 1 percent?

Head sampling decides at the very start. The gateway decides from a hash of the trace ID, sets a flag in the trace header, and every service downstream obeys it, so every kept trace is complete. It is cheap, and it is blind: it keeps 1 percent of the boring requests and 1 percent of the interesting ones. The decision about a request that later fails was made before it failed.

Tail sampling decides after the trace completes. Every span goes to a collector tier, all spans of one trace are routed to the same collector, and it waits, 30 seconds by default, before applying policies: keep every error, keep everything slow, and a sliver of the rest.

The lesson simulated a million requests with half a percent errors. Head sampling at 1 percent kept 57 of the 5,027 errors. Tail sampling kept all 5,027, in about 16 thousand traces. The price is memory in flight: at 10 thousand requests a second, 30 seconds of waiting is 300 thousand traces, roughly 2.4 gigabytes across the tier. And the trap: the collector's default trace limit is 50 thousand. Set it below the number in flight, and it evicts traces before deciding, silently losing the long, slow traces tail sampling exists to keep.

## Objectives and budgets

On day one, instrument rate, errors and duration per endpoint, and the same for each dependency, so "we are slow" becomes "inventory is slow". Add utilisation and saturation for pools, queues and memory. Add business signals: a 30 percent drop in orders with every technical metric green is an outage. And mark deploys, so a doubled 99th percentile lines up with a version.

Then define what "hurt" means. A service level indicator measures what users experience, say the fraction of requests that succeed within 300 milliseconds. A service level objective is a target for it over a window: 99.9 percent over 30 days. The error budget is the failure you allow: 0.1 percent of requests, or 43 minutes of full outage a month. At 99.99 percent it is about 4 minutes. A service level agreement is the contract with penalties, looser than the objective, so the objective breaks first.

The budget is a decision tool. While it remains, ship and take risks. When it is spent, feature work stops for reliability work. And check the number against your dependencies: a 99.99 percent objective on top of a hard dependency at 99.9 is a promise you cannot keep without a fallback.

## Burn-rate alerts

Burn rate is your error rate divided by the budgeted rate. At 99.9 percent, a burn rate of 1 is a 0.1 percent error rate, and spends the month's budget in exactly a month. A burn rate of 14.4 spends it in 50 hours.

Where does 14.4 come from? You decide what fraction of the monthly budget may be spent before someone is told. Burn rate is that fraction times the 720 hours in a month, divided by the alert window in hours. Two percent of the budget in one hour: 14.4. Five percent in six hours: 6. Ten percent in a day: 3. That is the multi-window, multi-burn-rate setup from Google's S R E workbook. Pages at 14.4 and 6, tickets at the slower rates.

Each alert checks two windows, and both must be over the threshold. The long one, an hour for the fast page, gives precision: a three-minute blip cannot spend 2 percent of a month. The short one, a twelfth as long, five minutes, makes the alert stop soon after the problem does.

The lesson simulated incidents against a naive page on "error rate above 1 percent over five minutes". A full outage: both page within a minute. At 10 percent errors, the burn-rate page fires in 9 minutes; at 2 percent, in 44. The naive alert is faster there. But a 2 percent spike lasting three minutes pages the naive alert for nothing, and the burn-rate alert never fires. And a slow burn of 0.3 percent errors for three days never trips the naive alert at all, while the burn-rate ticket fires after a day, with 10 percent of the budget gone. That is the trade: slower on moderate incidents, never paging for blips, never missing slow burns. If 44 minutes is too slow for your product, add a faster tier; do not go back to a raw error-rate threshold.

Cause alerts, CPU, disk, queue depth, become dashboards and tickets, unless they predict an objective breach, like a disk that will be full in hours. And every page links a runbook.

One last point. Google reports that roughly 70 percent of outages are due to changes, so compare the new version against the old during a canary: 1 percent of traffic for 15 minutes, roll back automatically if it is worse. At a thousand requests a second, that is 9 thousand requests, enough to see a 1 percent error rate, not a 0.01 percent one.

## In the interview

What is the first alert you would set up?

[pause]

A burn-rate page on the primary indicator: 14.4 times over one hour, confirmed over five minutes, which fires when about 2 percent of the monthly budget is gone. Then a 6 times page and slower tickets. CPU, memory and queue depth go on the runbook's dashboard. The wrong answer is "error rate above 1 percent", which pages for three-minute blips and never sees a 0.3 percent slow burn that spends the month's budget in ten days.

And: an engineer wants customer ID on the request metrics. What do you say? Multiply it out. Tens of thousands of customers, times routes, times statuses, times instances, times 14 series per histogram, is a billion series. Put the customer in trace attributes and exemplars. The wrong answer is "fine, the database compresses labels", which confuses bytes per sample with memory per series.

## Recap

Four things to remember. Never average percentiles: record histograms, sum the buckets, then take the percentile, and put a boundary at your objective's threshold. Multiply out cardinality before adding a label, because memory follows active series, and a customer label turns one histogram into over a billion. Use tail sampling to keep every error and slow trace, and size its buffer from rate times wait. And alert on burn rate, not causes: 14.4 is 2 percent of the month's budget spent in an hour, and two windows stop pages for blips without missing slow burns.

At your desk: the merged-histogram code, the bucket-error table, the sampling trace, the burn-rate derivation and simulation, and the burn-rate exercise.

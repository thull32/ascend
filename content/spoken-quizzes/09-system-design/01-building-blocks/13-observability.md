---
lesson: observability
source: 48bd093d8463541d
---
## 1

A dashboard panel shows the average of each instance's 99th percentile latency, across 50 instances. Why is this misleading?

A, the 99th percentile needs a longer window than the panel uses. B, per-instance series are too high-cardinality to plot. C, percentiles do not average, so merge the histograms first. D, the panel should show the fleet's median instead.

[think]

The answer is C: percentiles do not average, so merge the histograms first.

The average of percentiles has no statistical meaning, and one very slow instance is hidden by it. Merge the histogram buckets first, then take the percentile, and add a maximum panel to catch a single bad instance. A longer window does not fix averaging something that cannot be averaged.

## 2

A service has a 99.9 percent availability SLO over 30 days. Its error rate has been 1.5 percent for the last hour, and still is. What should happen?

A, a ticket, since only about 2 percent of the budget is gone. B, a page, since the budget is burning about 15 times too fast. C, nothing yet, since the monthly budget is not exhausted. D, an automatic rollback of the most recent deploy.

[think]

The answer is B: a page, since the budget is burning about 15 times too fast.

The burn rate is 1.5 percent divided by 0.1 percent, which is 15, above the 14.4 threshold for the one-hour window, and the five-minute window confirms it. About 2 percent of the monthly budget went in one hour, and the rest goes in two days. Waiting for exhaustion finds the outage days late. A rollback may be the fix, but the alert is what starts the response.

## 3

Why is the fast page's burn-rate threshold 14.4, for a one-hour window?

A, it spends 2 percent of a 720-hour budget in one hour. B, it is 99.9 percent expressed as a burn multiplier per hour. C, it is the error rate that exhausts the budget in a day. D, it is chosen so the page fires within five minutes.

[think]

The answer is A: it spends 2 percent of a 720-hour budget in one hour.

The burn rate is the fraction of the budget, times the SLO's window over the alert's window: 0.02 times 720 hours, over one hour, is 14.4. At that rate, the whole budget lasts 50 hours, not a day. Detection time depends on the error rate: at 10 percent errors, about 9 minutes.

## 4

An engineer adds the user ID as a label on the HTTP requests counter. What is the likely consequence?

A, slightly higher scrape latency on each instance. B, a series explosion that overloads the metrics system. C, nothing, because labels are compressed away by the time-series database. D, more precise per-user dashboards at almost no extra cost.

[think]

The answer is B: a series explosion that overloads the metrics system.

Each unique label combination is a separate time series, with its own memory: one per user, per route, per status, per instance. Compression reduces bytes per sample, not the number of series. Per-user detail belongs in trace attributes or exemplars.

## 5

You need traces of the half a percent of requests that fail, but head sampling at 1 percent almost never captures them. What is the fix?

A, tail sampling that keeps every error or slow trace. B, sampling consistently by user ID across services. C, raising head sampling to 10 percent, so more failures get caught. D, logging the failing requests instead of tracing them.

[think]

The answer is A: tail sampling that keeps every error or slow trace.

Tail sampling decides after the trace completes, so it keeps exactly the interesting ones; in the lesson's simulation, it kept all 5,027 errors, where 1 percent head sampling kept 57. Raising head sampling multiplies cost, while still missing most failures.

## 6

An SLI counts requests under 300 milliseconds, measured with Prometheus's default latency buckets. What is the risk?

A, counters reset on restart, and the SLI goes negative. B, the default buckets overflow above 10 seconds, and drop samples. C, there is no bucket boundary at 300 milliseconds, so the SLI is interpolated. D, histogram series cannot be summed across instances.

[think]

The answer is C: there is no bucket boundary at 300 milliseconds, so the SLI is interpolated.

The default boundaries are 250 and 500 milliseconds, so the count under 300 is a linear interpolation inside that bucket; the lesson's simulation put the default-bucket 99th percentile 23 percent too high. Put a boundary exactly at the SLO threshold. Buckets sum across instances correctly, and the rate function handles counter resets.

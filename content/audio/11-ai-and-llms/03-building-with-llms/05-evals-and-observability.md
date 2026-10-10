---
lesson: evals-and-observability
source: 6c6e245650911ebd
fit: great
desk:
  - "The Cohen's kappa arithmetic for two annotators and for the judge against humans"
  - "The position-bias table for 40 pairs, and the padding experiment's binomial test"
  - "The regression gate code and its per-slice report"
  - "The pass at k and pass to the power k estimators, and the cost table for one eval run"
  - "The RAG span tree, the OpenTelemetry attributes, and the cost-per-request table"
  - "Exercise: score an eval run with per-slice results"
  - "Exercise: recall at k and MRR over a retrieval golden set"
---
## Introduction

A customer complains that the support assistant told them refunds take 60 days. You find the cause in five minutes, add one sentence to the prompt, and the complaint's example now works. Did anything else break? Did the tone get worse? Does it now refuse questions it used to answer? Without an eval set, the honest answer is "we do not know", and teams that ship that way end up afraid to touch their prompts.

LLM outputs are free-form and non-deterministic, so asserting that the output equals an expected string does not transfer. The discipline does: a fixed dataset, a scoring function, a baseline, and a gate that stops regressions shipping. Observability is the production half: record enough about every call to explain any output, find where the time and money go, and turn real failures into new cases.

Three ideas. How to build a golden set and grade it, including when the grader is another model. How to decide whether a change is a regression. And what to record in production so you can explain a slow, expensive or wrong answer.

## The golden set

An eval has four parts. A dataset of inputs and expectations, tagged by slice. The system under test, which is the whole pipeline: prompt, model, retrieval settings, tool descriptions, all versioned. Graders. And a report with an overall score, per-slice scores and a diff against the baseline.

Cases come from four places: sampled and anonymised production traffic, every failure with the expected behaviour written down, synthetic cases that fill gaps, reviewed by a person before they count, and adversarial cases such as injections. Tag every case with slices like topic, language and tier. A change that lifts the total from 82 to 84 percent while refunds fall from 90 to 70 percent is a regression for every refund question.

A label is only as good as its protocol. Write the rubric first and label 20 cases yourself to find its ambiguities. Then two annotators label every case independently, blind to each other and to which model answered. Measure their agreement with Cohen's kappa, which discounts the agreement you would expect by chance. In the lesson's example, two annotators agree on 54 of 60 cases, 90 percent, but chance alone would give about 57 percent, so kappa is 0.77. Remember that number: it is the ceiling for any automated grader. A third person adjudicates the disagreements, and when most share a cause, you fix the rubric, not the labels.

Golden sets rot three ways. No held-out set: a week of tuning against the same 100 cases measures memorisation. Contamination: a golden case reused as a few-shot example inflates the score. And staleness: when the refund window moves from 30 to 45 days, every case expecting 30 days punishes correct answers. Give each case an owner, a valid-as-of date and its source document.

How many cases? At a true 80 percent on 100 cases, the 95 percent interval is about plus or minus 8 points: anything from 72 to 88 is the same system. Halving the error takes four times the cases. Smaller sets still work for comparisons, because a paired test on the same cases cancels out how hard each case is. Start with 50 to 200 and grow where failures cluster.

## Rubrics and judges

Take one criterion: faithfulness of a support answer to the retrieved passage. It passes when every factual claim, numbers, time limits, eligibility, is stated in or directly implied by a passage. "I don't know" passes. It fails when any claim is missing from the passages, contradicts them, or turns a conditional into an unconditional.

The passage says refunds are available within 30 days of delivery for unopened items. The answer "Refunds are available within 30 days" fails: it drops the unopened condition. On a 1 to 10 scale it would earn about a 7 for being mostly right, and the customer with an opened item is still misled.

That is one reason binary beats a scale. Another: in the lesson's illustration, a judge scored the same 10 answers twice on a 1 to 10 scale, matched itself on only 2 of them, and moved 1.1 points per answer on average. Chance-corrected, its agreement with itself was about zero. Graded pass or fail against anchors, its two runs agreed on 9 of 10. Nothing defines the gap between a 6 and a 7, and "mean 7.2" names nothing to fix. Split fuzzy quality into binary criteria, and use the cheapest grader that measures what you care about: exact matches, required strings and schema checks cost about nothing; running code in a sandbox costs seconds; a model judge costs a call.

A judge is another prompt, and it has biases you measure before you trust it. Position first. Judge a baseline against a candidate on 40 questions, each pair in both orders. The candidate wins both orders 14 times, the baseline 10 times, and 16 times the verdict flips with the order. Judged once with the candidate shown first, it wins 65 percent. Shown second, 45 percent. The order you happened to pick swings the headline by 20 points.

[pause]

Count flips as ties and you have 14 wins against 10 losses, which an exact sign test puts at p equals 0.54. No evidence either way. The mitigation is both orders with flips as ties, at twice the judge calls.

Verbosity next. Pair each answer with a padded copy, the same claims plus filler, and judge both orders. An unbiased judge has no reason to prefer either. In the illustration, the padded copy won 27 of 36 decisive pairs, which a fair coin does with p of about 0.004. This judge rewards length. And self-preference: a judge tends to favour its own model family, so measure it against humans with judges from two families, or use a judge from another family.

## Calibrating the judge

Raw agreement flatters a judge. People label 100 answers, 70 pass and 30 fail, and the judge agrees on 88. Sounds good. Corrected for chance, kappa is 0.70. Now the number that matters for a gate: of the 30 real failures, the judge caught 22. It passed 8 of them, 27 percent. That is recall on the fail class, and a gate needs it, because a missed failure ships. A review queue needs precision instead, because false alarms waste reviewers; here the judge's fail verdicts are right 85 percent of the time.

Read the 8 misses. If they share a type, dropped conditions say, add an anchor and re-measure. And notice the humans' own kappa was 0.77, close to the judge's 0.70, so the next gains come from the rubric, not a stronger judge.

Remember too that a judge call is an ordinary sampled generation. Identical requests can differ even at temperature zero, because server-side batching changes the order of floating-point additions. Run the judge twice and report its self-agreement. Put the evidence and reasoning before the verdict, because tokens are generated left to right, and a verdict placed first is decided before any reasoning exists. And pin the judge version: an upgrade moves every score with no product change.

## Regression gates

Treat prompts, model ids, tool descriptions and retrieval settings as code: every change runs the eval, and a gate decides. Both versions ran on the same cases, so the signal is in the cases where they disagree: fixes, where only the candidate passes, and regressions, where only the baseline does. McNemar's test asks whether that split is more lopsided than a fair coin.

The lesson's run: 100 cases, baseline 80, candidate 83. Seven fixes against four regressions gives p of 0.55. Noise, not a win.

The refunds slice went from 36 to 33 of 40: three regressions, no fixes, p of 0.25. And here is the trap. With only three discordant cases, 0.25 is the best p you can ever get. An all-one-way split needs six cases to fall below 0.05. So a gate that looks only at p misses every regression smaller than six cases. Hence a drop threshold, block any gated slice that loses more than 5 points, and must-pass cases, such as the 60-day complaint, that block on any failure. Slices under 30 cases only warn, because there one case moves the rate 8 points. The price is false blocks, so print the discordant case ids and let a person override with a recorded reason.

The system under test samples too, so run each case several times, and know which number you want. Pass at k, at least one of k runs passes, is what the system can do: at a per-run rate of 70 percent, pass at 3 is 97 percent. Pass to the power k, all k runs pass, is what it reliably does: 34 percent. Users who ask once get the second number. A run of 200 cases, three samples each, plus a judge call per sample, costs about 33 dollars at the lesson's illustrative prices, so run it on prompt, model and retrieval changes, not every commit.

## Traces, percentiles and cost

A log line per call cannot tell you why an answer was slow and wrong. A trace can: one tree of timed spans with attributes. Take a support request that takes 2.5 seconds. A query rewrite, then hybrid retrieval, then a reranker cutting 40 chunks to 5, then the chat call. The chat span is 71 percent of the total. Yet the user waits 1,350 milliseconds for the first token, and 710 of those pass before the model is even called, 385 of them in the query rewrite alone. Skipping the rewrite for short keyword queries is the cheapest win, and only the span tree shows it. The chunk ids on the retrieval span separate retrieval failures from generation failures.

One counting trap. OpenTelemetry's generative-AI conventions count the whole prompt as input tokens, while Anthropic's input tokens field is only the uncached remainder. For this request that is 8,000 tokens, not the 1,200 in the raw response.

Report distributions, not averages. Twenty time-to-first-token samples: the median is 445 milliseconds, but two slow requests, a cache miss on a long prompt and a retry after a 429, account for over half of all the waiting, and drag the mean to 862. No user experienced 862 milliseconds. And with 20 samples the 99th percentile is just the maximum; it needs a few hundred requests per window to mean anything.

Cost per request comes from the same span's counters. This request cost about 2.3 cents with caching, against about 4.9 uncached: caching halves it. Define cache hit rate over tokens, cache reads over the whole prompt: 6,000 of 8,000, 75 percent. A per-request hit flag would count a request that read 500 of 20,000 tokens as a hit.

Offline evals say a change is safe; online signals say it worked. Judge a 2 percent sample of 50,000 daily requests and you measure faithfulness to about plus or minus 1.4 points, for 27 dollars 50 a day. Define implicit feedback, regenerate, rephrase, abandon, escalate, up front so you can count it per prompt version. Every confirmed online failure becomes a golden case. And treat trace content as sensitive: redact known patterns before export, keep full content only on sampled traces, and identify users with a keyed hash, because a plain hash of an email is reversed by hashing a list of emails.

## In the interview

Your new prompt scores 83 percent against 80 on 100 cases. Do you ship it?

[pause]

Not on that number. Both ran on the same cases, so compare the discordant ones: 7 fixes against 4 regressions is an exact McNemar p of 0.55, which is noise. Check the slices and the must-pass cases, and read the 11 discordant cases. The wrong answers are "yes, it is 3 points better", or an unpaired test that throws the pairing away.

And: how would you convince me an LLM judge can gate releases?

[pause]

Its kappa against adjudicated human labels, beside the humans' own. Recall on the fail class, because a missed failure ships. Both-orders, padding and cross-family tests. Self-agreement across runs. And a pinned version. The wrong answers: "it agrees with humans 88 percent of the time", or "it is the strongest model".

## Recap

Four things to remember. Build golden sets with slices, two blind annotators and kappa, and keep a held-out set tied to source documents. Write binary, anchored rubrics, and measure a judge's position, length and self-preference biases, then calibrate it on recall of the fail class. Gate per slice with a paired test, a drop threshold and must-pass cases, because fewer than six discordant cases can never reach significance. And trace every call as a span tree, read latency as percentiles, and define cache hit rate over tokens.

At your desk: the kappa and bias arithmetic, the gate code and its report, the pass at k estimators and run costs, the span tree and cost table, and the two exercises, an eval scorer and retrieval metrics.

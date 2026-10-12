---
lesson: evals-and-observability
source: 862e290b541ec220
---
## 1

A refunds slice of 40 cases goes from 36 passes to 33: three regressions, no fixes, and an exact McNemar p of 0.25. What should a well-designed gate do?

A, rerun the suite until the refunds p-value drops below 0.05, or the drop clears. B, block it, since 3 discordant cases cannot reach a p below 0.05, so a drop threshold decides. C, pass it, because a p of 0.25 shows the drop is not statistically significant. D, pass it, because the overall pass rate across all 100 cases rose from 80 to 83 percent.

[think]

The answer is B: block it. Three discordant cases cannot reach significance, so a drop threshold decides.

With 3 discordant cases, the smallest possible two-sided p is 0.25, and a split all one way needs at least 6 cases to fall below 0.05, so a gate that looks only at p is blind here. A practical threshold, such as a drop of more than 5 points on a gated slice, blocks it, and a person reads the three cases. The overall rise hides the slice, and rerunning until the number changes is fishing for noise.

## 2

You compare two prompts with a pairwise judge on 40 questions, in both orders. The candidate wins in both orders 14 times, loses in both 10 times, and the verdict flips with the order 16 times. What is the right conclusion?

A, the baseline is better, since 16 flips show the judge favours the incumbent. B, no evidence either way: 14 against 10, with flips as ties, gives a p of 0.54. C, the candidate is better, since it wins 58 percent of pairs once the flips are dropped. D, the candidate is better, since it wins 65 percent of pairs when it is shown first.

[think]

The answer is B: no evidence either way. 14 against 10, with flips as ties, gives a p of 0.54.

A 40 percent flip rate is strong position bias. Counting flips as ties leaves 14 wins against 10 losses, and an exact sign test on those 24 decisive pairs gives a p of 0.54. The 65 percent figure comes from judging only with the candidate first, and 58 percent of decisive pairs is the same 14 against 10, which is still not significant.

## 3

A judge is calibrated on 100 human-labelled answers. 66 both pass, 22 both fail, 8 the judge passed but the humans failed, and 4 the reverse. Which figure tells you how many real failures would ship past this judge in a gate?

A, precision on the fail class: 22 of 26, so 15 percent of failures slip through. B, Cohen's kappa: about 0.70, so 30 percent of real failures slip through. C, raw agreement: 88 of 100, so 12 percent of real failures slip through. D, recall on the fail class: 22 of 30, so 27 percent of failures slip through.

[think]

The answer is D: recall on the fail class, 22 of 30, so 27 percent of failures slip through.

A gate lets a failure through when the judge passes an answer the humans failed, which is the miss rate on the fail class: 8 of 30, a recall of 0.73. Precision, 22 of 26, measures false alarms. Kappa corrects agreement for chance and is not a miss rate, and raw agreement is dominated by the 70 passing answers.

## 4

In a padding experiment, each answer is paired with a copy that adds filler but no new claims, and both orders are judged. The judge prefers the padded copy in 27 of 36 decisive pairs. What does this show?

A, a position bias, since the padded copies tend to be read second. B, better answers, since the padded copies add caveats that help users. C, nothing yet, since 36 pairs is too few for a significance test. D, a length bias: a fair coin splits 27 to 9 or worse with a p of 0.004.

[think]

The answer is D: a length bias. A fair coin splits 27 to 9 or worse with a p of 0.004.

The copies make the same claims, so an unbiased judge has no reason to prefer either, and each decisive verdict is a fair coin under the null hypothesis. The exact two-sided binomial test gives a p of 0.0039. An exact test is valid at any sample size, and judging both orders controls for position.

## 5

A support feature answers a golden case correctly on 70 percent of runs, and you sample each case 3 times. Which metric measures whether it answers that case reliably on every attempt?

A, the best of three runs, 1.0, since one run was correct. B, the mean pass rate, 0.70, averaged over the three runs. C, pass to the power 3, about 0.34, since all three runs must pass. D, pass at 3, about 0.97, since at least one run must pass.

[think]

The answer is C: pass to the power 3, about 0.34, since all three runs must pass.

Pass to the power k, the chance that all k runs pass, measures reliability: 0.7 cubed is 0.343. Pass at k, 1 minus 0.3 cubed, or 0.973, measures what the system can do given retries, which users asking once do not get. The mean hides how often the same question gets a wrong answer.

## 6

A model call reports 1,200 uncached input tokens, 6,000 cache-read tokens, and 800 cache-write tokens. What is its cache hit rate, defined so that it tracks cost?

A, 100 percent: the request read from the cache, so it is a hit. B, 75 percent: cache-read tokens over all tokens in the prompt. C, 83 percent: cache-read tokens over uncached plus cache-read. D, 85 percent: cache-read plus cache-write over all prompt tokens.

[think]

The answer is B: 75 percent, cache-read tokens over all tokens in the prompt.

The prompt is 1,200 plus 6,000 plus 800, which is 8,000 tokens, and 6,000 were served from cache, so 75 percent. A per-request hit flag would count a request that read 500 of 20,000 tokens as a hit. Leaving the writes out of the denominator overstates the rate, and counting writes as hits is backwards: a 5-minute write costs 1.25 times the input price.

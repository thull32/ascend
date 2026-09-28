---
slug: generation-and-sampling
title: "Generation and sampling: temperature, top-p, beam search and stopping"
description: How a probability distribution becomes text, one token at a time. Softmax and temperature worked with numbers, top-k, top-p and min-p applied to one concrete logit vector, the uniform draw that picks a token, beam search and its length bias, repetition penalties, stopping, constrained decoding, what the sampler does under the hood, and why temperature 0 is still not reproducible.
minutes: 45
difficulty: medium
tags: [llm, sampling, temperature, top-p, beam-search, decoding]
problems: []
---
At the end of every forward pass, a language model produces a score for every token in its vocabulary, 100,000 or more of them, for the next position. That is not text. Something has to turn those scores into a single token, append it, run the model again, and decide when to stop. That something is the **decoding strategy**, and it changes the quality, variety, repeatability and cost of the output as much as the wording of the prompt does. It is also why the same prompt gives different answers on two runs, why a JSON response sometimes arrives cut off, and why your "deterministic" regression test fails on Tuesdays.

## The autoregressive loop

Generation is a loop around the model from [The transformer](/learn/ai-and-llms/how-llms-work/the-transformer). Each iteration runs a forward pass, takes the logits at the last position, chooses a token, appends it and goes round again:

```python
def generate(model, prompt_ids, max_new_tokens, eos_id, choose):
    ids = list(prompt_ids)
    for _ in range(max_new_tokens):
        logits = model(ids)[-1]        # scores for the next token only
        next_id = choose(logits)       # greedy, sampling, ...
        ids.append(next_id)
        if next_id == eos_id:          # the model says it is finished
            break
    return ids[len(prompt_ids):]
```

Two consequences shape everything about LLM cost and latency. The prompt can be processed in one parallel pass, but output tokens are produced **strictly one after another**, each needing its own pass through the whole model. So output tokens are slower and usually priced several times higher than input tokens. And re-running the model over the whole growing sequence every iteration would be wasteful; the [KV cache](/learn/ai-and-llms/how-llms-work/context-windows-and-kv-cache) avoids it.

The `choose` function is the decoding strategy. The rest of this lesson is about what to put there.

## From logits to probabilities

The logits $z_i$ are unbounded real numbers. The **softmax** turns them into a probability distribution:

$$p_i = \frac{e^{z_i}}{\sum_j e^{z_j}}$$

Work a small case by hand with logits $(2.0, 1.0, 0.1)$: $e^{2.0} = 7.389$, $e^{1.0} = 2.718$, $e^{0.1} = 1.105$. They sum to 11.212, so the probabilities are $(0.659, 0.242, 0.099)$.

Now the vector the rest of the lesson uses. After "The capital of France is", suppose the six highest logits are " Paris" 6.1, " a" 4.0, " the" 3.6, " Lyon" 3.1, " not" 2.5 and " famous" 2.2 (treating these six as the whole vocabulary to keep the numbers readable). The softmax gives " Paris" 0.768, " a" 0.094, " the" 0.063, " Lyon" 0.038, " not" 0.021, " famous" 0.016. A logit gap of 2.1 between " Paris" and " a" became a probability ratio of $e^{2.1} \approx 8$.

Implementations always subtract the largest logit before exponentiating. Multiplying every $e^{z_i}$ by the same constant $e^{-\max z}$ cancels in the division, so the result is identical, but $e^{1000}$ overflows a 64-bit float and $e^{0}$ does not.

## Greedy decoding, and why it is not the best sequence

**Greedy decoding** always picks the most likely token. It is simple and, mathematically, deterministic. For short, factual, tightly specified outputs (a classification label, an extracted field, a tool argument) it is usually what you want.

For longer text it has two problems. It is prone to **repetition loops**: once a phrase becomes likely, repeating it makes it more likely, and greedy never escapes. And the most likely token at each step does not give the most likely *sequence*. Consider a two-step choice:

- Step 1: A has probability 0.5, B has 0.4, C has 0.1.
- After A, the best continuation has probability 0.4 (the model is unsure what follows A).
- After B, the best continuation has probability 0.9.

Greedy picks A and then its best continuation: $0.5 \times 0.4 = 0.20$. The sequence B then its continuation has probability $0.4 \times 0.9 = 0.36$. Greedy never sees it because it committed at step 1.

## Beam search and its length bias

**Beam search** keeps the $b$ best partial sequences (by total log-probability) at every step instead of one. With $b = 2$ in the example, step 1 keeps A (0.5) and B (0.4); step 2 expands both and keeps the two best, B-then-best (0.36) and A-then-best (0.20). It finds the better sequence.

It also has a built-in bias towards stopping early, because every extra token multiplies in a probability below 1. Compare a two-token reply "OK." with token probabilities 0.3 and 0.9 against a six-token answer whose tokens each have probability 0.8. The totals are $0.27$ (log −1.31) and $0.8^6 = 0.262$ (log −1.34): beam search prefers "OK.", although every token of the longer answer was more confident. Implementations therefore divide the log-probability by the length (to a power, often 0.6 to 1): with a power of 1 the scores become $-1.31/2 = -0.65$ and $-1.34/6 = -0.22$, and the longer answer wins.

Beam search is standard in machine translation and speech recognition, where there is roughly one right answer and outputs are short. Chat and writing assistants rarely use it: maximising sequence probability favours bland, generic text, it multiplies compute by $b$, and it cannot stream a token until the beams agree.

## Temperature

**Sampling** draws the next token at random according to its probability. **Temperature** $T$ reshapes the distribution first by dividing every logit by $T$:

$$p_i = \frac{e^{z_i / T}}{\sum_j e^{z_j / T}}$$

The ratio between two tokens' probabilities is $e^{(z_i - z_j)/T}$, so $T < 1$ stretches the gaps (sharper) and $T > 1$ shrinks them (flatter). With the logits $(2.0, 1.0, 0.1)$:

| $T$ | Scaled logits | Probabilities |
|---|---|---|
| 0.5 | (4.0, 2.0, 0.2) | (0.864, 0.117, 0.019) |
| 1.0 | (2.0, 1.0, 0.1) | (0.659, 0.242, 0.099) |
| 2.0 | (1.0, 0.5, 0.05) | (0.502, 0.304, 0.194) |

For the France vector: at $T = 0.5$, " Paris" rises to 0.975; at $T = 2$ it falls to 0.461 and " famous" climbs from 0.016 to 0.066. As $T \to 0$ sampling becomes greedy (APIs treat temperature 0 as argmax), and as $T \to \infty$ every token becomes equally likely. Temperature does not add knowledge or remove it. It only decides how often the model says something other than its first choice.

## Top-k, top-p and min-p on one vector

Pure temperature sampling has a subtle flaw. A 100,000-token vocabulary has an enormous **tail** of individually unlikely tokens that together can hold a few percent of the mass. At 3% per step, a 500-token answer draws about $500 \times 0.03 = 15$ tail tokens, and the chance of getting through even 100 tokens without one is $0.97^{100} = 4.8\%$. One bad token can derail everything after it. **Truncation** removes the tail before sampling. Apply the three common rules to the France vector at $T = 1$:

| Rule | What it keeps | Kept tokens | Renormalised probabilities |
|---|---|---|---|
| Top-k, $k = 2$ | the $k$ most likely | " Paris", " a" | 0.891, 0.109 |
| Top-p, $p = 0.9$ | the smallest set whose mass reaches $p$ | " Paris", " a", " the" (mass 0.925) | 0.830, 0.102, 0.068 |
| Min-p, 0.1 | every token with at least 0.1 × the top probability (≥ 0.077) | " Paris", " a" | 0.891, 0.109 |

Walk the top-p row: sort and accumulate " Paris" 0.768, then " a" (0.862), then " the" (0.925); the total has reached 0.9, so everything else is dropped and the survivors are divided by 0.925. " Lyon", a plausible-sounding wrong answer, can no longer be sampled.

Now flatten the distribution to $T = 1.5$ (" Paris" 0.576, " a" 0.142, " the" 0.109, " Lyon" 0.078). Top-p at 0.9 now needs four tokens and lets " Lyon" back in with probability 0.086 after renormalising: temperature and top-p interact. At $T = 2$, top-k with $k = 2$ would discard 38% of the probability mass while min-p keeps all six tokens, because every one is within a factor of ten of the leader. That is the argument for adaptive rules: a fixed $k$ is too tight when many continuations are good and too loose when one dominates.

## Drawing the token

After truncation, the sampler draws a uniform random number $u$ in $[0, 1)$ and walks the cumulative distribution until it exceeds $u$. With the top-p nucleus $(0.830, 0.102, 0.068)$ and $u = 0.85$: the cumulative sums are 0.830 (not yet above 0.85), then 0.932, so the token is " a". Any $u$ below 0.830 gives " Paris". Step through the whole pipeline:

```viz
{"type": "ml", "algorithm": "next-token-sampling", "text": "The capital of France is", "temperature": 0.8, "topP": 0.9,
 "title": "Logits to a sampled token",
 "caption": "Softmax, then temperature 0.8 sharpens the distribution, then top-p 0.9 keeps the nucleus and renormalises, then one uniform draw picks the token."}
```

The usual order is temperature on the logits, then truncation, then sampling. Providers expose different subsets of these knobs, and some advise changing either temperature or top-p but not both; read your provider's documentation rather than assuming. Some have withdrawn them: at the time of writing, Anthropic's [Messages API reference](https://platform.claude.com/docs/en/api/messages) says models released after Claude Opus 4.6 reject a `temperature` other than 1.0 with a 400 error and no longer let you set `top_p` or `top_k`, so on those models the decoding strategy is the provider's, not yours.

## Repetition penalties

**Frequency and presence penalties** subtract from the logits of tokens that have already appeared in the output. In the form some hosted APIs document, a token that has appeared $c$ times loses $c \times$ the frequency penalty plus, if $c > 0$, the presence penalty. Suppose " the" has already appeared twice, with a frequency penalty of 0.5 and a presence penalty of 0.3: its logit falls from 3.6 to $3.6 - 2(0.5) - 0.3 = 2.3$, and its probability from 0.063 to 0.018. Open-source libraries often use a multiplicative variant instead (divide positive logits by a factor such as 1.2, multiply negative ones by it).

Penalties break loops in long-form prose. They harm outputs that legitimately repeat tokens: every JSON key, closing brace and indentation run in structured output is a "repeat", so leave them off there.

## Stopping

A generation ends for one of three reasons, and your code must know which:

1. **End-of-sequence token.** The model emits its end-of-turn token: it decided it was finished.
2. **Stop sequence.** You supplied strings such as `"\nUser:"` and the serving layer halts as soon as the output text contains one. The match happens on decoded text, and the stop string is usually removed from the result.
3. **Maximum tokens.** The hard cap you set was reached. The output is truncated, possibly mid-sentence or mid-JSON-object.

APIs report which one happened (a finish or stop reason). **Always check it.** Parsing a response that stopped on the token limit as though it were complete is a classic production bug. The cap itself is both a cost control and a latency control: at 50 tokens per second, a 2,000-token cap bounds a response at about 40 seconds.

**Streaming** returns tokens as they are generated. It does not make generation faster, but users perceive a response that starts in 300 ms as far quicker than one that appears complete after 8 seconds.

## Constrained decoding

If the output must be valid JSON matching a schema, one of a fixed set of labels, or a string matching a regular expression, the sampler can enforce it directly. At each step it computes which tokens could legally come next under the grammar and sets every other logit to $-\infty$ before sampling.

Trace a label field restricted to `refund`, `cancel` or `other`. Unconstrained, the model's next-token distribution is "Refund" 0.50 (capitalised, not a legal value), "refund" 0.30, "cancel" 0.15, "other" 0.01, everything else 0.04. The mask keeps the three legal tokens, with total mass 0.46, and renormalises: "refund" 0.652, "cancel" 0.326, "other" 0.022. The output is guaranteed to parse, and half the model's probability was on an answer the schema forbade, which was redistributed according to what the model preferred among the legal ones. That is the limit to remember: constraints guarantee **syntax**, never **correctness**, and a schema that fights the way the model wants to answer can reduce quality. [Structured outputs and tool use](/learn/ai-and-llms/building-with-llms/structured-outputs-and-tool-use) covers using them.

## Under the hood: what the sampler runs

A serving stack applies a chain of **logit processors** to each sequence's logits, typically: repetition penalties, then temperature, then top-k, then top-p or min-p, then grammar masks, then the draw. Three implementation details matter for cost and correctness.

- **Sorting is the expensive part.** Top-p needs the probabilities in order, and a full sort of 128,000 values per sequence per step is significant work on a GPU at large batch sizes. Kernels apply top-k first to shrink the candidate set, use partial selection instead of a full sort, or avoid sorting altogether with rejection-based sampling.
- **Sampling without a cumulative walk.** The **Gumbel-max trick** draws exactly from $\text{softmax}(z/T)$ by adding independent noise $g_i = -\ln(-\ln U_i)$ to each scaled logit and taking the argmax. Simulated 200,000 times on the logits $(2.0, 1.0, 0.1)$, it picked the three tokens with frequencies 0.658, 0.243 and 0.099, against the softmax's 0.659, 0.242 and 0.099. It turns sampling into an argmax, which parallelises well.
- **Seeds are best-effort.** Where an API accepts a seed, providers describe determinism as best-effort (OpenAI's documentation says it "is not guaranteed"), because the logits themselves can differ between runs (next section).

The [speculative decoding](/learn/ai-and-llms/how-llms-work/inference-serving) that serving stacks use to go faster is a sampler trick too: a small model proposes tokens and an acceptance rule keeps the output distribution exactly that of the large model.

## Why temperature 0 is still not reproducible

Greedy decoding is deterministic on paper. In production, the same prompt at temperature 0 can still produce different outputs. The main reason is floating-point arithmetic: addition is not associative, so $(0.1 + 0.2) + 0.3 = 0.6000000000000001$ while $0.1 + (0.2 + 0.3) = 0.6$. Inference servers batch your request with other people's, and the batch size changes which GPU kernels run and in what order sums are reduced; [Thinking Machines traced](https://thinkingmachines.ai/blog/defeating-nondeterminism-in-llm-inference/) most endpoint nondeterminism to exactly this lack of batch invariance, not to concurrency as such. The logits differ in their last bits; when the top two tokens are nearly tied, the argmax flips; and every token after the flip is different. Add model updates behind a version alias and exact reproducibility is off the table for most hosted APIs.

The engineering consequences: **never assert on exact output strings** in tests; evaluate structure and meaning instead ([Evals and observability](/learn/ai-and-llms/building-with-llms/evals-and-observability)); pin model versions explicitly; and log prompts and outputs so you can replay what happened.

## Choosing a strategy

| Strategy | Diversity | Repeatable | Cost per output token | Typical failure | Use for |
|---|---|---|---|---|---|
| Greedy (temperature 0) | none | nearly (see above) | 1 pass | repetition loops in long text | labels, extraction, tool arguments |
| Beam search, width $b$ | low | nearly | about $b$ passes | bland, short outputs without length normalisation | translation, speech |
| Temperature sampling, no truncation | tunable | no | 1 pass | tail tokens derail long outputs | rarely on its own |
| Top-p or min-p with moderate $T$ | adaptive | no | 1 pass plus a sort | plausible wrong tokens at high $T$ | open-ended answers, writing |
| Constrained decoding | as the base sampler | as the base sampler | small grammar overhead | valid but wrong values | machine-read output |
| $n$ samples plus a vote or verifier | high | no | $n \times$ | cost | reasoning answers that can be checked |

Many APIs can also return the **log-probabilities** of the chosen tokens and their closest alternatives. They are a cheap signal for classification confidence (compare the probability of "yes" against "no") and for spotting uncertain spans. They measure how sure the model is about the next token, not whether the claim is true.

## Failure modes in production

**Truncated JSON on long inputs.** *Symptom:* parsing fails only for long documents. *Diagnosis:* the finish reason is the token limit, not end of turn. *Fix:* check the finish reason on every response, raise the cap or shrink the output schema, and treat a length stop as an error.

**Loops at temperature 0.** *Symptom:* long summaries repeat the same sentence until the cap. *Diagnosis:* greedy decoding reinforcing a likely phrase. *Fix:* a small temperature with top-p, a modest repetition penalty for prose (never for structured output), or a shorter output target.

**Junk tokens at high temperature.** *Symptom:* creative outputs are good for a paragraph and then drift into a wrong language or nonsense. *Diagnosis:* no truncation, so tail tokens are drawn about once every 30 tokens at 3% tail mass. *Fix:* top-p or min-p, and a lower temperature.

**A stop sequence that fires inside the content.** *Symptom:* code answers end abruptly at the first blank line. *Diagnosis:* a stop sequence such as `"\n\n"` matched legitimate output. *Fix:* use stop strings that cannot occur in valid output, or rely on the end-of-turn token.

**Flaky exact-match tests.** *Symptom:* a temperature-0 test fails one run in twenty in CI. *Diagnosis:* batch-dependent floating-point differences flipping a near-tie. *Fix:* assert on parsed structure or evaluated meaning, pin the model version, and keep a replay log.

## Exercises

```exercise
id: softmax-with-temperature
title: Softmax with temperature
prompt: |
  Implement `softmax(logits, temperature)`: divide every logit by `temperature`
  (a positive number), then return the softmax of the result as a list of
  probabilities in the same order.

  Logits can be large (for example 1000), so subtract the maximum scaled logit
  before exponentiating; a naive implementation overflows.

  Return unrounded floats; results are compared to 6 decimal places.
languages: [python, javascript]
entry: softmax
starter:
  python: |
    import math

    def softmax(logits, temperature):
        # your code here
        return [1.0 / len(logits)] * len(logits)
  javascript: |
    function softmax(logits, temperature) {
      // your code here
      return logits.map(() => 1 / logits.length);
    }
tests:
  - args: [[2.0, 1.0, 0.1], 1]
    expected: [0.659001, 0.242433, 0.098566]
    label: temperature 1
  - args: [[2.0, 1.0, 0.1], 0.5]
    expected: [0.863777, 0.1169, 0.019323]
    label: low temperature sharpens
  - args: [[2.0, 1.0, 0.1], 2]
    expected: [0.501688, 0.304289, 0.194023]
    label: high temperature flattens
  - args: [[5, 5, 5, 5], 1]
    expected: [0.25, 0.25, 0.25, 0.25]
    label: equal logits give a uniform distribution
  - args: [[3.7], 0.7]
    expected: [1]
    label: a single token gets all the probability
  - args: [[1000, 1001, 1002], 1]
    expected: [0.090031, 0.244728, 0.665241]
    hidden: true
    label: large logits must not overflow
  - args: [[-1, -2, -3], 1]
    expected: [0.665241, 0.244728, 0.090031]
    hidden: true
    label: negative logits
hints:
  - "Scale first: `z = [x / temperature for x in logits]`, then subtract `max(z)` from each."
  - "Exponentiate, sum, and divide each exponential by the sum."
```

```exercise
id: top-p-filter
title: Top-p (nucleus) filtering
prompt: |
  Given a probability distribution `probs` (non-negative, summing to about 1)
  and a threshold `p` in (0, 1], return the distribution after nucleus
  filtering, in the original token order:

  1. Consider tokens from most to least probable (break ties by lower index).
  2. Keep tokens until the cumulative probability of the kept tokens is >= p.
  3. Set every other token to 0 and divide the kept ones by their total, so the
     result sums to 1.

  Careful: floating-point sums of probabilities can fall just short of 1, so with
  p = 1 your loop must stop when it runs out of tokens.
  Return unrounded floats; results are compared to 6 decimal places.
languages: [python, javascript]
entry: top_p_filter
starter:
  python: |
    def top_p_filter(probs, p):
        # your code here
        return probs
  javascript: |
    function top_p_filter(probs, p) {
      // your code here
      return probs;
    }
tests:
  - args: [[0.5, 0.2, 0.15, 0.1, 0.05], 0.9]
    expected: [0.526316, 0.210526, 0.157895, 0.105263, 0]
    label: keep four tokens, drop the tail, renormalise
  - args: [[0.5, 0.2, 0.15, 0.1, 0.05], 0.5]
    expected: [1, 0, 0, 0, 0]
    label: the top token alone reaches p exactly
  - args: [[0.1, 0.6, 0.3], 0.8]
    expected: [0, 0.666667, 0.333333]
    label: input is not sorted
  - args: [[0.2, 0.5, 0.3], 0.1]
    expected: [0, 1, 0]
    label: a small p is greedy decoding
  - args: [[0.4, 0.3, 0.3], 0.6]
    expected: [0.571429, 0.428571, 0]
    hidden: true
    label: ties are broken by lower index
  - args: [[0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1], 1.0]
    expected: [0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1]
    hidden: true
    label: p = 1 keeps everything even when the float sum is below 1
  - args: [[0.8631, 0.0625, 0.0379, 0.0203, 0.0096, 0.0066], 0.9]
    expected: [0.932476, 0.067524, 0, 0, 0, 0]
    hidden: true
    label: the France example at temperature 0.8
hints:
  - "Sort the indices, not the probabilities, so you can write results back in the original order: `sorted(range(n), key=lambda i: (-probs[i], i))`."
  - "Loop over the sorted indices, append each to a kept list and add its probability; break as soon as the running total is >= p."
  - "Divide each kept probability by the sum of the kept probabilities; everything else is 0."
```

## Interviewer follow-ups

**"Explain temperature, top-k and top-p on a concrete distribution."** *Model answer:* temperature divides the logits, so gaps grow or shrink ($T = 0.5$ takes " Paris" from 0.768 to 0.975); top-k keeps a fixed number of candidates; top-p keeps the smallest set reaching mass $p$ (three tokens with mass 0.925 at $T = 1$, four at $T = 1.5$), then renormalises; a uniform draw walks the cumulative distribution. *Common wrong answer:* "temperature is randomness", with no mention that it rescales logits before any draw.

**"Why is greedy decoding not the most probable output?"** *Model answer:* it maximises each step, not the product; a token that is second best now can lead to a much more certain continuation (0.4 × 0.9 = 0.36 beats 0.5 × 0.4 = 0.20). Beam search approximates the sequence maximum, and needs length normalisation or it prefers short outputs. *Common wrong answer:* "greedy is optimal because it always picks the best token".

**"How would you make an LLM feature's tests reliable?"** *Model answer:* do not assert exact strings; assert on parsed structure, allowed values and semantic checks; use constrained decoding for machine-read outputs; pin model versions; run a small eval set with a pass-rate threshold rather than a single sample. *Common wrong answer:* "set temperature 0 and a seed", which does not survive batched GPU inference.

**"When would you use constrained decoding, and what does it not solve?"** *Model answer:* whenever a program reads the output (JSON, enums, regular formats), because it guarantees syntax at the sampler; it does not make values correct, and it redistributes probability the model put on illegal answers (half the mass in the label example), so a badly designed schema can lower quality. *Common wrong answer:* "it guarantees correct answers".

## What mid-level engineers get wrong

- **Treating temperature 0 as deterministic.** Batched floating point flips near-ties.
- **Ignoring the finish reason.** Truncated output gets parsed as complete.
- **Turning every knob at once.** Temperature and top-p interact; change one, measure, then the other.
- **Using repetition penalties on structured output.** Keys and braces are supposed to repeat.
- **Choosing a fixed top-k for everything.** It is too loose for factual prompts and too tight for open-ended ones.
- **Reading log-probabilities as truth.** They measure the model's confidence in the next token, not the claim.

## Senior signals

- You treat the decoding strategy as **part of the design**, not a default: greedy or constrained decoding for structured tasks, sampling with truncation for open-ended ones.
- You can apply **temperature, top-k, top-p and min-p to a concrete logit vector** and explain why adaptive truncation beats a fixed $k$.
- You know why greedy decoding does not find the most probable sequence and why beam search needs **length normalisation**.
- You **check the finish reason** on every response and handle truncation at the token limit explicitly.
- You know **temperature 0 is not reproducible** on batched GPU inference, so tests assert on structure and semantics, model versions are pinned and outputs are logged.
- You use **constrained decoding** for machine-read outputs and remember it guarantees syntax, not correctness, and you reason about cost knowing **output tokens are sequential and cost more** than input tokens.

## Check yourself

```quiz
- q: >-
    Logits for three tokens are (2.0, 1.0, 0.1). What happens to the probability of the top token when temperature goes from 1.0 to 0.5?
  options: ["It falls from 0.66 to about 0.50", "It rises from 0.66 to about 0.86", "It stays at 0.66; only the tail changes", "It becomes exactly 1.0, as in greedy"]
  answer: 1
  explanation: >-
    Dividing by 0.5 doubles every logit gap, so the softmax sharpens: (4.0, 2.0, 0.2) gives about (0.864, 0.117, 0.019). Only temperature 0 (greedy) makes it exactly 1, and a higher temperature, not a lower one, lowers it toward 0.5.
- q: >-
    Why does top-p adapt better than top-k across different contexts?
  options: ["It keeps as many tokens as it takes to reach probability mass p", "It is cheaper to compute, since it skips sorting the vocabulary", "It works on raw logits, so no softmax is needed at each step", "It never drops tokens, so rare but valid words stay reachable"]
  answer: 0
  explanation: >-
    Keeping however many tokens are needed to reach mass p means a peaked distribution keeps one or two tokens and a flat one keeps many: three tokens for the France example at temperature 1, four at 1.5. A fixed k is too permissive when one answer dominates and too restrictive when many continuations are fine. Top-p still needs sorted probabilities and does drop the tail.
- q: >-
    The top-p nucleus after renormalising is (0.830, 0.102, 0.068) and the sampler draws u = 0.85. Which token is chosen?
  options: ["None, since u is above the top token's probability", "The first, since it holds most of the probability", "The second, since the cumulative sum first passes u there", "The third, since u is closest to the end of the distribution"]
  answer: 2
  explanation: >-
    Inverse-CDF sampling walks the cumulative sums, 0.830 then 0.932, and returns the first token whose cumulative sum exceeds u; 0.830 does not exceed 0.85, 0.932 does. Any u below 0.830 would have chosen the first token, which is how it gets its 83% share.
- q: >-
    A service asks for JSON with max_tokens = 500. For long inputs, parsing sometimes fails with an unexpected end of input. What is the right fix?
  options: ["Switch to beam search so the model finds a complete object", "Retry with a higher temperature so the model picks shorter keys", "Add \"Always close your JSON\" to the prompt as a hard instruction", "Check the finish reason and handle truncation at the token limit"]
  answer: 3
  explanation: >-
    The model was cut off by the cap mid-object. The API reports that the stop was due to max tokens, and the code must treat that as truncated output and handle it explicitly (raise the cap, paginate, shrink the schema). Temperature, prompt pleading and beam search do not stop the cap from truncating.
- q: >-
    A regression test sends the same prompt at temperature 0 and asserts the exact output string. It passes locally but fails intermittently in CI against the hosted API. The most likely cause is:
  options: ["Batched GPU maths can flip near-tied tokens between runs", "The tokenizer splits the prompt differently on each call", "The hosted API silently ignores a temperature of exactly 0", "Temperature 0 still samples randomly, just from fewer tokens"]
  answer: 0
  explanation: >-
    Floating-point addition is not associative, and batch composition changes kernel and reduction order, so logits differ in their last bits. When two candidates are nearly tied, the argmax flips and every later token can differ. Temperature 0 is greedy, not random, and tokenization is deterministic. Tests should assert structure or meaning, not exact strings.
- q: >-
    Beam search prefers a two-token reply with probability 0.27 over a six-token answer with probability 0.26 whose every token has probability 0.8. What fixes the bias?
  options: ["A higher temperature, so short replies become less likely", "Adding a stop sequence, so the short reply cannot end early", "Dividing each candidate's log-probability by its length", "A wider beam, so the longer answer stays among the candidates"]
  answer: 2
  explanation: >-
    Every extra token multiplies in a probability below 1, so raw sequence probability favours short outputs regardless of beam width. Length normalisation compares average log-probability per token: −1.31/2 = −0.65 against −1.34/6 = −0.22, and the longer answer wins. Temperature and stop sequences do not change how beams are scored.
```

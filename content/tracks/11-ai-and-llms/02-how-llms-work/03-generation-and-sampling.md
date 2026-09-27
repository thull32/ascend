---
slug: generation-and-sampling
title: "Generation and sampling: temperature, top-p, beam search and stopping"
description: How a probability distribution becomes text, one token at a time. Softmax and temperature worked with numbers, greedy versus beam search, top-k and top-p truncation, stopping rules, constrained decoding and why temperature 0 is still not reproducible.
minutes: 37
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

Now a realistic one. After "The capital of France is", suppose the six highest logits are " Paris" 6.1, " a" 4.0, " the" 3.6, " Lyon" 3.1, " not" 2.5 and " famous" 2.2 (treating these six as the whole vocabulary to keep the numbers readable). The softmax gives " Paris" 0.77, " a" 0.09, " the" 0.06, " Lyon" 0.04, " not" 0.02, " famous" 0.02. A logit gap of 2.1 between " Paris" and " a" became a probability ratio of $e^{2.1} \approx 8$.

Implementations always subtract the largest logit before exponentiating. Multiplying every $e^{z_i}$ by the same constant $e^{-\max z}$ cancels in the division, so the result is identical, but $e^{1000}$ overflows a 64-bit float and $e^{0}$ does not.

## Greedy decoding, and why it is not the best sequence

**Greedy decoding** always picks the most likely token. It is simple and, mathematically, deterministic. For short, factual, tightly specified outputs (a classification label, an extracted field, a tool argument) it is usually what you want.

For longer text it has two problems. It is prone to **repetition loops**: once a phrase becomes likely, repeating it makes it more likely, and greedy never escapes. And the most likely token at each step does not give the most likely *sequence*. Consider a two-step choice:

- Step 1: A has probability 0.5, B has 0.4, C has 0.1.
- After A, the best continuation has probability 0.4 (the model is unsure what follows A).
- After B, the best continuation has probability 0.9.

Greedy picks A and then its best continuation: $0.5 \times 0.4 = 0.20$. The sequence B then its continuation has probability $0.4 \times 0.9 = 0.36$. Greedy never sees it because it committed at step 1.

## Beam search

**Beam search** keeps the $b$ best partial sequences (by total log-probability) at every step instead of one. With $b = 2$ in the example, step 1 keeps A (0.5) and B (0.4); step 2 expands both and keeps the two best complete candidates, B-then-best (0.36) and A-then-best (0.20). It finds the better sequence.

Beam search is standard in machine translation and speech recognition, where there is roughly one right answer and outputs are short. Chat and writing assistants rarely use it. Maximising sequence probability favours short, generic, repetitive text (the highest-probability reply to almost anything is bland), it multiplies compute by $b$, and it cannot stream a token until the beams agree. Open-ended generation uses sampling instead.

## Temperature

**Sampling** draws the next token at random according to its probability. **Temperature** $T$ reshapes the distribution first by dividing every logit by $T$:

$$p_i = \frac{e^{z_i / T}}{\sum_j e^{z_j / T}}$$

The ratio between two tokens' probabilities is $e^{(z_i - z_j)/T}$, so $T < 1$ stretches the gaps (sharper, more confident) and $T > 1$ shrinks them (flatter, more random). With the logits $(2.0, 1.0, 0.1)$:

| $T$ | Scaled logits | Probabilities |
|---|---|---|
| 0.5 | (4.0, 2.0, 0.2) | (0.864, 0.117, 0.019) |
| 1.0 | (2.0, 1.0, 0.1) | (0.659, 0.242, 0.099) |
| 2.0 | (1.0, 0.5, 0.05) | (0.502, 0.304, 0.194) |

For "The capital of France is": at $T = 0.5$, " Paris" rises to 0.98; at $T = 2$ it falls to 0.46 and " famous" climbs from 0.02 to 0.07. As $T \to 0$ sampling becomes greedy (APIs treat temperature 0 as argmax), and as $T \to \infty$ every token becomes equally likely. Temperature does not add knowledge or remove it. It only decides how often the model says something other than its first choice.

## Top-k and top-p: cutting off the tail

Pure temperature sampling has a subtle flaw. A 100,000-token vocabulary has an enormous **tail** of individually unlikely tokens. Each one has negligible probability, but together they can hold a few percent of the mass. At 3% per step, some junk token gets drawn roughly every 30 tokens, and one bad token can derail everything after it. **Truncation** removes the tail before sampling.

- **Top-k** keeps the $k$ most likely tokens and renormalises. The problem is that the right $k$ depends on the context. After "The capital of France is" there is one good answer; after "Once upon a time, the" there are hundreds. A fixed $k = 40$ is too permissive for the first and too tight for the second.
- **Top-p** (nucleus sampling) keeps the **smallest set of most likely tokens whose total probability reaches $p$**, then renormalises. It adapts to the shape of the distribution: a peaked distribution keeps one or two tokens, a flat one keeps hundreds.

Work top-p with $p = 0.9$ on the France example at $T = 1$. Sort by probability and accumulate: " Paris" 0.768 (running total 0.768), " a" 0.094 (0.862), " the" 0.063 (0.925). The total has reached 0.9, so the nucleus is those three tokens with mass 0.925. Everything else is dropped, and the three survivors are divided by 0.925: " Paris" 0.830, " a" 0.102, " the" 0.068. " Lyon", a plausible-sounding wrong answer, can no longer be sampled. Raise the temperature to 1.5 and the distribution flattens enough that " Lyon" gets back into the 0.9 nucleus: temperature and top-p interact.

Finally, draw a uniform random number $u$ in $[0, 1)$ and walk the cumulative distribution until it exceeds $u$. Step through the whole pipeline:

```viz
{"type": "ml", "algorithm": "next-token-sampling", "text": "The capital of France is", "temperature": 0.8, "topP": 0.9,
 "title": "Logits to a sampled token",
 "caption": "Softmax, then temperature 0.8 sharpens the distribution, then top-p 0.9 keeps the nucleus and renormalises, then one uniform draw picks the token."}
```

A few practical notes. The usual order is temperature on the logits, then truncation, then sampling. **Min-p** is a newer variant that keeps every token with at least a fixed fraction of the top token's probability. Providers expose different subsets of these knobs and some advise changing either temperature or top-p but not both; read your provider's documentation rather than assuming.

## Repetition penalties

**Frequency and presence penalties** subtract a value from the logits of tokens that have already appeared in the output (per occurrence, or once). They break loops in long-form text. They also harm outputs that legitimately repeat tokens (code, JSON keys, tables), so leave them off for structured output.

## Stopping

A generation ends for one of three reasons, and your code must know which:

1. **End-of-sequence token.** The model emits its end-of-turn token: it decided it was finished.
2. **Stop sequence.** You supplied strings such as `"\nUser:"` and the serving layer halts as soon as the output text contains one. The match happens on decoded text, and the stop string is usually removed from the result.
3. **Maximum tokens.** The hard cap you set was reached. The output is truncated, possibly mid-sentence or mid-JSON-object.

APIs report which one happened (a finish or stop reason). **Always check it.** Parsing a response that stopped on the token limit as though it were complete is a classic production bug: the JSON fails to parse on long inputs only, or worse, parses into a silently incomplete list. The cap itself is both a cost control and a latency control: at, say, 50 tokens per second, a 2,000-token cap bounds a response at about 40 seconds.

**Streaming** returns tokens as they are generated. It does not make generation faster, but users perceive a response that starts in 300 ms as far quicker than one that appears complete after 8 seconds.

## Constrained decoding

If the output must be valid JSON matching a schema, one of a fixed set of labels, or a string matching a regular expression, the sampler can enforce it directly. At each step it computes which tokens could legally come next under the grammar and sets every other logit to $-\infty$ before sampling. The output is guaranteed to parse. This is how "structured output" modes work under the hood; [Structured outputs and tool use](/learn/ai-and-llms/building-with-llms/structured-outputs-and-tool-use) covers using them. Keep in mind what the constraint does and does not do: it guarantees **syntax**, never **correctness**, and a schema that fights the way the model wants to answer can reduce quality.

## Why temperature 0 is still not reproducible

Greedy decoding is deterministic on paper. In production, the same prompt at temperature 0 can still produce different outputs. The main reason is floating-point arithmetic: addition is not associative, so $(0.1 + 0.2) + 0.3 = 0.6000000000000001$ while $0.1 + (0.2 + 0.3) = 0.6$. Inference servers batch your request with other people's, and the batch size changes which GPU kernels run and in what order sums are reduced. The logits differ in their last bits; when the top two tokens are nearly tied, the argmax flips; and every token after the flip is different. Add model updates behind a version alias and seeds that are not always honoured, and exact reproducibility is off the table for most hosted APIs.

The engineering consequences: **never assert on exact output strings** in tests; evaluate structure and meaning instead (the subject of [Evals and observability](/learn/ai-and-llms/building-with-llms/evals-and-observability)); pin model versions explicitly; and log prompts and outputs so you can replay what actually happened.

## Choosing settings

| Task | Starting point |
|---|---|
| Extraction, classification, tool arguments, code edits | Temperature 0 or low; constrained decoding if available |
| General assistant answers | The provider's defaults |
| Brainstorming, creative writing, varied phrasings | Higher temperature, or several samples and pick one |
| Voting or verification (several answers, then check) | Moderate temperature, $n$ samples, a verifier or majority vote to choose |

Many APIs can also return the **log-probabilities** of the chosen tokens and their closest alternatives. They are a cheap signal for classification confidence (compare the probability of "yes" against "no") and for spotting uncertain spans. They measure how sure the model is about the next token, not whether the claim is true.

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

## Senior signals

- You treat the decoding strategy as **part of the design**, not a default: greedy or constrained decoding for structured tasks, sampling with truncation for open-ended ones.
- You can explain temperature as **dividing logits**, top-p as **an adaptive cut-off of the tail**, and why greedy decoding does not find the most probable sequence.
- You **check the finish reason** on every response and handle truncation at the token limit explicitly.
- You know **temperature 0 is not reproducible** on batched GPU inference, so tests assert on structure and semantics, model versions are pinned and outputs are logged.
- You use **constrained decoding** for machine-read outputs and remember it guarantees syntax, not correctness.
- You reason about cost with the asymmetry in mind: **output tokens are sequential and cost more** than input tokens.

## Check yourself

```quiz
- q: >-
    Logits for three tokens are (2.0, 1.0, 0.1). What happens to the probability of the top token when temperature goes from 1.0 to 0.5?
  options: ["It falls from 0.66 to 0.50", "It rises from 0.66 to about 0.86", "It stays at 0.66; temperature only affects the tail", "It becomes exactly 1.0"]
  answer: 1
  explanation: >-
    Dividing by 0.5 doubles every logit gap, so the softmax sharpens: (4.0, 2.0, 0.2) gives about (0.864, 0.117, 0.019). Only temperature 0 (greedy) makes it exactly 1, and a higher temperature, not a lower one, lowers it toward 0.5.
- q: >-
    Why does top-p adapt better than top-k across different contexts?
  options: ["It is faster to compute", "It never drops any token", "It removes the need for a softmax", "It keeps however many tokens are needed to reach probability mass p, so a peaked distribution keeps few tokens and a flat one keeps many"]
  answer: 3
  explanation: >-
    A fixed k is too permissive when one answer dominates and too restrictive when many continuations are fine. The nucleus grows and shrinks with the distribution's shape. Top-p still needs the softmax probabilities and does drop the tail.
- q: >-
    A service asks for JSON with max_tokens = 500. For long inputs, parsing sometimes fails with an unexpected end of input. What is the right fix?
  options: ["Check the finish reason; treat a stop on the token limit as truncated output, and raise the limit or reduce the output size", "Retry with a higher temperature", "Add \"Please close your JSON\" to the prompt", "Switch to beam search"]
  answer: 0
  explanation: >-
    The model was cut off by the cap mid-object. The API reports that the stop was due to max tokens, and the code must handle it explicitly (raise the cap, paginate, shrink the schema). Temperature, prompt pleading and beam search do not stop the cap from truncating.
- q: >-
    A regression test sends the same prompt at temperature 0 and asserts the exact output string. It passes locally but fails intermittently in CI against the hosted API. The most likely cause is:
  options: ["The API ignores temperature 0", "Temperature 0 samples randomly by design", "Batched GPU inference changes the order of floating-point reductions, so near-tied tokens can flip and the output diverges from there", "The tokenizer is non-deterministic"]
  answer: 2
  explanation: >-
    Floating-point addition is not associative, and batch composition changes kernel and reduction order, so logits differ in their last bits. When two candidates are nearly tied, the argmax flips and every later token can differ. Tests should assert structure or meaning, not exact strings.
- q: >-
    In the two-step example, greedy decoding yields a sequence with probability 0.20 while another sequence has probability 0.36. Why did greedy miss it?
  options: ["Greedy decoding is random", "Greedy commits to the single best token at each step, and the better sequence starts with a token that was only second best at step 1", "The better sequence contained an end-of-sequence token", "Greedy decoding only considers top-p tokens"]
  answer: 1
  explanation: >-
    Choosing A (0.5) over B (0.4) at step 1 was locally best, but B's continuation was far more certain (0.9 versus 0.4). Beam search with width 2 keeps B alive and finds the 0.36 sequence. Greedy is deterministic, not random.
```

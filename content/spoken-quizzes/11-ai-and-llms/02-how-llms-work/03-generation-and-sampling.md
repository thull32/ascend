---
lesson: generation-and-sampling
source: 267256978932e6b4
---
## 1

The logits for three tokens are 2.0, 1.0 and 0.1. What happens to the probability of the top token when the temperature goes from 1.0 to 0.5?

A, it falls from 0.66 to about 0.50. B, it rises from 0.66 to about 0.86. C, it stays at 0.66; only the tail changes. D, it becomes exactly 1, as in greedy decoding.

[think]

The answer is B: it rises from 0.66 to about 0.86.

Dividing by 0.5 doubles every gap between logits, so the softmax sharpens: 4.0, 2.0 and 0.2 give about 0.864, 0.117 and 0.019. Only temperature zero, which is greedy, makes it exactly 1, and a higher temperature, not a lower one, pushes it down toward 0.5.

## 2

Why does top-p sampling adapt better than top-k across different contexts?

A, it keeps as many tokens as it takes to reach probability mass p. B, it is cheaper to compute, since it skips sorting the vocabulary. C, it works on raw logits, so no softmax is needed at each step. D, it never drops tokens, so rare but valid words stay reachable.

[think]

The answer is A: it keeps as many tokens as it takes to reach probability mass p.

Keeping however many tokens are needed to reach mass p means a peaked distribution keeps one or two tokens, and a flat one keeps many: in the lesson's France example, three tokens at temperature 1 and four at 1.5. A fixed k is too permissive when one answer dominates, and too restrictive when many continuations are fine. Top-p still needs sorted probabilities, and it does drop the tail.

## 3

After renormalising, the top-p nucleus has probabilities 0.830, 0.102 and 0.068, and the sampler draws a uniform number of 0.85. Which token is chosen?

A, none, since the draw is above the top token's probability. B, the first, since it holds most of the probability. C, the second, since the cumulative sum first passes the draw there. D, the third, since the draw is closest to the end of the distribution.

[think]

The answer is C: the second, since the cumulative sum first passes the draw there.

Inverse-CDF sampling walks the cumulative sums, 0.830 then 0.932, and returns the first token whose cumulative sum exceeds the draw. 0.830 does not exceed 0.85; 0.932 does. Any draw below 0.830 would have chosen the first token, which is how it gets its 83 percent share.

## 4

A service asks for JSON, with max tokens set to 500. For long inputs, parsing sometimes fails with an unexpected end of input. What is the right fix?

A, switch to beam search, so the model finds a complete object. B, retry with a higher temperature, so the model picks shorter keys. C, add "always close your JSON" to the prompt as a hard instruction. D, check the finish reason, and handle truncation at the token limit.

[think]

The answer is D: check the finish reason, and handle truncation at the token limit.

The cap cut the model off mid-object. The API reports that it stopped because of max tokens, and the code must treat that as truncated output and handle it explicitly: raise the cap, paginate, or shrink the schema. Temperature, pleading in the prompt, and beam search do not stop the cap from truncating.

## 5

A regression test sends the same prompt at temperature 0 and checks for an exact output string. It passes locally, but fails now and then in CI against the hosted API. What is the most likely cause?

A, batched GPU maths can flip near-tied tokens between runs. B, the tokenizer splits the prompt differently on each call. C, the hosted API silently ignores a temperature of exactly zero. D, temperature zero still samples randomly, just from fewer tokens.

[think]

The answer is A: batched GPU maths can flip near-tied tokens between runs.

Floating-point addition is not associative, and the batch composition changes kernel and reduction order, so logits differ in their last bits. When two candidates are nearly tied, the top choice flips, and every later token can differ. Temperature zero is greedy, not random, and tokenization is deterministic. Tests should check structure or meaning, not exact strings.

## 6

Beam search prefers a two-token reply with probability 0.27 over a six-token answer with probability 0.26, whose every token has probability 0.8. What fixes the bias?

A, a higher temperature, so short replies become less likely. B, adding a stop sequence, so the short reply cannot end early. C, dividing each candidate's log-probability by its length. D, a wider beam, so the longer answer stays among the candidates.

[think]

The answer is C: dividing each candidate's log-probability by its length.

Every extra token multiplies in a probability below 1, so raw sequence probability favours short outputs, whatever the beam width. Length normalisation compares the average log-probability per token: minus 1.31 over 2, about minus 0.65, against minus 1.34 over 6, about minus 0.22, and the longer answer wins. Temperature and stop sequences do not change how beams are scored.

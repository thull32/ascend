---
lesson: training-llms
source: c91212a941b8dbd4
---
## 1

Using the six N D rule, roughly how many floating-point operations does it take to train a 7-billion-parameter model on 2 trillion tokens?

A, about 2.8 times 10 to the 16. B, about 1.4 times 10 to the 10. C, about 8.4 times 10 to the 22. D, about 8.4 times 10 to the 31.

[think]

The answer is C: about 8.4 times 10 to the 22.

6, times 7 times 10 to the 9, times 2 times 10 to the 12, is 8.4 times 10 to the 22. The 6 is 2 operations per parameter per token for the forward pass, plus 4 for the backward pass. 1.4 times 10 to the 10 is one forward pass over a single token, and 10 to the 31 comes from multiplying the exponents instead of adding them.

## 2

Your team wants the assistant to answer questions about 3,000 internal wiki pages that change every week. A colleague proposes fine-tuning on the pages. What is the stronger design?

A, continue pretraining the base model on the wiki, so the facts are learned deeply. B, fine-tune weekly on the changed pages, since fine-tuning is how you add knowledge. C, retrieve relevant pages at query time, and fine-tune, if at all, only for format. D, fine-tune once on all the pages, then raise the temperature so it recalls more of them.

[think]

The answer is C: retrieve relevant pages at query time, and fine-tune, if at all, only for format.

Facts seen a few times in fine-tuning are recalled unreliably, and go stale when pages change, while retrieval supplies current text and makes answers checkable. Fine-tuning suits form, meaning format and tone, not facts. Continued pretraining is vastly more expensive and has the same staleness problem, and temperature does not add knowledge.

## 3

A reward model scores the human-preferred answer 0.6, and the rejected answer 1.8. What is its Bradley-Terry loss on this pair, and what does training do?

A, about 0.26; little changes, because the loss is already small for this pair. B, about 1.46; training raises the preferred score relative to the rejected one. C, 1.2; training shrinks the gap, because the loss is the score difference. D, zero; nothing, because reward models are trained only on absolute scores.

[think]

The answer is B: about 1.46, and training raises the preferred score relative to the rejected one.

The loss is minus the log of the sigmoid of 0.6 minus 1.8, that is, of minus 1.2. The sigmoid of minus 1.2 is about 0.231, and minus its log is about 1.46, large because the ranking is wrong. Its gradient pushes the preferred score up and the rejected one down. 0.26 is the loss when the ranking is correct, and the loss is a function of the score difference, not the difference itself.

## 4

In DPO with beta equal to 0.1, the policy gives the chosen response a log-probability of minus 12, where the reference gives minus 13, and the rejected one minus 15, where the reference gives minus 14. What are the implicit reward margin and the loss?

A, margin 3.0, loss about 0.05, since the policy already prefers the chosen one. B, margin 0.2, loss about 0.60, and training widens the margin further. C, margin minus 0.2, loss about 0.80, since the chosen response is less likely. D, margin zero, loss about 0.69, since the two log-ratios cancel each other out.

[think]

The answer is B: margin 0.2, loss about 0.60, and training widens the margin further.

The log-ratios against the reference are plus 1 for the chosen response and minus 1 for the rejected one, so the margin is 0.1 times their difference of 2, which is 0.2. The loss is minus the log of the sigmoid of 0.2, about 0.598, and the gradient raises the chosen log-probability and lowers the rejected one. A margin of 3.0 uses the raw policy gap and forgets both the reference and beta. The log-ratios have opposite signs, so they add rather than cancel.

## 5

Why does RLHF include a KL penalty that keeps the policy close to the supervised model?

A, because it makes generation more deterministic, so outputs stay consistent. B, because the reward model is an imperfect proxy that the policy would exploit. C, because it shrinks the policy's effective size, which makes training cheaper. D, because KL divergence from the supervised model measures loss of factual accuracy.

[think]

The answer is B: the reward model is an imperfect proxy that the policy would exploit.

Pushing hard on a learned reward finds its blind spots, which is reward hacking: padding or flattery that the reward model happens to like. In the lesson's worked example, a hacked answer with a reward of 2.6 but a log-ratio sum of 9.0 scores 1.70 after the penalty, below an honest answer's 1.83. The penalty has nothing to do with model size or determinism, and KL measures the distance between distributions, not factual accuracy.

## 6

Scaling-law work suggests about 20 tokens per parameter is compute-optimal, yet small open models are often trained on over 100 tokens per parameter. Why?

A, because overtraining a small model sharply reduces its hallucination rate. B, because smaller models need more tokens per parameter to learn their tokenizer well. C, because training is paid once, but serving cost scales with parameters per request. D, because later work showed the scaling laws were wrong about the optimal ratio.

[think]

The answer is C: training is paid once, but serving cost scales with parameters per request.

Compute-optimal means the best quality for a given training budget; the scaling laws optimise a different cost. Serving costs about 2 operations per parameter per token, for the model's whole lifetime, so for a model that will serve trillions of tokens, it is cheaper overall to spend more training compute on a smaller model. Overtraining does not eliminate hallucination.

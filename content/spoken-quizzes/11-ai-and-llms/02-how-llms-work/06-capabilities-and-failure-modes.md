---
lesson: capabilities-and-failure-modes
source: 16ccc96eff86cca0
---
## 1

An assistant invents a plausible but non-existent configuration flag for an internal tool. A colleague proposes setting the temperature to zero. What will that achieve?

A, it makes the output more cautious, so the model hedges instead of inventing a flag. B, little: if the invented flag is the top choice, greedy decoding always emits it. C, it makes the model say "I don't know" whenever it is unsure of the flag's name. D, it fixes the problem, because hallucinations come from randomness in the sampling.

[think]

The answer is B: little. If the invented flag is the top choice, greedy decoding always emits it.

Temperature only controls how often tokens other than the top one are sampled. For long-tail facts, the top choice itself can be fabricated, so temperature zero makes the error consistent rather than rare. It adds no caution and no way to abstain, because a softmax has no reserved slot for not knowing. Grounding the answer in the tool's documentation, and verifying flags against it, addresses the cause.

## 2

Why does asking a model to show its working improve accuracy on multi-step arithmetic?

A, it prompts the model to retrieve the fully worked answer from its training data. B, it switches the model to a more accurate internal arithmetic routine. C, intermediate tokens act as working memory, so each step is an easy prediction. D, it lowers the effective temperature, so the model samples fewer wrong digits.

[think]

The answer is C: intermediate tokens act as working memory, so each step is an easy prediction.

Each token gets one fixed forward pass of computation, so the model cannot do unlimited serial computation inside one token. Writing intermediate results lets later tokens build on earlier ones, at the price of more tokens: 60 times the compute for 300 tokens instead of 5. There is no hidden calculator, and the temperature is unchanged.

## 3

Each sample from a model is independently correct with probability 0.6. What does a majority vote over five samples give, and when does voting hurt?

A, about 0.78; it hurts when the samples use a high temperature. B, about 0.68; it hurts when per-sample accuracy is below one half. C, about 0.60; voting cannot beat the accuracy of a single sample. D, about 0.92; it only hurts when there are too few samples to vote.

[think]

The answer is B: about 0.68, and it hurts when per-sample accuracy is below one half.

The majority is right when at least 3 of the 5 are right, and adding up the chances of exactly 3, 4 and 5 correct gives about 0.683. Voting amplifies whichever answer is usually produced, so at a per-sample accuracy of 0.4, the same vote falls to 0.317. Correlated samples shrink the gain further, and five votes cost five times the tokens.

## 4

A retrieval-augmented assistant answers with quotes from policy documents. Which check most directly catches fabricated quotes?

A, ask the model to confirm that each quote is accurate before it replies. B, check in code that each quoted span appears word for word in the cited source. C, lower the temperature, so that quotes are copied more faithfully. D, use a larger model, since larger models fabricate quotes far less often.

[think]

The answer is B: check in code that each quoted span appears word for word in the cited source.

A string match against the source is a check that does not share the model's failure modes, and it costs microseconds. Asking the model invites sycophantic or confident confirmation. Temperature and model size reduce the rate, but do not detect individual fabrications.

## 5

You compare two prompts using an LLM judge that sees answer A, then answer B. A wins 64 percent of the time. What should you do before trusting that result?

A, raise the judge's temperature and average several runs to smooth out noise. B, replace the judge with a public benchmark, which is far less biased than a judge. C, nothing more; a 64 percent win rate across many comparisons is already a clear result. D, re-run with the order swapped, and check agreement with human labels on a sample.

[think]

The answer is D: re-run with the order swapped, and check agreement with human labels on a sample.

LLM judges show position bias and verbosity bias, so a modest win can be an artefact. If A wins only 46 percent when shown second, the rate averaged over both orders is 55 percent. Swapping positions and calibrating against human judgements tells you whether the preference is real. Public benchmarks do not measure your task, and averaging noisy runs does not remove a systematic bias.

## 6

An agent completes tasks of 20 steps, and each step succeeds independently 95 percent of the time. Roughly how often does a whole task succeed, and what raises it most?

A, about 36 percent; checking and retrying each step lifts it to about 90 percent. B, about 5 percent; the task is too long to be made reliable at any cost. C, about 50 percent; a larger model is the only way to raise it much further. D, about 95 percent; per-step reliability carries over to the whole task.

[think]

The answer is A: about 36 percent, and checking and retrying each step lifts it to about 90.

Independent steps multiply: 0.95 to the power 20 is about 0.358. If a check catches 90 percent of step errors and the step is retried, a step fails only with probability 0.005, and 0.995 to the power 20 is about 0.905. Verifying each step changes the arithmetic far more than a slightly better model does.

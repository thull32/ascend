---
lesson: generation-and-sampling
source: ce8dea15ef7d9c70
fit: great
desk:
  - "The softmax and temperature tables, worked on the logits 2, 1 and 0.1 and on the France vector"
  - "Top-k, top-p and min-p applied to one logit vector, and the uniform draw that picks the token"
  - "The generation loop code, and the sampler under the hood, including the Gumbel-max trick"
  - "The strategy comparison table"
  - "Exercises: softmax with temperature, and top-p filtering"
---
## Introduction

At the end of every forward pass, a language model produces a score for every token in its vocabulary, 100 thousand or more of them, for the next position. That is not text. Something has to turn those scores into one token, append it, run the model again, and decide when to stop.

That something is the decoding strategy, and it changes the quality, variety, repeatability and cost of the output as much as the wording of the prompt does. It is why the same prompt gives different answers on two runs, why a JSON response sometimes arrives cut off, and why your "deterministic" regression test fails on Tuesdays.

Three ideas, then. How scores become a token, and what temperature and top-p actually do. How a generation stops, and how your code must know why. And why temperature zero is still not reproducible.

## The loop, and why output is expensive

Generation is a loop. Run a forward pass, take the scores at the last position, choose a token, append it, go round again.

Two consequences shape everything about cost and latency. The prompt can be processed in one parallel pass, but output tokens come strictly one after another, each needing its own pass through the whole model. So output tokens are slower, and usually priced several times higher than input tokens. And re-running the model over the whole growing sequence every time would be wasteful; the key-value cache avoids that, and it gets its own lesson.

The choosing step is the decoding strategy. The rest is about what to put there.

## From scores to probabilities

The raw scores are called logits, and they can be any real number. The softmax turns them into probabilities: raise e to each score, then divide by the total, so they are all positive and sum to one.

Here is the example to carry through. After "The capital of France is", the top candidates are Paris, "a", "the", Lyon, "not" and "famous". The softmax gives Paris about 77 percent, "a" about 9, "the" about 6, Lyon about 4, and the last two a couple of percent each. Notice what the exponential does: a gap of 2.1 in the scores between Paris and "a" became a ratio of about eight in probability.

The simplest strategy is greedy: always take the most likely token. For short, tightly specified outputs, a classification label, an extracted field, a tool argument, it is usually what you want.

For longer text it has two problems. It loops: once a phrase becomes likely, repeating it makes it more likely, and greedy never escapes. And the best token at each step does not give the best sequence. Picture two steps. Token A has probability one half, B has 0.4. After A, the model is unsure, and the best follow-up is only 0.4. After B, the best follow-up is 0.9. Greedy takes A, for a sequence probability of 0.2. B then its follow-up would have been 0.36. Greedy never sees it, because it committed at step one.

Beam search fixes that by keeping the few best partial sequences at every step instead of one. It has its own bias, towards stopping early, because every extra token multiplies in a probability below one. A two-token "OK" can beat a six-token answer whose every token was more confident. So implementations divide by the length. Beam search is standard in translation and speech recognition, where there is roughly one right answer. Chat assistants rarely use it: it favours bland text, multiplies compute, and cannot stream until the beams agree.

## Temperature and truncation

Sampling draws the next token at random, according to its probability. Temperature reshapes the distribution first, by dividing every score by the temperature. Below one, the gaps stretch and the distribution gets sharper. Above one, the gaps shrink and it gets flatter.

On the France example, temperature one half takes Paris from 77 percent to over 97. Temperature two drops it to 46, and "famous" climbs from under 2 percent to almost 7. As temperature goes to zero, sampling becomes greedy, which is how APIs treat temperature zero. Here is the sentence to remember: temperature does not add knowledge or remove it. It only decides how often the model says something other than its first choice.

Pure temperature sampling has a subtle flaw. A vocabulary of 100 thousand tokens has an enormous tail of individually unlikely tokens that together can hold a few percent of the probability. Say 3 percent per step. Over a 500-token answer, that is about 15 tail tokens drawn. Before I give you the next number: what are the odds of getting through even 100 tokens without one?

[pause]

About 5 percent. And one bad token can derail everything after it. So samplers truncate the tail before drawing.

Top-k keeps a fixed number of candidates. Top-p keeps the smallest set whose probability adds up to p. On the France example with p at 0.9: Paris, then "a", then "the" bring the total to about 92 percent, so those three survive and are rescaled to sum to one. Lyon, a plausible-sounding wrong answer, can no longer be drawn. Min-p keeps every token with at least some fraction of the top token's probability, say a tenth.

Two things fall out. Temperature and top-p interact: flatten to temperature 1.5 and top-p needs four tokens, and Lyon is back in. And fixed rules misfit. At temperature two, top-k of two would throw away 38 percent of the probability, while min-p keeps all six, because each is within a factor of ten of the leader. A fixed k is too tight when many continuations are good and too loose when one dominates. That is the argument for adaptive rules.

The draw itself is simple: pick a uniform random number between zero and one, and walk the running total until it passes that number. The usual order is temperature, then truncation, then the draw. Providers expose different subsets of these knobs, and some have withdrawn them: at the time the lesson was written, Anthropic's reference says models after Claude Opus 4.6 reject any temperature other than one, and no longer let you set top-p or top-k. Read your provider's documentation rather than assuming.

## Penalties, stopping and constraints

Frequency and presence penalties lower the scores of tokens that have already appeared. They break loops in long prose. They harm structured output, where every JSON key and closing brace is a legitimate repeat, so leave them off there.

A generation ends for one of three reasons. The model emits its end-of-turn token: it decided it was done. A stop sequence you supplied appears in the decoded text. Or the maximum-token cap is reached, and the output is truncated, possibly mid-sentence or mid-JSON-object.

APIs report which one happened, as a finish reason. Always check it. Parsing a response that stopped on the token limit as though it were complete is a classic production bug: parsing fails only for long documents. The cap is also a latency control. At 50 tokens a second, a 2,000-token cap bounds a response at about 40 seconds. Streaming does not make generation faster, but a response that starts in 300 milliseconds feels far quicker than one that appears complete after 8 seconds.

Constrained decoding goes further. If the output must be valid JSON for a schema, or one of a fixed set of labels, the sampler can enforce it: at each step it works out which tokens are legal and sets every other score to minus infinity.

The lesson traces a label field that must be refund, cancel or other. Unconstrained, the model puts half its probability on "Refund" with a capital R, which is not a legal value. The mask keeps the three legal tokens and rescales: lowercase refund ends up near two thirds, cancel near a third. The output is guaranteed to parse. But half the model's probability was on an answer the schema forbade, and it was redistributed. That is the limit to remember: constraints guarantee syntax, never correctness, and a schema that fights how the model wants to answer can lower quality.

## Why temperature zero still varies

Greedy decoding is deterministic on paper. In production, the same prompt at temperature zero can still produce different outputs.

The main reason is floating-point arithmetic. Addition is not associative: adding 0.1 and 0.2 first and then 0.3 gives a hair over 0.6, while adding 0.2 and 0.3 first gives exactly 0.6. Inference servers batch your request with other people's, and the batch size changes which GPU kernels run and in what order sums are reduced. Thinking Machines traced most endpoint nondeterminism to exactly this lack of batch invariance, not to concurrency as such.

So the logits differ in their last bits. When the top two tokens are nearly tied, the winner flips, and every token after the flip is different. Add model updates behind a version alias, and exact reproducibility is off the table for most hosted APIs. Seeds do not save you either: providers describe them as best effort.

The consequences: never assert on exact output strings in tests. Evaluate structure and meaning instead, pin model versions explicitly, and log prompts and outputs so you can replay what happened.

## In the interview

A follow-up the lesson expects. How would you make an LLM feature's tests reliable?

[pause]

Do not assert exact strings. Assert on parsed structure, allowed values and semantic checks. Use constrained decoding for machine-read outputs, pin model versions, and run a small eval set with a pass-rate threshold rather than a single sample. The common wrong answer is "set temperature zero and a seed", which does not survive batched GPU inference.

And the other classic: why is greedy decoding not the most probable output? Because it maximises each step, not the product. A token that is second best now can lead to a much more certain continuation: 0.4 times 0.9 beats one half times 0.4. Beam search approximates the best sequence, and needs length normalisation or it prefers short outputs. The wrong answer is "greedy is optimal because it always picks the best token".

## Recap

Four things to remember. Output tokens are produced one at a time, which is why they are slower and cost more. Temperature only rescales the scores; truncation with top-p or min-p removes the tail that derails long outputs, and the adaptive rules beat a fixed k. Always check the finish reason, because a response cut off by the token cap looks complete until you parse it. And constrained decoding guarantees syntax, not correctness, while temperature zero is not reproducible on batched GPUs, so tests assert on structure and meaning.

At your desk: the temperature and truncation tables on the France vector, the generation loop and the sampler internals, the strategy table, and the two exercises.

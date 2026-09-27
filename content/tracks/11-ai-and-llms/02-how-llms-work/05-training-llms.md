---
slug: training-llms
title: "Training LLMs: pretraining, fine-tuning, RLHF and scaling laws"
description: The pipeline that turns a randomly initialised transformer into an assistant, with the numbers behind it (cross-entropy, 6ND compute, LoRA parameter counts, the reward-model loss), and how each stage explains a behaviour you will see in production.
minutes: 22
difficulty: hard
tags: [llm, pretraining, fine-tuning, lora, rlhf, dpo, scaling-laws]
problems: []
---
Take two models with the identical architecture and the identical number of parameters. Ask each "What is the capital of France?". The first replies "What is the capital of Germany? What is the capital of Italy? What is the capital of Spain?", because on the web, a line like yours is usually followed by more lines like it. The second replies "Paris." Nothing about the network differs; the difference is entirely in how it was trained.

The training pipeline is worth knowing in detail even if you will never train a large model, because almost every behaviour you meet when building on one traces back to a specific stage: the knowledge cutoff, confident fabrication, the tendency to agree with the user, refusals of harmless requests, and why "just fine-tune it on our docs" so often disappoints. This lesson walks the pipeline in order: pretraining, supervised fine-tuning, preference optimisation, and reinforcement learning on verifiable tasks.

## Stage 1: pretraining

**The objective is next-token prediction.** Feed the model a document, and at every position score its predicted distribution against the token that actually came next with cross-entropy, $-\ln p(\text{correct token})$, exactly the loss from [Neural networks](/learn/ai-and-llms/ml-foundations/neural-networks):

- the model gives the right token probability 0.25: loss $= -\ln 0.25 = 1.386$
- probability 0.9: loss $= 0.105$
- probability 0.01: loss $= 4.6$

Averaged over trillions of tokens, that single number is what pretraining drives down. It is often reported as **perplexity**, $e^{\text{loss}}$: a loss of 1.386 is a perplexity of 4, meaning the model is on average as uncertain as if it were choosing uniformly among 4 tokens.

Why does predicting the next token teach so much? Because doing it well on diverse text *requires* everything else. To predict the next token of a physics derivation you need the physics; of a Python file, the semantics of the code; of a contract, the legal structure; of a mystery novel's last chapter, who did it. The model is pushed to build internal representations of grammar, facts, code behaviour and patterns of reasoning, because they reduce the loss.

**Data is the dominant lever.** Pretraining corpora are assembled from web crawls, code repositories, books, papers and other sources, then filtered heavily: deduplication (repeated text wastes compute and encourages memorisation), quality classifiers, removal of personal data and toxic content, and deliberate mixture weights (code and mathematics are often upsampled because they improve reasoning broadly). The provenance and licensing of training data is an active legal and policy debate, and the details of each lab's mix are not public.

Because the data was collected up to some date, the model's knowledge is frozen there: the **knowledge cutoff**. Anything later exists for the model only if you put it in the context.

**Compute is estimated with one formula.** Training costs about $6ND$ floating-point operations, for $N$ parameters and $D$ training tokens: 2 per parameter per token for the forward pass and 4 for the backward pass. Work it for a 7B-parameter model trained on 2 trillion tokens:

$$6 \times (7 \times 10^9) \times (2 \times 10^{12}) = 8.4 \times 10^{22} \text{ FLOPs}$$

A current data-centre accelerator peaks at around $10^{15}$ 16-bit FLOP/s, and real training runs sustain perhaps 40% of peak, so about $4 \times 10^{14}$ per GPU. That gives $2.1 \times 10^8$ GPU-seconds, about 58,000 GPU-hours: a thousand GPUs for two and a half days. Frontier models are orders of magnitude larger in both $N$ and $D$.

**Memory forces parallelism.** Training with Adam in mixed precision needs about 16 bytes per parameter (16-bit weights and gradients, plus 32-bit master weights and Adam's two moment estimates), so 7B parameters need about 112 GB before activations, more than one GPU holds. Training is therefore spread across devices in several ways at once: **data parallelism** (each GPU processes different examples and gradients are averaged), **sharded optimiser state** (each GPU stores only a slice of the weights, gradients and Adam state), **tensor parallelism** (individual matrix multiplications split across the GPUs in a server), and **pipeline parallelism** (consecutive layers on different servers). At thousands of GPUs, hardware failures are routine events rather than incidents, so frequent checkpointing and automatic restart are part of the design.

### Scaling laws

Across many orders of magnitude, pretraining loss falls as a smooth **power law** in model size, data and compute. The curves are regular enough that labs fit them on small runs and extrapolate to choose the size and data budget of a run costing a thousand times more.

For a fixed compute budget, there is an optimal balance between parameters and tokens. An influential 2022 study (the "Chinchilla" paper) put it at roughly **20 training tokens per parameter**: about 140 billion tokens for a 7B model. Yet current small models are routinely trained on trillions of tokens, far past that point. The reason is economic, and it is a senior-level insight: the compute-optimal recipe minimises *training* cost for a given quality, but training is paid once and **inference is paid on every request, forever, in proportion to parameter count**. Overtraining a smaller model costs more up front and buys cheaper serving at the same quality.

### The base model

The output of pretraining is a **base model**: an extremely capable document continuer with no notion of "you are an assistant". It will continue a question with more questions if that is what documents usually do. You could coax it with formats such as `Q: ... A:` and a few examples (**few-shot prompting** was how early models were used), but it will not reliably follow instructions, stop at the right place, or decline harmful requests. Everything after pretraining, collectively called **post-training**, is about shaping behaviour, not adding much knowledge.

## Stage 2: supervised fine-tuning

**Supervised fine-tuning** (SFT) continues training on examples of the desired behaviour: prompts paired with ideal responses, rendered in the model's chat template. The loss is computed only on the response tokens; the prompt tokens are masked out, so the model learns to answer rather than to write prompts. Datasets range from tens of thousands to millions of examples, written by people or generated by models and filtered, and quality matters far more than quantity. SFT teaches the turn-taking format, following instructions, the assistant's tone, the syntax for tool calls, and when to decline.

You can fine-tune open-weight models yourself, and some providers offer fine-tuning of hosted models. Updating all 7 billion weights needs the full training-memory budget above. **LoRA** (low-rank adaptation) avoids that: freeze the original weight matrix $W$ and learn a low-rank correction, $W' = W + BA$, where $B$ is $d \times r$ and $A$ is $r \times d$ for a small rank $r$. For one $4{,}096 \times 4{,}096$ matrix with $r = 8$, the adapter has $2 \times 4{,}096 \times 8 = 65{,}536$ trainable parameters instead of 16.8 million, 0.4% of the matrix. Optimiser state is needed only for the adapters, so a 7B model can be fine-tuned on a single GPU, and one base model can serve many customers' adapters, swapped per request or merged into the weights.

```viz
{"type": "ml", "algorithm": "fine-tuning", "steps": 4,
 "title": "Supervised fine-tuning with LoRA adapters",
 "caption": "The base weights stay frozen; only the small adapters train. Watch the eval loss turn upward after epoch 3 while the training loss keeps falling."}
```

The visualisation shows the failure mode you will meet first: on a small dataset, eval loss turns up within a few epochs while training loss keeps falling. That is ordinary overfitting from [Training and generalisation](/learn/ai-and-llms/ml-foundations/training-and-generalisation), and the fix is the same: a held-out set and early stopping.

**What fine-tuning is good at, and what it is not.** It is good at *form*: output format, tone, a narrow task done consistently, a shorter prompt (instructions baked into weights), or a small model imitating a large one on a specific task to cut cost and latency. It is poor at reliably adding *facts*. A model fine-tuned on your internal wiki learns to sound like your wiki, but facts seen a handful of times in fine-tuning are recalled unreliably, the model can become more willing to state plausible-sounding details it does not actually know, and the facts go stale the moment the wiki changes. For knowledge, put it in the context with retrieval; see [Retrieval-augmented generation](/learn/ai-and-llms/building-with-llms/retrieval-augmented-generation).

## Stage 3: preference optimisation

SFT imitates demonstrations, and demonstrations have a ceiling. For most prompts there are many acceptable answers, and people are far better and more consistent at *comparing* two answers than at writing the ideal one. Preference optimisation exploits that.

**Reinforcement learning from human feedback** (RLHF) has two steps. First, sample two responses to the same prompt, ask a person which is better, and repeat many thousands of times. Train a **reward model** $r(\text{prompt}, \text{response})$ to agree with those judgements using the Bradley–Terry loss:

$$L = -\ln \sigma(r_{\text{preferred}} - r_{\text{rejected}})$$

If the reward model scores the preferred answer 1.8 and the rejected one 0.6, then $\sigma(1.2) = 0.769$ and the loss is 0.263. If it had them the wrong way round (0.6 against 1.8), $\sigma(-1.2) = 0.231$ and the loss is 1.463: a strong push to fix the ranking.

Second, optimise the model (now called the **policy**) with reinforcement learning, classically PPO: generate responses, score them with the reward model, and update the policy to make high-scoring responses more likely. The objective includes a penalty on the KL divergence from the SFT model, $r - \beta \cdot \text{KL}$, which keeps the policy close to fluent, sensible text.

```viz
{"type": "ml", "algorithm": "rlhf",
 "title": "RLHF: preferences, reward model, policy update",
 "caption": "Pairwise human preferences train a reward model; the policy is optimised against it with a KL penalty that keeps it near the supervised model."}
```

The KL penalty is there because of **reward hacking**. The reward model is only a learned proxy for human judgement, and an optimiser pushed hard against a proxy finds its blind spots. If raters mildly preferred longer answers, the policy learns to pad. If raters liked being agreed with, the policy learns **sycophancy**: telling users their flawed plan is excellent. If safety data rewarded caution, the policy may **over-refuse** harmless requests that look superficially like harmful ones. These are recognisable production behaviours, and knowing where they come from tells you how to prompt around them: phrase questions neutrally, ask explicitly for criticism, and give context that makes a benign request's intent clear.

**Direct preference optimisation** (DPO) reaches a similar result with less machinery. It skips the separate reward model and the RL loop, and optimises the policy directly on preference pairs with a classification-style loss that raises the relative likelihood of preferred responses (again anchored to a reference model). It is simpler and more stable to run, and widely used. Other variations replace some human labels with **AI feedback**: a model judges pairs of responses against a written set of principles, which scales labelling and makes the target behaviour explicit.

## Stage 4: reinforcement learning on verifiable tasks

For some domains the reward does not need a learned proxy at all: a maths problem has a known answer, and code either passes its tests or does not. Training with reinforcement learning against such **verifiable rewards** has produced models that write long chains of intermediate reasoning before answering, and learn to decompose problems, check their work and backtrack. These are the "reasoning" or "thinking" modes of current model families.

The practical consequence is **test-time compute**: these models get better answers on hard problems by generating more tokens before answering. Those tokens cost money and time, so thinking budgets are a knob to set per task: generous for a tricky migration plan, zero for classifying a support ticket. Two honest caveats. The visible reasoning is not guaranteed to be a faithful account of how the model reached its answer. And the gains are largest in domains like maths and code, where training rewards could be checked automatically.

**Distillation** closes the loop: a small model is trained on the outputs (or full probability distributions) of a large one, which is a common way that small, fast models become good at specific jobs. Check the provider's terms before training on a hosted model's outputs.

## From pipeline to production behaviour

| What you observe | Where it comes from | What you do |
|---|---|---|
| Does not know recent events or your internal data | Pretraining data and cutoff | Supply it in context: retrieval, tools |
| Confident, fluent fabrication | Pretraining rewards plausible continuations; preference data often favoured confident answers | Grounding, permission to say "I don't know", verification ([Capabilities and failure modes](/learn/ai-and-llms/how-llms-work/capabilities-and-failure-modes)) |
| Follows your requested format | SFT | Show examples in the prompt; fine-tune only if prompting is not enough |
| Agrees with a wrong premise | Preference optimisation (sycophancy) | Neutral phrasing, explicitly ask for disagreement |
| Refuses a benign request | Safety training generalising too broadly | Add legitimate context, adjust the request |
| Better on hard problems when it thinks first | RL on verifiable rewards | Budget thinking tokens where accuracy is worth the cost |

The build ladder follows from the same table: **prompt first, then retrieval for knowledge, then fine-tuning for form**, and only when an eval shows the previous rung is not enough. Each rung costs more to build and maintain than the one before.

## Senior signals

- You estimate training compute with **$6ND$** and memory with about **16 bytes per parameter** for Adam, and you know why inference economics push labs to train small models far past the compute-optimal point.
- You attribute behaviours to **pipeline stages**: knowledge to pretraining, format to SFT, sycophancy and over-refusal to preference optimisation, long reasoning to RL on verifiable rewards.
- You reach for **fine-tuning for form and retrieval for facts**, and you can explain why fine-tuning on documents is an unreliable way to add knowledge.
- You know **LoRA** makes fine-tuning cheap by training a low-rank update, and you watch eval loss for the overfitting that small fine-tuning sets produce within a few epochs.
- You recognise **reward hacking** in the wild (verbosity, flattery) and prompt around it.
- You treat **thinking tokens as a per-task budget**, not a default.

## Check yourself

```quiz
- q: >-
    Using the 6ND rule, roughly how many FLOPs does it take to train a 7-billion-parameter model on 2 trillion tokens?
  options: ["About 1.4 × 10^13", "About 8.4 × 10^22", "About 8.4 × 10^31", "About 2.8 × 10^16"]
  answer: 1
  explanation: >-
    6 × 7 × 10^9 × 2 × 10^12 = 8.4 × 10^22. The 6 is 2 FLOPs per parameter per token forward plus 4 backward. 1.4 × 10^13 is closer to one forward pass over a single token for a model of this size.
- q: >-
    Your team wants the assistant to answer questions about 3,000 internal wiki pages that change weekly. A colleague proposes fine-tuning on the pages. What is the stronger design?
  options: ["Fine-tune weekly; fine-tuning is the standard way to add knowledge", "Pretrain a new model on the wiki", "Retrieve relevant pages at query time and put them in the context; use fine-tuning, if at all, for format and tone", "Increase the temperature so the model explores more of its knowledge"]
  answer: 2
  explanation: >-
    Facts seen a few times in fine-tuning are recalled unreliably and go stale when pages change, while retrieval supplies current text and makes answers checkable. Fine-tuning is well suited to form, not facts. Pretraining is vastly more expensive, and temperature does not add knowledge.
- q: >-
    A reward model scores the human-preferred answer 0.6 and the rejected answer 1.8. What is its Bradley–Terry loss on this pair, and what does training do?
  options: ["About 1.46; gradients push the preferred score up and the rejected score down", "0.263; nothing, since the loss is small", "0; reward models are trained only on absolute scores", "1.2; the loss is the score difference"]
  answer: 0
  explanation: >-
    The loss is −ln σ(0.6 − 1.8) = −ln σ(−1.2) = −ln 0.231 ≈ 1.46, large because the ranking is wrong. Its gradient raises the preferred response's score relative to the rejected one. 0.263 is the loss when the ranking is correct (1.8 versus 0.6).
- q: >-
    Why does RLHF include a KL penalty that keeps the policy close to the supervised model?
  options: ["To reduce the size of the model", "To make generation deterministic", "Because KL divergence measures factual accuracy", "Because the reward model is an imperfect proxy, and unconstrained optimisation exploits its blind spots (reward hacking), drifting into text it scores highly but people do not want"]
  answer: 3
  explanation: >-
    Pushing hard on a learned reward finds its flaws, such as padding or flattery that the reward model happens to like. The KL term limits how far the policy can move from sensible, fluent behaviour. It has nothing to do with model size, determinism or factual accuracy.
- q: >-
    Scaling-law work suggests about 20 tokens per parameter is compute-optimal, yet small open models are often trained on over 100 tokens per parameter. Why?
  options: ["The scaling laws were wrong", "Training is paid once while inference cost scales with parameter count on every request, so overtraining a smaller model buys cheaper serving at similar quality", "Larger datasets are required for tokenization", "Overtraining prevents hallucination"]
  answer: 1
  explanation: >-
    Compute-optimal means best quality for a given training budget. If a model will serve billions of requests, it is cheaper overall to spend more training compute on a smaller model, since every inference is proportional to its size. Overtraining does not eliminate hallucination.
```

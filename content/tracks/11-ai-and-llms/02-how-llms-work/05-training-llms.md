---
slug: training-llms
title: "Training LLMs: pretraining, fine-tuning, RLHF and scaling laws"
description: The pipeline that turns a randomly initialised transformer into an assistant, worked with numbers at every stage (6ND compute converted to GPU-hours for a 7B and a 70B run, a data mixture in epochs, a loss-masked SFT example, the Bradley–Terry and KL-shaped RLHF rewards, the DPO loss and its gradient on one preference pair, group-relative advantages), how the work is spread across thousands of GPUs, and how each stage explains a behaviour you will see in production.
minutes: 55
difficulty: hard
tags: [llm, pretraining, fine-tuning, lora, rlhf, dpo, scaling-laws]
problems: []
---
Take two models with the identical architecture and the identical number of parameters. Ask each "What is the capital of France?". The first replies "What is the capital of Germany? What is the capital of Italy? What is the capital of Spain?", because on the web, a line like yours is usually followed by more lines like it. The second replies "Paris." Nothing about the network differs; the difference is entirely in how it was trained.

The training pipeline is worth knowing in detail even if you will never train a large model, because almost every behaviour you meet when building on one traces back to a specific stage: the knowledge cutoff, confident fabrication, the tendency to agree with the user, refusals of harmless requests, and why "fine-tune it on our docs" so often disappoints. This lesson walks the pipeline in order (pretraining, supervised fine-tuning, preference optimisation, reinforcement learning on verifiable tasks) and computes the number that governs each stage.

## Stage 1: the pretraining objective

**The objective is next-token prediction.** Feed the model a document, and at every position score its predicted distribution against the token that actually came next with cross-entropy, $-\ln p(\text{correct token})$, the loss from [Neural networks](/learn/ai-and-llms/ml-foundations/neural-networks):

- the model gives the right token probability 0.25: loss $= -\ln 0.25 = 1.386$
- probability 0.9: loss $= 0.105$
- probability 0.01: loss $= 4.6$

Averaged over trillions of tokens, that single number is what pretraining drives down. It is often reported as **perplexity**, $e^{\text{loss}}$: a loss of 1.386 is a perplexity of 4, meaning the model is on average as uncertain as if it were choosing uniformly among 4 tokens.

Why does predicting the next token teach so much? Because doing it well on diverse text *requires* everything else. To predict the next token of a physics derivation you need the physics; of a Python file, the semantics of the code; of a contract, the legal structure; of a mystery novel's last chapter, who did it. The model is pushed to build internal representations of grammar, facts, code behaviour and patterns of reasoning, because they reduce the loss. One training sequence gives thousands of training signals at once: a 4,096-token document is 4,095 next-token predictions, all computed in one forward pass thanks to the causal mask described in [The transformer](/learn/ai-and-llms/how-llms-work/the-transformer).

## Pretraining data: deduplication, filtering, mixture

At about four bytes of English text per token ([Tokenization](/learn/ai-and-llms/how-llms-work/tokenization)), 15 trillion tokens is about 60 TB of clean text, distilled from a far larger raw crawl. The pipeline, in order:

1. **Extraction and language identification.** HTML becomes text; boilerplate (menus, cookie banners) is stripped; each document is tagged with its language.
2. **Deduplication.** Exact duplicates are removed by hashing; near-duplicates (the same article syndicated across fifty sites with different headers) by MinHash and locality-sensitive hashing, the technique in [MinHash and LSH](/learn/advanced-data-structures/probabilistic-structures/minhash-and-lsh). Repeated text wastes compute and raises memorisation: a passage seen a thousand times can be regurgitated verbatim.
3. **Filtering.** Quality classifiers (often small models trained to tell reference-quality text from spam), heuristics (symbol-to-word ratios, repeated lines), removal of personal data and toxic content, and removal of known benchmark test sets.
4. **Mixture.** Sources are sampled with deliberate weights, not in proportion to size.

The mixture is where the arithmetic matters. An illustrative mix for a 2-trillion-token budget:

| Source | Clean tokens available | Mixture weight | Tokens drawn | Epochs |
|---|---|---|---|---|
| Web | 1,600 B | 70% | 1,400 B | 0.88 |
| Code | 200 B | 15% | 300 B | 1.5 |
| Books and papers | 100 B | 8% | 160 B | 1.6 |
| Mathematics | 20 B | 5% | 100 B | 5.0 |
| Encyclopedic | 10 B | 2% | 40 B | 4.0 |

Upsampling a small, valuable source means repeating it. A 2023 study of data-constrained scaling found that repeating data up to about four epochs was almost as useful as fresh data, with fast-diminishing returns after that, so the maths row above is already past the useful range. Code and mathematics are commonly upsampled because they improve reasoning broadly; the exact mixes of commercial labs are not public, and the provenance and licensing of training data is an active legal and policy debate.

Because the data was collected up to some date, the model's knowledge is frozen there: the **knowledge cutoff**. Anything later exists for the model only if you put it in the context.

## Pretraining compute: 6ND, worked

Training costs about $C = 6ND$ floating-point operations, for $N$ parameters and $D$ training tokens. The 6 comes from the matrix multiplies. In the forward pass each weight takes part in one multiply-add per token: 2 FLOPs. The backward pass computes two gradients per weight: one with respect to the layer's input (to pass the error further back) and one with respect to the weight itself, each another multiply-add: 4 FLOPs. Attention adds a term that grows with context length: for a 7B-shaped model (32 layers, width 4,096) at a 4,096-token context it is about 8% on top of $6N$, at 32,768 tokens about 61%, which is why long-context training stages are short.

Two runs, converted to GPU time with explicit assumptions: a data-centre accelerator peaking near $10^{15}$ dense 16-bit FLOP/s (an order of magnitude for current hardware), sustaining 40% of peak (the **model FLOPs utilisation**, typically between 30% and 50% on large runs; it depends on the parallelism layout, network and kernel efficiency):

| Run | Tokens per parameter | $C = 6ND$ | GPU-hours at $4 \times 10^{14}$ FLOP/s | Wall clock |
|---|---|---|---|---|
| 7B on 2T tokens | 286 | $8.4 \times 10^{22}$ | 58,000 | 2.4 days on 1,024 GPUs |
| 70B on 15T tokens | 214 | $6.3 \times 10^{24}$ | 4.4 million | 11 days on 16,384 GPUs |

Sanity-check against published figures. On an older accelerator with a peak near $3 \times 10^{14}$ FLOP/s, the first row becomes about 190,000 GPU-hours, against the 184,320 A100 GPU-hours Meta reported for its 7B Llama 2 model trained on 2 trillion tokens; and the Llama 3 model card reports 6.4 million H100 GPU-hours for the 70B model trained on over 15 trillion tokens, against the second row's 4.4 million. The formula gets you within a factor of two, which is what planning needs. Frontier models are larger again in both $N$ and $D$.

## Under the hood: spreading a run across thousands of GPUs

**Memory forces sharding.** Adam in mixed precision needs about 16 bytes per parameter (derived in [What a model is](/learn/ai-and-llms/ml-foundations/what-a-model-is)), so 7B parameters need 112 GB before activations. **Sharded data parallelism** (ZeRO in DeepSpeed, FSDP in PyTorch) splits weights, gradients and optimiser state across the GPUs of a data-parallel group: over 8 GPUs, 14 GB each, gathering each layer's full weights immediately before computing it.

**Communication is the tax.** Plain data parallelism averages gradients after every step with an all-reduce; a ring all-reduce sends and receives about $2(n-1)/n$ times the gradient size per GPU, so 7B bf16 gradients (14 GB) cost each of 8 GPUs about 24.5 GB of traffic per step. That is why **tensor parallelism** (splitting individual matrix multiplies) stays inside one server, where GPUs share the fastest links, while slower data-parallel traffic crosses servers.

**Pipelines have bubbles.** **Pipeline parallelism** puts consecutive layers on different servers and streams micro-batches through them. With $p$ stages and $m$ micro-batches per step the idle fraction is $(p - 1)/(m + p - 1)$: 47% for 8 stages and 8 micro-batches, 18% with 32. Real layouts combine all three kinds of parallelism.

**Failures are routine.** If a GPU fails on average once every five years (an assumption for illustration), a 16,384-GPU cluster sees a failure every $43{,}800 / 16{,}384 \approx 2.7$ hours; Meta reported hundreds of unexpected interruptions over a roughly two-month stretch of its largest Llama 3 run. Runs therefore checkpoint frequently (a 7B checkpoint with optimiser state is about 112 GB), detect stragglers, and restart automatically.

## Scaling laws and deliberate over-training

Across many orders of magnitude, pretraining loss falls as a smooth **power law** in model size, data and compute. The curves are regular enough that labs fit them on small runs and extrapolate to choose the size and data budget of a run costing a thousand times more.

For a fixed compute budget there is an optimal balance between parameters and tokens. DeepMind's 2022 "Chinchilla" study put it at roughly **20 training tokens per parameter** (its 70B model was trained on 1.4 trillion tokens). Substitute $D = 20N$ into $C = 6ND$ and the compute-optimal size is $N = \sqrt{C/120}$: for the $8.4 \times 10^{22}$ budget above, about 26B parameters on 530B tokens. Yet the table's 7B model used that budget on 286 tokens per parameter, fourteen times past the optimum, and current small open models go further.

The reason is economic. Compute-optimal minimises *training* cost for a given quality, but training is paid once and **inference is paid on every token served, at about $2N$ FLOPs per token**. Serving the 7B model at a trillion tokens a month costs $2 \times 7 \times 10^9 \times 10^{12} = 1.4 \times 10^{22}$ FLOPs a month, so it overtakes the whole training bill in six months, and a 26B model would cost 3.8 times as much to serve, forever. Over-training a smaller model costs more up front for its quality and buys cheaper, faster serving; [Inference serving](/learn/ai-and-llms/how-llms-work/inference-serving) is where that saving is collected.

**The base model.** The output of pretraining is a **base model**: an extremely capable document continuer with no notion of "you are an assistant". It will continue a question with more questions if that is what documents usually do. Everything after pretraining, collectively called **post-training**, shapes behaviour; it adds little knowledge.

## Stage 2: supervised fine-tuning

**Supervised fine-tuning** (SFT) continues training on examples of the desired behaviour: prompts paired with ideal responses, rendered in the model's chat template. The loss is computed only on the response tokens. Trace it on one example with the model's probability for each actual next token:

| Token predicted | `What` | `is` | `2+2` | `?` | `<assistant>` | `4` | `.` | `<end>` |
|---|---|---|---|---|---|---|---|---|
| Model's probability | 0.05 | 0.3 | 0.1 | 0.4 | 0.75 | 0.6 | 0.9 | 0.8 |
| Loss $-\ln p$ | 2.996 | 1.204 | 2.303 | 0.916 | 0.288 | 0.511 | 0.105 | 0.223 |
| Mask | 0 | 0 | 0 | 0 | 0 | 1 | 1 | 1 |

The masked loss is the mean over the three response tokens, $(0.511 + 0.105 + 0.223)/3 = 0.280$. Without the mask it would be 1.068, and 90% of it would come from the prompt: the gradient would mostly teach the model to predict what users type. Note that `<end>` is inside the mask. That token is how the model learns to stop; mask it out and the fine-tuned model rambles past its answer.

Datasets range from tens of thousands to millions of examples, written by people or generated by models and filtered, and quality matters far more than quantity. SFT teaches the turn-taking format, following instructions, the assistant's tone, the syntax for tool calls ([Structured outputs and tool use](/learn/ai-and-llms/building-with-llms/structured-outputs-and-tool-use)), and when to decline.

## LoRA, and what fine-tuning is for

Updating all 7 billion weights needs the full 112 GB training budget. **LoRA** (low-rank adaptation) freezes the original weight matrix $W$ and learns a low-rank correction, $W' = W + BA$, where $B$ is $d \times r$ and $A$ is $r \times d$ for a small rank $r$. For one $4{,}096 \times 4{,}096$ matrix with $r = 8$, the adapter has $2 \times 4{,}096 \times 8 = 65{,}536$ trainable parameters instead of 16.8 million, 0.4% of the matrix. Applied to every linear layer of a 7B-shaped model (four attention projections and three MLP matrices of width 11,008, in 32 layers) it is about 20 million parameters, 0.3% of the model. Optimiser state is needed only for the adapters, so a 7B model can be fine-tuned on a single GPU, and one base model can serve many customers' adapters, swapped per request or merged into the weights.

```viz
{"type": "ml", "algorithm": "fine-tuning", "steps": 4,
 "title": "Supervised fine-tuning with LoRA adapters",
 "caption": "The base weights stay frozen; only the small adapters train. Watch the eval loss turn upward after epoch 3 while the training loss keeps falling."}
```

The visualisation shows the failure mode you will meet first: on a small dataset, eval loss turns up within a few epochs while training loss keeps falling. That is ordinary overfitting from [Training and generalisation](/learn/ai-and-llms/ml-foundations/training-and-generalisation), and the fix is the same: a held-out set and early stopping.

Fine-tuning is good at *form*: output format, tone, a narrow task done consistently, instructions baked into weights so the prompt gets shorter, or a small model imitating a large one on one task. It is poor at reliably adding *facts*. Facts seen a handful of times are recalled unreliably, the model can become more willing to state plausible details it does not know, and the facts go stale the moment the source changes. For knowledge, put it in the context with [Retrieval-augmented generation](/learn/ai-and-llms/building-with-llms/retrieval-augmented-generation).

## Stage 3: reward models and RLHF

SFT imitates demonstrations, and demonstrations have a ceiling. People are far better and more consistent at *comparing* two answers than at writing the ideal one. **Reinforcement learning from human feedback** (RLHF) exploits that in two steps.

First, sample two responses to the same prompt, ask a person which is better, repeat many thousands of times, and train a **reward model** $r(\text{prompt}, \text{response})$ with the Bradley–Terry loss:

$$L = -\ln \sigma(r_{\text{preferred}} - r_{\text{rejected}})$$

If the reward model scores the preferred answer 1.8 and the rejected one 0.6, then $\sigma(1.2) = 0.769$ and the loss is 0.263. The wrong way round (0.6 against 1.8), $\sigma(-1.2) = 0.231$ and the loss is 1.463: a strong push to fix the ranking.

Second, optimise the model (now the **policy** $\pi$) with reinforcement learning, classically PPO, against a reward shaped by a KL penalty towards the SFT reference model $\pi_{\text{ref}}$:

$$R = r(x, y) - \beta \sum_t \ln \frac{\pi(y_t)}{\pi_{\text{ref}}(y_t)}$$

Compare two responses with $\beta = 0.1$. An honest four-token answer scores 2.0 with the reward model, and its per-token log-ratios to the reference are 0.5, 0.2, 0.9 and 0.1, summing to 1.7: shaped reward $2.0 - 0.17 = 1.83$. A padded, flattering answer exploits the reward model and scores 2.6, but it is far from anything the reference would write, log-ratios summing to 9.0: shaped reward $2.6 - 0.9 = 1.70$. The penalty makes the honest answer win.

```viz
{"type": "ml", "algorithm": "rlhf",
 "title": "RLHF: preferences, reward model, policy update",
 "caption": "Pairwise human preferences train a reward model; the policy is optimised against it with a KL penalty that keeps it near the supervised model."}
```

The penalty exists because of **reward hacking**: the reward model is a learned proxy, and an optimiser pushed hard against a proxy finds its blind spots. If raters mildly preferred longer answers, the policy learns to pad; if they liked being agreed with, it learns **sycophancy**; if safety data rewarded caution, it may **over-refuse** harmless requests that look superficially like harmful ones.

## DPO, worked on one pair

**Direct preference optimisation** (DPO) skips the reward model and the RL loop. Its insight is that the KL-regularised objective has a closed-form optimum in which the reward is implied by the policy itself: $\hat{r}(y) = \beta \ln \frac{\pi(y)}{\pi_{\text{ref}}(y)}$. Put that implicit reward into the Bradley–Terry loss and you get a loss on log-probabilities alone:

$$L = -\ln \sigma\Big(\beta\big[(\ln \pi(y_c) - \ln \pi_{\text{ref}}(y_c)) - (\ln \pi(y_r) - \ln \pi_{\text{ref}}(y_r))\big]\Big)$$

where $y_c$ is the chosen response and $y_r$ the rejected one, and each $\ln \pi(y)$ is the sum of the response's token log-probabilities. One pair, $\beta = 0.1$:

1. Policy: $\ln \pi(y_c) = -12.0$, $\ln \pi(y_r) = -15.0$. Reference: $\ln \pi_{\text{ref}}(y_c) = -13.0$, $\ln \pi_{\text{ref}}(y_r) = -14.0$.
2. Log-ratios: chosen $-12 - (-13) = +1.0$ (the policy likes it more than the reference does); rejected $-15 - (-14) = -1.0$.
3. Implicit reward margin: $0.1 \times (1.0 - (-1.0)) = 0.2$.
4. $\sigma(0.2) = 0.550$, loss $= -\ln 0.550 = 0.598$. At the start of training the policy equals the reference, the margin is 0 and the loss is $\ln 2 = 0.693$.
5. Gradient: $\partial L/\partial \ln \pi(y_c) = -\beta(1 - \sigma) = -0.045$ and $\partial L/\partial \ln \pi(y_r) = +0.045$. Descent raises the chosen response's log-probability and lowers the rejected one's, equally.

The weight $1 - \sigma(\text{margin})$ makes the loss self-limiting: at margins of 1, 2 and 4 it is 0.27, 0.12 and 0.018, so pairs the model already separates stop contributing. The loss depends only on the *difference*, so both log-probabilities can fall as long as the rejected one falls faster (with $\beta = 0.2$, chosen $-14$ against $-13$ and rejected $-18$ against $-14$ still give a positive margin of 0.6), which is one way DPO-trained models drift from the reference. DPO is simpler and more stable to run than PPO and widely used. Variants replace some human labels with **AI feedback**: a model judges pairs against a written set of principles.

## Stage 4: reinforcement learning on verifiable tasks

For some domains the reward needs no learned proxy: a maths problem has a known answer, and code passes its tests or does not. Training against such **verifiable rewards** has produced models that write long chains of intermediate reasoning, decompose problems, check their work and backtrack: the "reasoning" or "thinking" modes of current model families.

A common recipe samples a group of answers per problem and scores each against the group. Four samples with rewards 1, 0, 0, 1 have mean 0.5 and standard deviation 0.5, so their **group-relative advantages** are $+1, -1, -1, +1$: the correct samples' tokens are made more likely and the wrong ones' less (one published variant is called GRPO). If all four are correct the advantages are all 0 and the problem teaches nothing; curricula therefore favour problems the model solves sometimes, not always or never.

The practical consequence is **test-time compute**: these models get better answers on hard problems by generating more tokens first, and those tokens cost money and time, so thinking budgets are a per-task knob. The visible reasoning is not guaranteed to be a faithful account of how the answer was reached, and gains are largest where rewards could be checked automatically. **Distillation** then trains small models on a large one's outputs; check a hosted provider's terms before training on its outputs.

## From pipeline to production behaviour

| What you observe | Where it comes from | What you do |
|---|---|---|
| Does not know recent events or your internal data | Pretraining data and cutoff | Supply it in context: retrieval, tools |
| Confident, fluent fabrication | Pretraining rewards plausible continuations; preference data often favoured confident answers | Grounding, permission to say "I don't know", verification ([Capabilities and failure modes](/learn/ai-and-llms/how-llms-work/capabilities-and-failure-modes)) |
| Follows your requested format | SFT | Show examples in the prompt; fine-tune only if prompting is not enough |
| Agrees with a wrong premise | Preference optimisation (sycophancy) | Neutral phrasing, explicitly ask for disagreement |
| Refuses a benign request | Safety training generalising too broadly | Add legitimate context, adjust the request |
| Better on hard problems when it thinks first | RL on verifiable rewards | Budget thinking tokens where accuracy is worth the cost |

## Choosing a post-training method

| Method | Data needed | Infrastructure | Stability | What it changes | Typical failure |
|---|---|---|---|---|---|
| SFT (full) | thousands to millions of demonstrations | full training memory (16 B/param) | high | format, tone, task behaviour | overfits small sets; forgets general skills |
| SFT with LoRA | same | one GPU for 7B-class | high | same, per adapter | capacity limits on large behaviour changes |
| RLHF with PPO | preference pairs, plus a reward model | four models in memory (policy, reference, reward, value) | fiddly | helpfulness, style, safety | reward hacking: length, flattery |
| DPO | preference pairs | two models (policy, reference) | high | same targets as RLHF | drift when both likelihoods fall; overfits pairs |
| RL on verifiable rewards | problems with checkable answers | sampling at scale plus verifiers | medium | multi-step reasoning | gaming the checker (tests that pass, wrong code) |

The build ladder follows: **prompt first, then retrieval for knowledge, then fine-tuning for form**, each only when an eval shows the previous rung is not enough.

## Failure modes

**A loss spike mid-run.** *Symptom:* the loss jumps and either recovers slowly or diverges. *Diagnosis:* the gradient-norm log shows a spike at that step; common causes are a pathological batch (long runs of repeated or corrupted tokens), a learning rate too high for the current phase, or 16-bit overflow. *Fix:* rewind to the last good checkpoint, skip the offending batches, lower the learning rate or tighten gradient clipping, and add data filters for the pattern.

**The fine-tuned model writes the user's next message, or never stops.** *Symptom:* answers continue with a fake "User:" turn or run to the length limit. *Diagnosis:* the loss mask was wrong: prompt tokens were trained on (90% of the loss in the example above), or the end-of-turn token was masked out. *Fix:* assert on the mask for a rendered example before training; the end token must be inside it.

**Answers grow longer every training round.** *Symptom:* reward rises steadily while human raters are indifferent and median response length has doubled. *Diagnosis:* reward hacking of a length bias in the reward model; plot reward against length. *Fix:* raise $\beta$, add a length penalty or length-controlled comparisons, refresh preference data on the current policy's outputs.

**A benchmark score that is too good.** *Symptom:* a large jump on one public benchmark with no matching gain on your own evals. *Diagnosis:* test items leaked into training data (contamination); check n-gram overlap between the benchmark and the corpus, and test on rephrased items. *Fix:* decontaminate, and keep private held-out evals ([Evals and observability](/learn/ai-and-llms/building-with-llms/evals-and-observability)).

**Fine-tuning made the model worse at everything else.** *Symptom:* the target task improved and general instruction following, safety or maths regressed. *Diagnosis:* catastrophic forgetting from too many epochs, too high a learning rate, or a narrow dataset. *Fix:* LoRA or lower learning rates, mix in general instruction data, and run a broad regression eval alongside the task eval.

## Exercises

```exercise
id: dpo-loss
title: The DPO loss on one preference pair
prompt: |
  Given the summed log-probabilities of a chosen and a rejected response
  under the policy (`policy_chosen`, `policy_rejected`) and under the frozen
  reference model (`ref_chosen`, `ref_rejected`), and the coefficient
  `beta`, return `[margin, loss]` where

      margin = beta * ((policy_chosen - ref_chosen) - (policy_rejected - ref_rejected))
      loss   = -ln(sigmoid(margin))

  Compute the loss stably: one hidden test has a margin of -800, where a
  naive exp overflows. Results are compared to 6 decimal places.
languages: [python, javascript]
entry: dpo_loss
starter:
  python: |
    import math

    def dpo_loss(policy_chosen, policy_rejected, ref_chosen, ref_rejected, beta):
        # your code here
        return [0.0, 0.0]
  javascript: |
    function dpo_loss(policy_chosen, policy_rejected, ref_chosen, ref_rejected, beta) {
      // your code here
      return [0, 0];
    }
tests:
  - args: [-12, -15, -13, -14, 0.1]
    expected: [0.2, 0.598139]
    label: the worked pair
  - args: [-10, -10, -10, -10, 0.5]
    expected: [0, 0.693147]
    label: policy equals reference, loss is ln 2
  - args: [-15, -12, -13, -14, 0.1]
    expected: [-0.4, 0.913015]
    label: the policy prefers the rejected answer
  - args: [-8, -20, -10, -12, 0.5]
    expected: [5, 0.006715]
    label: an already-separated pair contributes little
  - args: [-500, -10, -100, -410, 1.0]
    expected: [-800, 800]
    hidden: true
    label: a very wrong pair must not overflow
  - args: [-14, -18, -13, -14, 0.2]
    expected: [0.6, 0.437488]
    hidden: true
    label: both likelihoods fell but the rejected one fell faster
hints:
  - "Compute the two log-ratios (policy minus reference) first, then their difference times beta."
  - "-ln(sigmoid(m)) = ln(1 + e^(-m)); for negative m rewrite it as -m + ln(1 + e^m) so the exponent is never large and positive."
```

```exercise
id: masked-nll
title: Loss masking for supervised fine-tuning
prompt: |
  `probs[i]` is the probability the model gave to the actual token at
  position `i`, and `mask[i]` is 1 if that position is part of the response
  (trained on) and 0 if it is part of the prompt (ignored). Return the mean
  of `-ln(probs[i])` over the positions where `mask[i] == 1`. If no position
  is masked in, return 0. Results are compared to 6 decimal places.
languages: [python, javascript]
entry: masked_nll
starter:
  python: |
    import math

    def masked_nll(probs, mask):
        # your code here
        return 0.0
  javascript: |
    function masked_nll(probs, mask) {
      // your code here
      return 0;
    }
tests:
  - args: [[0.05, 0.3, 0.1, 0.4, 0.75, 0.6, 0.9, 0.8], [0, 0, 0, 0, 0, 1, 1, 1]]
    expected: 0.279777
    label: the worked SFT example
  - args: [[0.05, 0.3, 0.1, 0.4, 0.75, 0.6, 0.9, 0.8], [1, 1, 1, 1, 1, 1, 1, 1]]
    expected: 1.068199
    label: forgetting the mask lets the prompt dominate
  - args: [[1, 1], [1, 1]]
    expected: 0
    label: certain predictions cost nothing
  - args: [[0.5], [0]]
    expected: 0
    label: nothing masked in
  - args: [[0.25, 0.5], [1, 0]]
    expected: 1.386294
    hidden: true
  - args: [[0.1, 0.2, 0.3], [1, 1, 1]]
    expected: 1.705332
    hidden: true
hints:
  - "Sum -ln(p) only where the mask is 1, and count those positions."
  - "Divide by the count of masked-in positions, not by the sequence length."
```

## Interviewer follow-ups

**"Estimate the compute to train a 70B model on 15 trillion tokens, and how long it takes."** *Model answer:* $6ND = 6.3 \times 10^{24}$ FLOPs; at about $10^{15}$ peak and 40% utilisation, $4 \times 10^{14}$ FLOP/s per GPU, that is 4.4 million GPU-hours, about 11 days on 16,000 GPUs, plus time lost to failures and restarts. The 6 is 2 FLOPs forward and 4 backward per parameter per token. *Common wrong answer:* $2ND$, which counts only the forward pass and is three times too low.

**"Why train a 7B model on 2 trillion tokens when Chinchilla says 140 billion is compute-optimal?"** *Model answer:* compute-optimal minimises training cost for a quality level; serving costs about $2N$ FLOPs per token for the model's whole life, and at a trillion tokens a month serving overtakes training within six months, so a smaller, over-trained model is cheaper overall. *Common wrong answer:* "the scaling laws turned out to be wrong".

**"DPO or PPO?"** *Model answer:* DPO needs only the policy and a frozen reference, a supervised-style loss and no sampling loop, so it is cheaper and more stable; PPO with a reward model can train on fresh samples from the current policy and can optimise rewards that are not pairwise preferences, at the cost of four models in memory and fiddly tuning. Both need the KL anchor, explicit in PPO and built into DPO's $\beta$. *Common wrong answer:* "DPO does not need a reference model".

**"What goes wrong if you do not mask the prompt in SFT?"** *Model answer:* the prompt dominates the loss (90% in the example), so the model learns to generate user text, and it can start writing fake user turns; and if the end-of-turn token is masked out the model never learns to stop. *Common wrong answer:* "it only wastes a little compute".

**"How would you detect reward hacking?"** *Model answer:* track reward against human or held-out judge ratings, and against simple features (length, hedging, agreement with the user); a reward that rises while independent ratings stay flat, or that correlates with length, is the signal; raise $\beta$ or fix the reward data. *Common wrong answer:* "the reward went up, so the model got better".

## What mid-level engineers get wrong

- **Fine-tuning to add facts.** Facts learned from a few fine-tuning examples are recalled unreliably and go stale; retrieval is the tool.
- **Counting training compute as $2ND$.** The backward pass is twice the forward.
- **Treating compute-optimal as cost-optimal.** It ignores the serving bill, which usually dominates.
- **Budgeting fine-tuning memory as model size.** Full fine-tuning needs about 16 bytes per parameter; LoRA exists because of it.
- **Reading a rising reward as progress.** A learned reward is a proxy the optimiser will exploit.
- **Trusting public benchmark gains without a private eval.** Contamination inflates them.

## Senior signals

- You estimate training compute with **$6ND$** and convert it to GPU-hours with a stated utilisation, and memory with about **16 bytes per parameter** for Adam; you know why inference economics push labs to train small models far past the compute-optimal point.
- You attribute behaviours to **pipeline stages**: knowledge to pretraining, format to SFT, sycophancy and over-refusal to preference optimisation, long reasoning to RL on verifiable rewards.
- You can compute a **DPO loss** on a pair and explain its implicit reward, its self-limiting weight and why the reference model is needed.
- You reach for **fine-tuning for form and retrieval for facts**, with the loss mask and the end token checked before a run.
- You recognise **reward hacking** in the wild (verbosity, flattery) and prompt around it.
- You treat **thinking tokens as a per-task budget**, not a default.

## Check yourself

```quiz
- q: >-
    Using the 6ND rule, roughly how many FLOPs does it take to train a 7-billion-parameter model on 2 trillion tokens?
  options: ["About 2.8 × 10^16", "About 1.4 × 10^10", "About 8.4 × 10^22", "About 8.4 × 10^31"]
  answer: 2
  explanation: >-
    6 × 7 × 10^9 × 2 × 10^12 = 8.4 × 10^22. The 6 is 2 FLOPs per parameter per token forward plus 4 backward. 1.4 × 10^10 is one forward pass over a single token (2N), and 8.4 × 10^31 comes from multiplying the exponents instead of adding them.
- q: >-
    Your team wants the assistant to answer questions about 3,000 internal wiki pages that change weekly. A colleague proposes fine-tuning on the pages. What is the stronger design?
  options: ["Continue pretraining the base model on the wiki so the facts are learned deeply", "Fine-tune weekly on the changed pages, since fine-tuning is how you add knowledge", "Retrieve relevant pages at query time; fine-tune, if at all, only for format", "Fine-tune once on all pages, then raise the temperature so it recalls more of them"]
  answer: 2
  explanation: >-
    Facts seen a few times in fine-tuning are recalled unreliably and go stale when pages change, while retrieval supplies current text and makes answers checkable. Fine-tuning is well suited to form (format and tone), not facts. Continued pretraining is vastly more expensive and has the same staleness problem, and temperature does not add knowledge.
- q: >-
    A reward model scores the human-preferred answer 0.6 and the rejected answer 1.8. What is its Bradley–Terry loss on this pair, and what does training do?
  options: ["About 0.26; little changes, because the loss is already small for this pair", "About 1.46; training raises the preferred score relative to the rejected score", "1.2; training shrinks the gap, because the loss is the score difference", "0; nothing, because reward models are trained only on absolute scores"]
  answer: 1
  explanation: >-
    The loss is −ln σ(0.6 − 1.8) = −ln σ(−1.2) = −ln 0.231 ≈ 1.46, large because the ranking is wrong. Its gradient pushes the preferred response's score up and the rejected one's down. 0.263 is the loss when the ranking is correct (1.8 versus 0.6), and the loss is a function of the score difference, not the difference itself.
- q: >-
    In DPO with β = 0.1, the policy gives the chosen response log-probability −12 (reference −13) and the rejected one −15 (reference −14). What is the implicit reward margin and the loss?
  options: ["Margin 3.0, loss about 0.05, since the policy already prefers the chosen one", "Margin 0.2, loss about 0.60, and training widens the margin further", "Margin −0.2, loss about 0.80, since the chosen response is less likely", "Margin 0, loss about 0.69, since the two log-ratios cancel each other out"]
  answer: 1
  explanation: >-
    The log-ratios are +1 for the chosen response and −1 for the rejected one, so the margin is 0.1 × (1 − (−1)) = 0.2 and the loss is −ln σ(0.2) ≈ 0.598; the gradient raises the chosen log-probability and lowers the rejected one. A margin of 3.0 uses the raw policy gap and forgets both the reference and β; the log-ratios have opposite signs, so they add rather than cancel.
- q: >-
    Why does RLHF include a KL penalty that keeps the policy close to the supervised model?
  options: ["Because it makes generation more deterministic, so outputs stay consistent", "Because the reward model is an imperfect proxy that the policy would exploit", "Because it shrinks the policy's effective size, which makes RL training cheaper", "Because KL divergence from the SFT model measures loss of factual accuracy"]
  answer: 1
  explanation: >-
    Pushing hard on a learned reward finds its blind spots (reward hacking), such as padding or flattery that the reward model happens to like. In the worked example a hacked answer with reward 2.6 but a log-ratio sum of 9.0 scores 1.70 after the penalty, below an honest answer's 1.83. The penalty has nothing to do with model size or determinism, and KL measures distance between distributions, not factual accuracy.
- q: >-
    Scaling-law work suggests about 20 tokens per parameter is compute-optimal, yet small open models are often trained on over 100 tokens per parameter. Why?
  options: ["Because overtraining a small model sharply reduces its hallucination rate", "Because smaller models need more tokens per parameter to learn their tokenizer well", "Because training is paid once but serving cost scales with parameters per request", "Because later work showed the scaling laws were wrong about the optimal ratio"]
  answer: 2
  explanation: >-
    Compute-optimal means best quality for a given training budget; the scaling laws optimise a different cost. Serving costs about 2N FLOPs per token for the model's lifetime, so for a model that will serve trillions of tokens it is cheaper overall to spend more training compute on a smaller model. Overtraining does not eliminate hallucination.
```

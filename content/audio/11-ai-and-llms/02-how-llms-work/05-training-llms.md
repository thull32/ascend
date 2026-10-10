---
lesson: training-llms
source: 46041c167be7ebee
fit: partial
desk:
  - "The 6ND derivation and the GPU-hours table for the 7B and 70B runs"
  - "Parallelism arithmetic: sharded optimiser state, all-reduce traffic, pipeline bubbles"
  - "The loss-masked SFT example token by token, and the LoRA parameter counts"
  - "The Bradley-Terry loss, the KL-shaped reward, and the DPO loss and gradient worked on one pair"
  - "The data mixture table in epochs, and the post-training method comparison table"
  - "Exercises: the DPO loss on one pair, and loss masking for fine-tuning"
---
## Introduction

Take two models with the identical architecture and the identical number of parameters. Ask each one, "What is the capital of France?" The first replies with more questions: what is the capital of Germany, what is the capital of Italy. On the web, a line like yours is usually followed by more lines like it. The second replies "Paris." Nothing about the network differs. The difference is entirely in how it was trained.

You may never train a large model, but this pipeline is still worth knowing, because almost every behaviour you meet when building on one traces back to a specific stage. The knowledge cutoff. Confident fabrication. The tendency to agree with you. Refusing harmless requests. And why "fine-tune it on our docs" so often disappoints.

Four stages, in order. Pretraining, which builds the knowledge. Supervised fine-tuning, which teaches the format. Preference optimisation, which shapes the behaviour and brings its own failure. And reinforcement learning on tasks whose answers can be checked, which produces the reasoning modes. For each, the one number that governs it.

## Pretraining

The objective is next-token prediction. Feed the model a document, and at every position score its prediction against the token that actually came next. The loss is minus the log of the probability it gave the right token. Give the right token a probability of 0.9 and the loss is about 0.1. Give it 0.25 and the loss is about 1.4. Give it 0.01 and the loss is 4.6. Averaged over trillions of tokens, that single number is what pretraining drives down.

Why does something so simple teach so much? Because doing it well on diverse text requires everything else. To predict the next token of a physics derivation you need the physics. Of a Python file, what the code does. Of a mystery novel's last chapter, who did it. The model builds internal representations of grammar, facts and patterns of reasoning because they reduce the loss. And a 4 thousand token document gives about 4 thousand predictions in one pass.

The data is distilled from a far larger raw crawl: 15 trillion tokens is about 60 terabytes of clean text. The pipeline extracts text, removes duplicates, filters for quality, and removes personal data, toxic content and known benchmark test sets. Deduplication matters because repeated text wastes compute, and a passage seen a thousand times can be regurgitated word for word.

Then the mixture. Sources are sampled with deliberate weights, not in proportion to size, and code and mathematics are commonly upsampled because they improve reasoning broadly. Upsampling a small source means repeating it, and a 2023 study found that repeating data up to about four times was almost as useful as fresh data, with fast-diminishing returns after that.

One consequence you will meet every day. The data was collected up to some date, and the model's knowledge is frozen there: the knowledge cutoff. Anything later exists for the model only if you put it in the context.

## Compute and scaling laws

Here is the formula to carry around. Training costs about 6 times the parameters times the training tokens, in floating-point operations. Why 6? In the forward pass, each weight does one multiply and one add per token: 2 operations. The backward pass computes two gradients per weight, one to pass the error further back and one for the weight itself: 4 more. The common mistake is 2 times parameters times tokens, which counts only the forward pass and is three times too low.

Turn that into hardware with stated assumptions: an accelerator that peaks near 10 to the 15 operations a second, running at 40 percent of peak, which is typical for large runs. A 7 billion parameter model on 2 trillion tokens comes to about 58 thousand GPU-hours: two and a half days on a thousand GPUs. A 70 billion parameter model on 15 trillion tokens comes to about 4.4 million GPU-hours: 11 days on about 16 thousand GPUs.

Against published figures, Meta reported 6.4 million GPU-hours for its 70 billion parameter Llama 3, against our 4.4. Within a factor of two, which is what planning needs.

Two practical facts about runs that size. Training with the Adam optimiser needs about 16 bytes per parameter, 112 gigabytes for 7 billion parameters, so that state is sharded across GPUs. And failures are routine: if one GPU fails once every five years, a 16 thousand GPU cluster sees a failure about every two and a half hours.

Now scaling laws. Across many orders of magnitude, loss falls as a smooth power law in model size, data and compute, regular enough that labs fit the curves on small runs and extrapolate to a run costing a thousand times more. For a fixed compute budget there is an optimal balance, and DeepMind's 2022 Chinchilla study put it at roughly 20 training tokens per parameter.

So here is a puzzle. That 7 billion parameter model was trained on 286 tokens per parameter, fourteen times past the optimum. For the same compute budget, the optimal model would have had about 26 billion parameters. Why would anyone do that?

[pause]

Because compute-optimal minimises training cost, and training is paid once. Inference is paid on every token served, at about 2 operations per parameter per token. Serve the 7 billion parameter model at a trillion tokens a month, and serving overtakes the entire training bill within six months. The 26 billion parameter model would cost 3.8 times as much to serve, forever. Over-training a smaller model costs more up front for its quality, and buys cheaper, faster serving.

The output of all this is a base model: an extremely capable document continuer with no notion that it is an assistant. That is the model that answered your question with more questions. Everything after this, called post-training, shapes behaviour. It adds little knowledge.

## Supervised fine-tuning

Supervised fine-tuning continues training on examples of the behaviour you want: prompts paired with ideal responses, in the model's chat format. The crucial detail is that the loss is computed only on the response tokens. The prompt is masked out.

In the lesson's small example, a short question and a three-token answer, the masked loss is about 0.28. Without the mask it would be about 1.07, and 90 percent of it would come from the prompt. The training signal would mostly teach the model to predict what users type, and the fine-tuned model can start writing fake user turns. And the end-of-turn token must be inside the mask. That token is how the model learns to stop. Mask it out, and the model rambles past its answer.

Full fine-tuning of a 7 billion parameter model needs the whole 112 gigabyte training budget. LoRA, low-rank adaptation, avoids that. It freezes the original weights and learns a small correction alongside each matrix, built from two thin matrices. For one 4 thousand by 4 thousand matrix at rank 8, the correction has about 65 thousand trainable parameters instead of 16.8 million. Across the whole model it is about 20 million, 0.3 percent. Optimiser state is needed only for those, so a 7 billion parameter model can be fine-tuned on a single GPU, and one base model can serve many customers' adapters.

Now what fine-tuning is for. It is good at form: output format, tone, a narrow task done consistently, instructions baked in so the prompt gets shorter. It is poor at reliably adding facts. Facts seen a handful of times are recalled unreliably, the model can become more willing to state plausible details it does not know, and the facts go stale the moment the source changes. For knowledge, put it in the context with retrieval.

## Preferences, and the proxy problem

Demonstrations have a ceiling. People are far better and more consistent at comparing two answers than at writing the ideal one. Reinforcement learning from human feedback exploits that in two steps.

First, show people pairs of responses to the same prompt, ask which is better, thousands of times, and train a reward model to score responses so the preferred one scores higher. If it scores the preferred answer 1.8 and the rejected one 0.6, its loss is small, about 0.26. The wrong way round, the loss is about 1.46: a strong push to fix the ranking.

Second, optimise the model against that reward with reinforcement learning, classically PPO. But with a penalty for drifting away from the fine-tuned model it started from, called a KL penalty. Why would you hold it back?

[pause]

Because the reward model is a learned proxy, and an optimiser pushed hard against a proxy finds its blind spots. The lesson's example: an honest answer scores 2.0 and stays close to the reference model, so after the penalty it keeps 1.83. A padded, flattering answer fools the reward model into 2.6, but it is far from anything the reference would write, and after the penalty it drops to 1.70. The penalty makes the honest answer win.

This is reward hacking, and it explains behaviours you will see in production. If raters mildly preferred longer answers, the model learns to pad. If they liked being agreed with, it learns sycophancy. If safety data rewarded caution, it may over-refuse harmless requests that look superficially like harmful ones.

Direct preference optimisation, DPO, gets the same effect without a separate reward model or a reinforcement learning loop. The intuition: the reward is implied by the model itself, as how much more likely the model makes a response than the reference model does. The loss then pushes the chosen response's likelihood up and the rejected one's down, relative to the reference. It starts at about 0.69 when the model equals the reference, and it is self-limiting: pairs the model already separates well stop contributing. One catch: it depends only on the difference, so both likelihoods can fall as long as the rejected one falls faster, which is one way DPO-trained models drift. It needs just two models in memory against PPO's four, and it is simpler and more stable, so it is widely used.

## Reasoning, and the production map

For some tasks the reward needs no learned proxy at all. A maths problem has a known answer; code passes its tests or it does not. Training against these verifiable rewards has produced models that write long chains of intermediate reasoning, check their work and backtrack: the thinking modes of current model families.

A common recipe samples a group of answers per problem and scores each against the group. Four samples, two right and two wrong: the right ones are made more likely and the wrong ones less. If all four are right, there is nothing to learn from that problem, so curricula favour problems the model solves sometimes, not always or never.

The consequence for you is test-time compute. These models get better answers on hard problems by generating more tokens first, and those tokens cost money and time, so the thinking budget is a per-task knob. The visible reasoning is not guaranteed to be a faithful account of how the answer was reached.

Now the map from stage to behaviour. Missing recent events or your data: pretraining and the cutoff, so supply it in context. Fluent fabrication: pretraining rewards plausible continuations, and preference data often favoured confident answers. Following your format: fine-tuning. Agreeing with a wrong premise: preference optimisation. Refusing a benign request: safety training generalising too broadly. Doing better after thinking first: reinforcement learning on verifiable rewards.

And the build ladder that follows: prompt first, then retrieval for knowledge, then fine-tuning for form, each only when an evaluation shows the previous rung is not enough.

## In the interview

A follow-up the lesson expects. Why train a 7 billion parameter model on 2 trillion tokens when Chinchilla says 140 billion is compute-optimal?

[pause]

Compute-optimal minimises training cost for a level of quality. Serving costs about 2 operations per parameter per token for the model's whole life, and at a trillion tokens a month serving overtakes training within six months, so a smaller, over-trained model is cheaper overall. The wrong answer is "the scaling laws turned out to be wrong".

And one about detecting reward hacking. Track the reward against human or held-out judge ratings, and against simple features like length, hedging, and agreement with the user. A reward that rises while independent ratings stay flat, or that tracks length, is the signal. Raise the penalty or fix the reward data. The wrong answer: "the reward went up, so the model got better".

## Recap

Four things to remember. Training compute is 6 times parameters times tokens, 2 forward and 4 backward, and full training memory is about 16 bytes per parameter. Labs over-train small models on purpose, because serving is paid on every token, forever. Fine-tune for form and retrieve for facts, with the prompt masked out and the end token kept in. And a learned reward is a proxy the optimiser will exploit, which is where padding, sycophancy and over-refusal come from, and why the penalty towards the reference model exists in both PPO and DPO.

At your desk: the compute and GPU-hours arithmetic, the parallelism numbers, the masked fine-tuning example and LoRA counts, the reward and DPO derivations worked on one pair, and the two exercises.

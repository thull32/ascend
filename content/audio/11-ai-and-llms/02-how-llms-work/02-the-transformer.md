---
lesson: the-transformer
source: f52e2584cb921c7e
fit: partial
desk:
  - "Attention by hand: the three-token example in two dimensions, and the four-dimension version split into two heads"
  - "The causal self-attention code, and the scaled dot-product formula"
  - "The RoPE rotation table, and the LayerNorm and RMSNorm worked numbers"
  - "The parameter count that reproduces 6.74 billion, and the grouped-query count for the 70B shape"
  - "The online softmax traced across two tiles"
  - "Exercises: attention for one query, and counting a transformer's parameters"
---
## Introduction

To predict the next token of "The checkout service returned 503 because the database connection pool was", a model has to combine information from positions far apart: the 503, the database, the pool. And it has to do that for every position of every training document, trillions of times, so the work must run in parallel across positions.

The architectures before 2017, recurrent networks, read one token at a time and squeezed everything seen so far into one fixed-size state. They were slow to train, because each step waited for the one before. And they forgot: information from 500 tokens back had to survive 500 squeezes.

The transformer throws recurrence away. Every position looks directly at every earlier position through attention, and all positions are processed at once as matrix multiplications. Every model family you will build on is a stack of variations on one block. Three ideas, then: what attention computes, what the rest of the block is for, and what it costs.

## The shape of the model

Token IDs are turned into vectors by an embedding lookup. The width of those vectors, the model dimension, is 4,096 in a typical 7 billion parameter model. A sequence of tokens becomes a grid, one row per token.

That grid passes through a stack of identical blocks, 32 or 80 of them. Each block takes the grid in and hands back a grid of the same shape. At the end, a final layer turns each position's vector into one score per vocabulary entry, called the logits.

Inside each block there are exactly two parts. Attention, the only place where positions exchange information. And an MLP, a small feed-forward network that transforms each position on its own. Everything else is plumbing that makes a deep stack trainable.

## Attention as a soft lookup

Each position's vector is projected three ways by learned matrices. A query: what this position is looking for. A key: what it offers to others. And a value: what it passes on if someone attends to it.

Position i compares its query with every key using a dot product, which is large when the two point the same way. A softmax turns those scores into weights that are positive and sum to one. The output is the weighted average of the values.

Think of it as a soft dictionary lookup. The query is compared against every key, and instead of returning the single best match, attention returns a blend of values weighted by how well each key matched.

The lesson works this by hand for "the cat sat", in two dimensions. For the last word, "sat", the weights come out at about a fifth on "the", about a third on "cat", and nearly half on itself. Its output is a new vector that mixes all three positions, in proportions the model chose. In trained models, individual attention heads learn recognisable jobs: look at the previous token, look from a verb to its subject, from a closing bracket to its opening one.

## Scaling, the mask, and heads

Two details make this train. First, the scores are divided by the square root of the key dimension. Here is why. A dot product over many dimensions grows with the number of dimensions; with 128 dimensions, unscaled scores routinely land around plus or minus 11. A softmax over numbers that far apart puts all the weight on the largest one, gradients vanish for everything else, and training stalls. Dividing brings the scores back to a sensible scale, and the softmax stays soft.

Second, the causal mask. A language model is trained to predict every next token of a document at once: position 1 predicts token 2, position 2 predicts token 3, all in one pass. That only works if no position can peek ahead. So before the softmax, every score for a later position is set to minus infinity, which makes its weight exactly zero. The payoff: one forward pass over a 4,000-token document gives you 4,000 training examples.

Now heads. Instead of one wide attention, the model splits each vector into slices and runs a separate attention on each slice, each with its own softmax. In the lesson's example, from the same three tokens, one head spreads its attention between "cat" and "sat" while the other favours "the" and "cat". Each head chooses where to look independently, which one wide head cannot do. A 7 billion parameter model splits its 4,096 dimensions into 32 heads of 128, at about the same compute as one wide head.

Then grouped-query attention. During generation, each layer caches every past token's keys and values. Grouped-query attention keeps all the query heads but lets groups of them share key and value heads. With 64 query heads and 8 key-value heads, that cache shrinks eight times. On a 70 billion parameter shape it also takes the parameter count from 78.4 billion to 69.0 billion, close to the published size of Llama 2 70B, which uses this configuration. Quality stays close to full attention. The extreme, a single shared key-value head, is called multi-query attention.

## The MLP, residuals and norms

After attention, every position goes through the MLP on its own: expand to about four times the width, apply a non-linearity, project back. Nothing moves between positions here. The MLP holds about two thirds of every block's parameters, and interpretability research suggests much of what a model knows about the world is stored in those weights, though the picture is far from complete.

Here is the sentence to carry. Attention moves information between positions. The MLP transforms information within a position.

Two pieces of plumbing make 80 blocks trainable. The residual connection: each sub-layer computes a correction that is added to the vector flowing through, rather than replacing it. That stream of vectors is the residual stream, and because of the addition, the gradient always has a clean path back to the first block. That is the fix for vanishing gradients.

And normalisation, which rescales each token's vector before it enters a sub-layer. LayerNorm subtracts the mean and divides by the spread. RMSNorm skips the mean and just divides by the typical size, one less step per token, which is one reason the Llama family uses it. Putting the norm before each sub-layer, called pre-norm, trains more stably at depth than the original design, because the residual stream itself is never rescaled.

## Position, as a rotation

Nothing in attention depends on where a token sits. Shuffle the inputs and the outputs come back shuffled: "dog bites man" and "man bites dog" would look the same. So position has to be added.

Many current families use rotary position embeddings, RoPE. Pair up the dimensions of each query and key, treat each pair as a little two-dimensional plane, and rotate it by an angle proportional to the token's position. When you then take a dot product, the two rotations partly cancel, and what is left depends only on the gap between the positions. The lesson checks it: a query at position 3 and a key at position 1 score exactly the same as positions 10 and 8. The offset is 2 in both.

Each plane rotates at its own rate. The fastest makes a full turn every 6 tokens or so, and resolves nearby order. The slowest makes a full turn every 54 thousand tokens, and tracks distance. Rescaling those rates is one of the main tools for extending a trained model's context length.

## What it costs

The whiteboard shortcut for parameters is 12 times the model dimension squared per block: a third in attention, two thirds in the MLP. For Llama 2 7B, that plus the embeddings reproduces the published 6.74 billion. Every parameter does one multiply and one add per token, so a forward pass costs about twice the parameter count in operations, about 13 and a half billion per token for that model.

Attention adds a cost that grows with context length, because every position scores every earlier one. For this shape, the attention work equals the weight work at about 24,500 tokens. Below that, the weights dominate. Above it, attention does.

Now the memory problem. A naive implementation builds the full grid of scores, every position against every position. At 32 thousand tokens with 32 heads in 16-bit numbers, one layer's score grids are 68.7 gigabytes, more than a GPU holds.

FlashAttention never builds the grid. It walks through keys and values in tiles that fit in the GPU's on-chip memory, and for each query keeps a running maximum, a running total and a running output, rescaling them whenever a later tile brings a bigger score. The lesson traces it on the "sat" scores in two tiles, and the weights come out identical to the one-shot softmax. Before I say what changed: does FlashAttention make attention cheaper in arithmetic?

[pause]

No. The operation count is still quadratic in the length. What disappears is the quadratic memory traffic: memory becomes linear in length, and attention runs several times faster. The paper reports up to 7.6 times on GPT-2's attention. Every serious stack uses a kernel of this kind.

## In the interview

Here is a follow-up the lesson expects. Why is attention quadratic, and what does FlashAttention change?

[pause]

Every position scores every earlier position, so the score grid is the length squared, and so is the work. FlashAttention keeps the work but never materialises the grid, tiling keys and values through on-chip memory with an online softmax, so memory is linear and the kernel is no longer bound by reading and writing 68 gigabytes per layer at 32 thousand tokens. The common wrong answer is "FlashAttention makes attention linear", which confuses memory with compute.

And one from production. A custom model's training loss drops to near zero within hours, and its generated text is gibberish. The causal mask is missing or off by one, so each position can see the token it is predicting and learns to copy it. The fix is a unit test: changing the next token must leave every earlier output unchanged. Related bugs look like quality problems too: padding that gets attended to in a batch, overflow in 16-bit floats, which the bf16 format and a max-subtracted softmax prevent, and quality that collapses past the lengths the model was trained on. Measure quality at your real prompt lengths rather than trusting the advertised maximum.

## Recap

Four things to remember. Attention is a softmax-weighted average of values, weighted by how well each query matches each key, and it is the only place positions exchange information; the MLP transforms each position and holds two thirds of the parameters. Scaling keeps the softmax soft, the causal mask turns one document into thousands of training examples, and heads let the model look in several places at once. Residuals and pre-norm make deep stacks trainable, and RoPE encodes relative position by rotation. And the costs: about 12 times the width squared per block, about two operations per parameter per token, grouped-query attention to shrink the key-value cache, and FlashAttention to remove the quadratic memory, not the quadratic compute.

At your desk: the attention examples by hand, the code, the RoPE and normalisation numbers, the parameter counts, the online softmax trace, and the two exercises.

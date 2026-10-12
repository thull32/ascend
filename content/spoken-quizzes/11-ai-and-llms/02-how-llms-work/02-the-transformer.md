---
lesson: the-transformer
source: 6bd6da8348709585
---
## 1

In one attention head, the scores for a query against three keys are all 2.0 after scaling. What is the output?

A, the average of the three value vectors. B, the value vector of the first key. C, the sum of the three value vectors. D, a zero vector, since no key stands out.

[think]

The answer is A: the average of the three value vectors.

Equal scores give equal softmax weights, a third each, so the output is the plain average of the values. Softmax weights are positive and always sum to 1, so a sum of the values, or a zero vector, is impossible, even when no key stands out.

## 2

Why are the dot products between queries and keys divided by the square root of the head dimension?

A, to normalise the value vectors to unit length before mixing them. B, to stop scores growing with the dimension and saturating the softmax. C, to reduce the memory the attention matrix needs for long inputs. D, to keep the attention matrix symmetric between queries and keys.

[think]

The answer is B: to stop scores growing with the dimension and saturating the softmax.

With unit-variance components, a dot product over d terms has a standard deviation of about the square root of d, and large scores saturate the softmax into near one-hot weights with vanishing gradients. Scaling keeps the scores near unit size, so the softmax stays soft and trainable. It changes neither symmetry nor memory, and it does not normalise the values.

## 3

A custom transformer's training loss falls to almost zero within hours, but the text it generates is gibberish. What is the most likely bug?

A, the vocabulary is too small for the training corpus. B, the learning rate is far too high for a model of this size. C, the residual connections were removed from each block. D, the causal mask lets each position see the token it predicts.

[think]

The answer is D: the causal mask lets each position see the token it predicts.

Without a correct causal mask, each position can attend to the next token and copy it, so the training loss collapses while nothing useful is learned; at generation time, there is no future token to copy. A high learning rate makes the loss unstable rather than near zero, and missing residuals make deep models hard to train, not suspiciously easy.

## 4

A model has 64 query heads and 8 key and value heads, which is grouped-query attention. Compared with full multi-head attention, what shrinks by 8 times?

A, the MLP width and the model dimension. B, the key and value cache, and the key and value projection matrices. C, the attention compute for every query head. D, the number of query heads the model evaluates.

[think]

The answer is B: the key and value cache, and the key and value projection matrices.

Each key and value head serves a group of 8 query heads, so only 8 heads' keys and values are projected and cached per token. The cache and those projection parameters fall by 64 over 8, which is 8 times. All 64 query heads still compute their scores, so query-side compute is essentially unchanged, and the MLP and the model dimension are unaffected.

## 5

With rotary position embeddings, a query at position 3 and a key at position 1 give a score of minus 0.127. What score does the same query and key content give at positions 10 and 8?

A, 0.883, since the rotation direction reverses after position 8. B, a different value, since absolute position shifts the angle. C, minus 0.127, since only the offset of 2 matters. D, 0.700, since rotation cancels out at larger positions.

[think]

The answer is C: minus 0.127, since only the offset of 2 matters.

RoPE rotates the query by an angle proportional to its position, and the key by an angle proportional to its own, so their dot product depends only on the difference in positions. Positions 3 and 1, and 10 and 8, share the offset of 2, and give the same score. 0.700 is the unrotated score at offset zero, and 0.883 is the score at offset minus 2, where the key comes after the query.

## 6

A model has a model dimension of 4,096 and 32 blocks. Roughly how many parameters are in the blocks, excluding embeddings?

A, about half a billion. B, about 6.4 billion. C, about 1.6 billion. D, about 50 billion.

[think]

The answer is B: about 6.4 billion.

Each block has about 12 times d squared parameters: 4 d squared for the attention projections, and 8 d squared for the MLP. 12 times 4,096 squared is about 201 million, and times 32 blocks that is about 6.4 billion. Add roughly a quarter of a billion for the embeddings, and you get a 7-billion-class model.

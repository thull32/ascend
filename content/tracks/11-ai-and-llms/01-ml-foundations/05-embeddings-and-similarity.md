---
slug: embeddings-and-similarity
title: "Embeddings and similarity: meaning as geometry"
description: How items become dense vectors whose distances mean something, a contrastive training step computed on a three-pair batch (loss, temperature and why hard negatives carry the gradient), dot product versus cosine versus Euclidean with worked numbers, normalisation, what an embedding model does between text and vector, storage precision, and the production failures of embedding search.
minutes: 26
difficulty: medium
tags: [machine-learning, embeddings, cosine-similarity, vector-search, nearest-neighbours, semantic-search]
problems: []
---
A customer types "how do I stop being charged every month" into your help centre. The article that answers it is titled "Cancel your subscription". Keyword search finds no word in common with the title, and the article body shares only words like "how" and "do", which also appear in 4,000 other articles. The customer opens a ticket. Every search box, recommendation row, duplicate detector and retrieval-augmented chatbot runs into the same wall: computers compare strings exactly, and people mean things approximately.

**Embeddings** get around the wall by turning each item (a word, a sentence, a product, a user) into a list of numbers such that items with similar meaning end up close together. "Similar" stops being a question about characters and becomes a question about geometry, which you can answer with a dot product. This lesson covers how that works, how training shapes the space (computed on a batch small enough to check by hand), which distance to use, and what goes wrong in production.

## One-hot vectors and why they fail

The obvious way to give a word a vector is **one-hot encoding**: with a vocabulary of 50,000 words, word number 3,172 becomes a 50,000-long vector of zeros with a single 1 at position 3,172. It is exact and it is useless for similarity. The dot product of any two different one-hot vectors is 0, so "cancel" is exactly as similar to "stop" as it is to "banana". Every word is equally unrelated to every other, and the vectors are enormous.

A **dense embedding** instead represents each item with a few hundred to a few thousand real numbers, all of them typically non-zero, learned so that geometry reflects usage. In the toy space below, each word has four dimensions labelled *royal*, *male*, *female* and *food* so you can see why words land where they do. Real embedding dimensions are not individually interpretable; meaning is spread across all of them.

```viz
{"type": "ml", "algorithm": "embeddings-similarity", "text": "king queen man woman apple banana",
 "title": "Cosine similarity between word vectors",
 "caption": "Rows compare each word with every other. Related words point in similar directions; king − man + woman lands nearest queen."}
```

The famous analogy (king − man + woman ≈ queen) shows that *directions* can encode relationships, not only closeness. Treat it as an illustration rather than a law: published analogy results are selected examples, and many analogies fail.

## Where embeddings come from

An embedding table is the first weight matrix of a network: a matrix with one row per vocabulary item, and "looking up" a word's embedding is multiplying its one-hot vector by that matrix, which selects one row. The rows start random and are shaped by whatever training objective the network has.

- **Predict the context.** Word2vec-style models learn word vectors by predicting which words appear near which. Words used in similar contexts ("cancel", "terminate", "stop") receive similar gradients and drift together. This is the **distributional hypothesis**: a word is characterised by the company it keeps.
- **Contrastive training.** Modern sentence and document embedding models are transformer encoders trained on pairs that should match: a question and the passage that answers it, a title and its article, two paraphrases. The loss pulls each query towards its own passage and pushes it away from the other passages in the batch (the **in-batch negatives**). The next section computes one step of it.
- **Two-tower recommenders.** A user tower turns viewing history into a vector, an item tower turns each title into a vector, and training makes the dot product predict what the user watches. At serving time you precompute every item vector and retrieve the few hundred closest to the user's vector as candidates for a heavier ranking model. Large streaming and video platforms have described this shape publicly for candidate generation.

Language models are built from the same idea: their first layer is a token embedding table, and every layer after it refines those vectors, as you will see in [The transformer](/learn/ai-and-llms/how-llms-work/the-transformer).

## Contrastive training, one batch by hand

Take a batch of three query–passage pairs and suppose the current model gives these cosine similarities (row $i$ is query $i$; column $j$ is passage $j$; the diagonal holds the true pairs):

| | $p_1$ "Cancel your plan" | $p_2$ "Change payment method" | $p_3$ "Refunds within 30 days" |
|---|---|---|---|
| $q_1$ "cancel subscription" | **0.80** | 0.30 | 0.55 |
| $q_2$ "update card" | 0.25 | **0.70** | 0.20 |
| $q_3$ "refund policy" | 0.50 | 0.15 | **0.75** |

The standard loss (called InfoNCE) treats each row as a classification problem over the batch: divide the similarities by a **temperature** $\tau$, apply a softmax, and take the cross-entropy against the diagonal:

$$\ell_i = -\ln \frac{e^{s_{ii}/\tau}}{\sum_j e^{s_{ij}/\tau}}, \qquad \frac{\partial \ell_i}{\partial s_{ij}} = \frac{p_{ij} - [i = j]}{\tau}$$

Work row 1 with $\tau = 0.1$. The logits are 8.0, 3.0 and 5.5. Subtract the largest for stability and exponentiate: $1$, $e^{-5} = 0.0067$, $e^{-2.5} = 0.0821$. The softmax is 0.918, 0.006 and 0.075, so $\ell_1 = -\ln 0.918 = 0.085$. The gradient on the three similarities is $(0.918 - 1)/0.1 = -0.82$ for the true passage (raise it), $+0.75$ for the refunds passage, and $+0.06$ for the payment passage.

That last pair of numbers is the whole story of contrastive learning. The refunds passage (0.55) is a **hard negative**: topically close to "cancel subscription" (both about money leaving) but wrong. It receives twelve times the push of the easy negative. Over millions of batches, the space is carved by exactly these pushes: related-but-wrong items are moved apart, and unrelated items are left alone because they are already far.

The temperature decides how sharply the loss focuses on hard negatives:

| $\tau$ | Mean loss over the batch | Row 1: push on hard negative | Row 1: push on easy negative | Ratio |
|---|---|---|---|---|
| 1.0 | 0.841 | +0.33 | +0.25 | 1.3× |
| 0.1 | 0.061 | +0.75 | +0.06 | 12× |
| 0.05 | 0.005 | +0.13 | +0.00 | all on the hard one |

At $\tau = 1$ the softmax is nearly uniform and every negative is pushed about equally, so training wastes effort on pairs that are already separated. At $\tau = 0.05$ this batch is already solved and contributes almost nothing; the model only learns from batches that contain harder negatives, which is why embedding models are trained with large batches (a batch of $B$ pairs gives every query $B - 1$ negatives for free) and with deliberately **mined hard negatives** (passages a keyword search ranks high that are not the answer). The same mechanism explains a known pitfall: if the batch accidentally contains a second valid answer for a query (a duplicate passage), the loss pushes that correct passage away, a **false negative**.

```python
import math

def info_nce_loss(sims, tau):
    """Mean InfoNCE loss; sims[i][j] is the similarity of query i and passage j."""
    total = 0.0
    for i, row in enumerate(sims):
        z = [s / tau for s in row]
        m = max(z)                                             # subtract the max before exp
        log_sum_exp = m + math.log(sum(math.exp(v - m) for v in z))
        total += log_sum_exp - z[i]                            # -log softmax at the true pair
    return total / len(sims)

sims = [[0.80, 0.30, 0.55], [0.25, 0.70, 0.20], [0.50, 0.15, 0.75]]
print(round(info_nce_loss(sims, 0.1), 4))   # 0.0613
```

## Measuring similarity: dot product, cosine, Euclidean

Three measures, and they do not always agree. Take a query and three documents in a 3-dimensional space:

- $q$ = "cancel subscription" = (0.9, 0.2, 0.1)
- $d_1$ = "stop my plan" = (0.8, 0.3, 0.0)
- $d_2$ = "update payment card" = (0.1, 0.9, 0.3)
- $d_3$ = (1.8, 0.4, 0.2), exactly twice $q$: same direction, twice the length

The **dot product** $a \cdot b = \sum_i a_i b_i$. The **norm** (length) $\|a\| = \sqrt{a \cdot a}$. **Cosine similarity** divides the dot product by both lengths, so it measures only the angle:

$$\cos(a, b) = \frac{a \cdot b}{\|a\|\,\|b\|}$$

It ranges from −1 (opposite) through 0 (unrelated) to 1 (same direction). Work it for $q$ and $d_1$:

1. $q \cdot d_1 = 0.9 \times 0.8 + 0.2 \times 0.3 + 0.1 \times 0.0 = 0.72 + 0.06 + 0 = 0.78$
2. $\|q\| = \sqrt{0.81 + 0.04 + 0.01} = \sqrt{0.86} = 0.927$
3. $\|d_1\| = \sqrt{0.64 + 0.09 + 0} = \sqrt{0.73} = 0.854$
4. $\cos(q, d_1) = 0.78 / (0.927 \times 0.854) = 0.78 / 0.792 = 0.984$

All three documents:

| Document | Dot product | Cosine | Euclidean distance |
|---|---|---|---|
| $d_1$ "stop my plan" | 0.78 | **0.984** | **0.17** |
| $d_2$ "update payment card" | 0.30 | 0.339 | 1.08 |
| $d_3$ (2 × $q$) | **1.72** | **1.000** | 0.93 |

The dot product ranks $d_3$ far above $d_1$ purely because $d_3$ is longer. Cosine says $d_3$ points in exactly the query's direction. Euclidean distance says $d_1$ is nearest and $d_3$ is quite far. Which is right depends on what vector length means in your model. For most text embedding models, length is an artefact (longer or more repetitive inputs can produce larger norms), and the models are trained with cosine similarity, as in the contrastive loss above.

## Normalise once, then every metric agrees

**Normalise every vector to length 1 when you store it.** For unit vectors, $\cos(a, b) = a \cdot b$, and $\|a - b\|^2 = 2 - 2\cos(a, b)$, so dot product, cosine and Euclidean distance all produce the same ranking and you can use whichever your index computes fastest (usually the dot product, one fused multiply-add per dimension). Check it on $d_1$: normalised, $\|q - d_1\|^2 = 2 - 2(0.984) = 0.031$. The exception is a model deliberately trained with raw dot products (some recommenders use the item norm to encode popularity); there you must not normalise. Use the metric the model was trained with.

```python
import numpy as np

def normalise(m):
    norms = np.linalg.norm(m, axis=-1, keepdims=True)
    return m / np.maximum(norms, 1e-12)          # avoid dividing by zero

docs = normalise(np.array([[0.8, 0.3, 0.0],
                           [0.1, 0.9, 0.3],
                           [1.8, 0.4, 0.2]]))
q = normalise(np.array([0.9, 0.2, 0.1]))

scores = docs @ q                                # cosine similarities: 0.984, 0.339, 1.0
k = 2
top = np.argpartition(-scores, k - 1)[:k]        # the k best, unordered, in O(n)
top = top[np.argsort(-scores[top])]              # sort only the winners: [2, 0]
```

`argpartition` is the non-obvious line: a full sort of a million scores is $O(n \log n)$, while selecting the top $k$ is $O(n)$ and sorting only those $k$ is $O(k \log k)$.

## Under the hood: from text to a vector

A sentence embedding model runs four steps, and each has a production consequence.

1. **Tokenise and truncate.** The text becomes token IDs ([Tokenization](/learn/ai-and-llms/how-llms-work/tokenization)), and anything beyond the model's maximum input length is cut off or rejected. Limits range from a few hundred tokens for small open models to several thousand for hosted APIs at the time of writing; a 5,000-token document embedded by a 512-token model is represented by its first tenth.
2. **Encode.** A transformer produces one vector per token, each already mixed with its context by attention.
3. **Pool.** The per-token vectors become one vector, usually by averaging them (mean pooling) or by taking the output at a special summary token. Averaging is why a long document's embedding is a blur of its topics: a chunk about three things sits between all three.
4. **Normalise.** Many models return unit vectors already; check before normalising twice or not at all.

Two properties of trained spaces explain surprises. **Anisotropy**: vectors from some models occupy a narrow cone, so even unrelated texts score 0.6 or more and all the useful signal lives in a thin band; subtracting the corpus mean before normalising spreads them out. **Truncatable dimensions**: some recent models are trained so that the first 256 of 1,024 dimensions already form a usable embedding (often called Matryoshka embeddings), letting you trade recall for storage without re-embedding.

## Storage and precision

Vectors are the dominant storage cost of semantic search. For 768 dimensions:

| Precision | Bytes per vector | 10 million vectors | Distance computation | Effect on ranking |
|---|---|---|---|---|
| float32 | 3,072 | 30.7 GB | float multiply-add | reference |
| float16 / bfloat16 | 1,536 | 15.4 GB | half-precision multiply-add | negligible for ranking |
| int8 (scalar quantised) | 768 | 7.7 GB | integer multiply-add | small recall loss, recovered by rescoring |
| binary (1 bit per dimension) | 96 | 0.96 GB | XOR and population count | large loss alone; used as a first pass before rescoring |

Product quantisation compresses further, to tens of bytes per vector, and together with the index structures that avoid scanning everything it is the subject of [Vector search internals](/learn/ai-and-llms/ml-foundations/vector-search-internals).

## Nearest-neighbour search, in brief

Finding the top-$k$ most similar vectors by brute force means one dot product per stored vector: $n \times d$ multiply-adds per query. For one million 768-dimensional float32 vectors that is about 1.5 billion floating-point operations over 3 GB of data; memory bandwidth dominates, so expect tens of milliseconds per query on a multi-core server. Brute force has perfect recall and no index to tune, so it is the right answer for a few hundred thousand vectors. Beyond that, **approximate nearest neighbour** (ANN) indexes such as IVF, HNSW and product quantisation give up a little recall for orders of magnitude of speed; you measure them by **recall@k** against brute force, and they have a trap around filtering. The next lesson opens each of them up.

## Failure modes in production

**Mixed model versions.** *Symptom:* after an embedding model upgrade, relevance drops sharply for old documents while new ones look fine. *Diagnosis:* queries embedded with the new model are compared against vectors from the old one, an unrelated coordinate system with the same dimension. *Fix:* store the model name and version with every vector, re-embed the corpus into a new index (100 million documents of 500 tokens is 50 billion tokens of embedding work), and switch queries only when the backfill is complete.

**A threshold that stopped meaning anything.** *Symptom:* a "cosine above 0.8 is a duplicate" rule floods reviewers after a model change, or never fires. *Diagnosis:* absolute similarity levels are a property of one model (anisotropy shifts the whole distribution). *Fix:* calibrate thresholds on labelled pairs per model version, and alert on the distribution of top-1 scores.

**Similar but wrong.** *Symptom:* "how do I cancel" and "how do I *not* cancel" retrieve the same article; a search for error code `E1043` returns articles about `E1034`. *Diagnosis:* embeddings capture topic and phrasing well and negation, numbers and exact identifiers poorly. *Fix:* hybrid search (keyword plus vector) and a reranker, covered in [Retrieval-augmented generation](/learn/ai-and-llms/building-with-llms/retrieval-augmented-generation).

**The end of every document is invisible.** *Symptom:* questions answered in the second half of long documents never retrieve them. *Diagnosis:* the embedding model truncated each document at its maximum input length. *Fix:* chunk documents below the limit before embedding, with some overlap, and log the token count of every embedded input.

**Bias in the space.** *Symptom:* similarity-driven recommendations or matches skew by gender or ethnicity. *Diagnosis:* embeddings absorb the associations in their training text. *Fix:* audit with paired probes before similarity feeds a decision about people.

## Exercises

```exercise
id: cosine-similarity
title: Cosine similarity
prompt: |
  Implement `cosine_similarity(a, b)` for two equal-length, non-empty lists of
  numbers: the dot product divided by the product of the two vectors' Euclidean
  lengths.

  If either vector has length zero (all zeros), the similarity is undefined;
  return `0` in that case rather than dividing by zero.

  Return an unrounded float; results are compared to 6 decimal places.
languages: [python, javascript]
entry: cosine_similarity
starter:
  python: |
    import math

    def cosine_similarity(a, b):
        # your code here
        return 0.0
  javascript: |
    function cosine_similarity(a, b) {
      // your code here
      return 0;
    }
tests:
  - args: [[1, 0], [0, 1]]
    expected: 0
    label: orthogonal vectors
  - args: [[3, 4], [6, 8]]
    expected: 1
    label: same direction, different length
  - args: [[3, 4], [-3, -4]]
    expected: -1
    label: opposite directions
  - args: [[0.9, 0.2, 0.1], [0.8, 0.3, 0.0]]
    expected: 0.984428
    label: the worked example from the lesson
  - args: [[3, 4, 0, 0], [4, 3, 0, 0]]
    expected: 0.96
  - args: [[0, 0, 0], [1, 2, 3]]
    expected: 0
    hidden: true
    label: a zero vector has no direction
  - args: [[0.9, 0.2, 0.1], [0.1, 0.9, 0.3]]
    expected: 0.339118
    hidden: true
hints:
  - "Accumulate the dot product and both squared norms in a single loop."
  - "Check for a zero norm before dividing; `math.sqrt` / `Math.sqrt` of the squared norms gives the lengths."
```

```exercise
id: info-nce-loss
title: The contrastive (InfoNCE) loss
prompt: |
  `sims` is a square matrix (a list of equal-length lists): `sims[i][j]` is
  the similarity between query `i` and passage `j`, and passage `i` is the
  correct match for query `i`. `tau` is the temperature (> 0).

  For each row, divide every entry by `tau`, take the softmax, and compute
  `-ln(softmax[i])` at the diagonal entry. Return the mean over rows.

  Make it numerically stable: subtract the row's largest scaled value before
  exponentiating (one hidden test has scaled values of 1,000). Results are
  compared to 6 decimal places.
languages: [python, javascript]
entry: info_nce_loss
starter:
  python: |
    import math

    def info_nce_loss(sims, tau):
        # your code here
        return 0.0
  javascript: |
    function info_nce_loss(sims, tau) {
      // your code here
      return 0;
    }
tests:
  - args: [[[0.8, 0.3, 0.55], [0.25, 0.7, 0.2], [0.5, 0.15, 0.75]], 0.1]
    expected: 0.061322
    label: the worked batch at temperature 0.1
  - args: [[[0.8, 0.3, 0.55], [0.25, 0.7, 0.2], [0.5, 0.15, 0.75]], 1.0]
    expected: 0.840837
    label: the same batch at temperature 1
  - args: [[[0, 0, 0], [0, 0, 0], [0, 0, 0]], 1.0]
    expected: 1.098612
    label: all similarities equal gives ln(3)
  - args: [[[0.2, 0.9], [0.9, 0.2]], 0.5]
    expected: 1.620417
    label: every negative beats its positive
  - args: [[[0.9]], 0.05]
    expected: 0
    hidden: true
    label: a batch of one has no negatives
  - args: [[[10, 0], [0, 10]], 0.01]
    expected: 0
    hidden: true
    label: large logits must not overflow
hints:
  - "For row i, let z = [s / tau for s in row] and m = max(z); the log of the softmax denominator is m + ln(sum(exp(z_j - m)))."
  - "The row's loss is that log-sum-exp minus z[i]; average the rows."
```

## Interviewer follow-ups

**"How does contrastive training decide what 'similar' means?"** *Model answer:* the training pairs define it. The InfoNCE loss is a softmax over the batch in which the positive is the correct class, so the gradient raises the positive's similarity and lowers each negative's in proportion to its softmax probability; hard negatives get most of the push (12 times the easy one in the worked batch at $\tau = 0.1$). A model trained on question–answer pairs learns "answers this", which is different from "paraphrases this". *Common wrong answer:* "it learns the meaning of words", with no mention of the objective.

**"Cosine or dot product?"** *Model answer:* whichever the model was trained with; for normalised vectors they are identical, so normalise at write time and use the dot product. Keep raw dot products only for models that deliberately encode something (such as popularity) in the norm. *Common wrong answer:* "cosine is always more accurate".

**"You are upgrading the embedding model for 100 million documents. What is the plan?"** *Model answer:* build a new index alongside the old one, backfill by re-embedding everything (budget the tokens and the rate limits), dual-write new documents to both, evaluate recall and relevance on a labelled query set, switch reads, then retire the old index; never mix versions in one index. *Common wrong answer:* "embed new documents with the new model and let the old ones age out".

**"Why do embedding models need large batches?"** *Model answer:* in-batch negatives mean a batch of $B$ pairs gives each query $B - 1$ negatives; more negatives make it likelier that some are hard, and hard negatives carry the gradient. Low temperature sharpens the focus further, and mined hard negatives add what random batches lack. *Common wrong answer:* "for GPU efficiency", which is true of all training and misses the objective.

## What mid-level engineers get wrong

- **Comparing vectors from different models or versions.** Same dimension, unrelated coordinates.
- **Hard-coding a similarity threshold.** Levels shift between models; calibrate on labelled pairs.
- **Embedding whole long documents.** Truncation silently drops the end, and pooling blurs the rest.
- **Trusting embeddings with identifiers, numbers and negation.** Pair them with keyword search.
- **Building an ANN index for 200,000 vectors.** Brute force is exact and fast enough; measure first.
- **Forgetting that the training objective defines similarity.** A model trained for question–answer retrieval is not a paraphrase detector.

## Senior signals

- You explain embeddings as **learned coordinates where distance tracks the training objective**, and you can compute a contrastive loss step and say why hard negatives and temperature matter.
- You **normalise at write time** and know that for unit vectors dot product, cosine and Euclidean rankings coincide, except for models trained to use the norm.
- You treat the embedding model as a **versioned dependency**: vectors are stored with their model version, never mixed across versions, and a model upgrade is planned as a re-embedding migration.
- You know what the model does to your text (**truncation and pooling**) and chunk accordingly.
- You choose **storage precision** by arithmetic (3 KB per float32 768-dimension vector, 96 bytes binary) and rescore compressed candidates with full vectors.
- You start with **brute force** when the corpus is small, and you pair embeddings with keyword search and reranking because they are weak on **negation, numbers and exact identifiers**.

## Check yourself

```quiz
- q: >-
    Document A is a short answer and document B is A's text repeated five times, which gives B's embedding a larger norm in the same direction. With raw dot-product scoring, what happens?
  options: ["A and B score the same, because they point in the same direction", "The score is undefined, because the vectors have different lengths", "B scores higher, because the dot product grows with the vector's length", "A scores higher, because the dot product favours shorter documents"]
  answer: 2
  explanation: >-
    The dot product is the cosine multiplied by both lengths, so a longer vector in the same direction scores higher even though B adds no information. Equal direction would give equal scores only under cosine similarity; cosine, or normalising vectors before a dot product, removes the length effect and scores A and B equally.
- q: >-
    In the worked contrastive batch at temperature 0.1, query 1 has similarity 0.55 to a wrong passage about refunds and 0.30 to a wrong passage about payment cards. Which receives the larger push away?
  options: ["The payment passage, since it is the least similar and most wrong", "Both equally, since in-batch negatives share the gradient evenly", "Neither, since only the correct passage's similarity is updated", "The refunds passage, since its softmax probability is far higher"]
  answer: 3
  explanation: >-
    The gradient on each negative's similarity is its softmax probability divided by the temperature: 0.075/0.1 = 0.75 for the refunds passage against 0.006/0.1 = 0.06 for the payment passage. Hard negatives carry the learning signal; easy ones are already far away. An equal split happens only at high temperature, where the softmax is nearly uniform.
- q: >-
    Your team upgrades to a better embedding model and embeds new documents with it, while the 50 million existing documents keep their old vectors. What happens to search quality?
  options: ["It improves gradually as more documents get the better model's vectors", "Vectors from two unrelated spaces are compared, so results degrade", "Only the similarity threshold needs re-tuning for the new model", "Nothing changes, because both models output the same dimension"]
  answer: 1
  explanation: >-
    Two models' spaces are independently learned; equal dimension does not make their axes correspond, so a query embedded with one model is being compared against vectors from an unrelated coordinate system. Every vector compared must come from the same model version, so an upgrade requires re-embedding the corpus (typically backfilled into a new index before switching queries).
- q: >-
    For unit-length vectors, which statement is true?
  options: ["The dot product always lies between 0 and 1, so it acts as a probability", "Euclidean distance and cosine can still rank neighbours differently", "Cosine similarity is always 1, because both vectors have the same length", "Dot product, cosine and Euclidean distance rank neighbours identically"]
  answer: 3
  explanation: >-
    With norms of 1, the cosine formula's denominator is 1, so the dot product equals the cosine, and expanding the squared distance gives 1 + 1 − 2·(a·b) = 2 − 2·cosine. The three measures are monotonic transformations of each other, so they cannot disagree on ranking. Equal lengths say nothing about direction, so cosine is not always 1, and the dot product of unit vectors can be negative, down to −1.
- q: >-
    Answers that appear late in long product manuals are never retrieved, although short documents work well. What is the most likely cause?
  options: ["The embedding model truncated each manual at its input limit", "Cosine similarity penalises long documents for their larger norm", "The ANN index drops vectors from documents above a set size", "Long documents need a lower similarity threshold to match"]
  answer: 0
  explanation: >-
    Embedding models accept a bounded number of tokens and cut off or reject the rest, so the end of a long manual never reaches the vector; chunking below the limit fixes it. Cosine ignores norm by construction, ANN indexes store whatever vector they are given, and a threshold cannot recover text that was never embedded.
- q: >-
    You need semantic search over 200,000 help-centre passages at 20 queries per second. What is the simplest sound design for the search step?
  options: ["Keyword search only, since embeddings stop scaling past 100,000 documents", "An HNSW index, since approximate search is required at any real scale", "Brute-force dot products over normalised vectors held in memory", "k-means with k = 200,000, searching by the nearest centroid first"]
  answer: 2
  explanation: >-
    Brute force is exact and fast enough here: 200,000 × 768 is about 150 million multiply-adds over 600 MB of float32 vectors per query, milliseconds to tens of milliseconds on one server, comfortably fast enough at 20 queries per second, with perfect recall and no index to tune. ANN becomes worthwhile at tens of millions of vectors or high query rates. Embeddings scale far beyond this size.
```

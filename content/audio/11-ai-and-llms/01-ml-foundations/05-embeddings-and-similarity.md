---
lesson: embeddings-and-similarity
source: b1d1bbd04ff438fe
fit: great
desk:
  - "The contrastive batch worked by hand, and the temperature table"
  - "Dot product, cosine and Euclidean distance computed for three documents"
  - "The normalise and top-k code, and the storage-precision table"
  - "Exercises: cosine similarity, and the InfoNCE loss"
---
## Introduction

A customer types "how do I stop being charged every month" into your help centre. The article that answers it is titled "Cancel your subscription". Keyword search finds no word in common with the title, and the body shares only words like "how" and "do", which also appear in 4 thousand other articles. The customer opens a ticket.

Every search box, recommendation row, duplicate detector and retrieval-augmented chatbot hits the same wall. Computers compare strings exactly, and people mean things approximately.

Embeddings get around the wall by turning each item, a word, a sentence, a product, a user, into a list of numbers, so that items with similar meaning land close together. "Similar" stops being a question about characters and becomes a question about geometry. Three ideas: how training shapes that space, which distance to use, and what goes wrong in production.

## From one-hot to dense

The obvious way to give a word a vector is one-hot encoding. With a vocabulary of 50 thousand words, each word becomes 50 thousand zeros with a single 1 in its own position. It is exact, and useless for similarity: any two different words have a dot product of zero, so "cancel" is exactly as similar to "stop" as it is to "banana".

A dense embedding uses a few hundred to a few thousand real numbers, nearly all non-zero, learned so that geometry reflects usage. In a toy picture you could label the dimensions royal, male, female and food. Real dimensions are not individually meaningful; meaning is spread across all of them. The famous analogy, king minus man plus woman lands near queen, shows that directions can encode relationships. Treat it as an illustration, not a law. Published analogies are selected examples, and many fail.

Where do these vectors come from? An embedding table is just the first weight matrix of a network: one row per item, starting random, shaped by the training objective. Word2vec-style models predict which words appear near which, so words used in similar contexts, like "cancel", "terminate" and "stop", get similar gradients and drift together. A word is characterised by the company it keeps. Two-tower recommenders train a user tower and an item tower so that their dot product predicts what the user watches; at serving time every item vector is precomputed and the few hundred closest to the user become candidates for a heavier ranker. And modern sentence embedding models are trained contrastively, which deserves its own chapter.

## Contrastive training and hard negatives

A sentence embedding model is a transformer trained on pairs that should match: a question and the passage that answers it, a title and its article. The loss pulls each query towards its own passage and pushes it away from the other passages in the batch, the in-batch negatives.

The lesson works one batch by hand. Three queries, three passages. Take the query "cancel subscription". Its true passage, "Cancel your plan", currently has a similarity of 0.8. The wrong passage about refunds has 0.55. The wrong passage about changing a payment method has 0.3.

The loss treats each query as a classification problem over the batch: divide the similarities by a temperature, take a softmax, and score the probability given to the true passage. With a temperature of 0.1, the true passage already gets about 92 percent, so the loss is small.

Before I tell you the gradient: which wrong passage gets pushed away harder, the refunds one or the payment one?

[pause]

The refunds passage, and by a lot: twelve times the push of the payment passage. The refunds passage is a hard negative. It is topically close to "cancel subscription", both about money leaving, but it is wrong. The payment passage is already far away, so it is left almost alone. That is the whole story of contrastive learning. Over millions of batches, the space is carved by exactly these pushes: related-but-wrong items are moved apart, and unrelated items are ignored because they are already far.

The temperature decides how sharp that focus is. At a temperature of 1, the softmax is nearly uniform and every negative is pushed about equally, so effort is wasted on pairs already separated. At 0.1, the hard negative gets twelve times the push. At 0.05, this batch is already solved and contributes almost nothing; the model only learns from batches with harder negatives.

That explains how these models are trained. Large batches, because a batch of B pairs gives every query B minus one negatives for free, and more negatives means some are hard. Deliberately mined hard negatives: passages a keyword search ranks high that are not the answer. And it explains a pitfall. If the batch accidentally contains a second valid answer, the loss pushes that correct passage away, a false negative.

The deeper point: the training pairs define what "similar" means. A model trained on question-answer pairs learns "answers this", which is not the same as "paraphrases this".

## Which similarity, and why to normalise

Three measures, and they do not always agree. The dot product multiplies matching coordinates and adds them up. Cosine similarity divides the dot product by both vectors' lengths, so it measures only the angle, from minus 1 for opposite through 0 for unrelated to 1 for the same direction. Euclidean distance is the straight-line distance between the points.

The lesson's example has a query, a good match, an unrelated document, and a third document that is exactly the query doubled: same direction, twice the length. The dot product ranks the doubled one far above the good match, purely because it is longer. Cosine says it points exactly the query's way, a perfect 1. Euclidean distance says the good match is nearest and the doubled one is quite far. Three measures, three stories.

Which is right depends on what length means in your model. For most text embedding models, length is an artefact: longer or repetitive inputs can produce bigger vectors. And they are trained with cosine similarity.

So here is the rule. Normalise every vector to length 1 when you store it. For unit vectors, the dot product equals the cosine, and the squared distance is just 2 minus twice the cosine. All three rank identically, and you can use whichever your index computes fastest, usually the dot product. The one exception is a model deliberately trained with raw dot products, such as a recommender that uses the item's length to encode popularity. There you must not normalise. Use the metric the model was trained with.

## From text to vector, and what it costs to store

A sentence embedding model runs four steps, and each has a production consequence. First it tokenises and truncates: anything past the model's input limit is cut off. Limits range from a few hundred tokens for many small open models to 8 thousand for OpenAI's current embedding models, so a 5 thousand token document embedded by a 512-token model is represented by its first tenth. Second, it encodes, producing one vector per token. Third, it pools them into one vector, usually by averaging, which is why a long document's embedding is a blur of its topics. Fourth, it may normalise; check before you do it twice or not at all.

Two properties explain surprises. Some models' vectors occupy a narrow cone, so even unrelated texts score well above zero, and the useful signal lives in a thin band. And some recent models are trained so that the first 256 of 1,024 dimensions already make a usable embedding, letting you trade recall for storage without re-embedding.

Storage is the dominant cost of semantic search. For 768 dimensions, a 32-bit vector is about 3 kilobytes, so 10 million of them is about 31 gigabytes. Half precision halves that with negligible effect on ranking. Eight-bit integers quarter it, with a small recall loss you recover by rescoring. One bit per dimension gets it under a gigabyte, too lossy on its own but useful as a first pass before rescoring.

And search itself: brute force is one dot product per stored vector. For a million vectors that is tens of milliseconds per query on a multi-core server, with perfect recall and nothing to tune. That is the right answer up to a few hundred thousand vectors. Beyond that come approximate indexes, which the next lesson opens up.

## Failures in production

Mixed model versions. After an embedding model upgrade, relevance drops for old documents while new ones look fine, because queries from the new model are being compared against vectors from the old one. Same dimension, unrelated coordinate system. Store the model version with every vector, and treat an upgrade as a re-embedding migration.

A threshold that stopped meaning anything. "Cosine above 0.8 is a duplicate" floods the reviewers after a model change, or never fires. Absolute similarity levels belong to one model. Calibrate thresholds on labelled pairs, per model version.

Similar but wrong. "How do I cancel" and "how do I not cancel" retrieve the same article, and a search for one error code returns articles about another with the digits swapped. Embeddings capture topic and phrasing well, and negation, numbers and exact identifiers poorly. Pair them with keyword search and a reranker.

The end of every document is invisible, because the model truncated it. Chunk below the limit, with some overlap, and log the token count of everything you embed. And bias: embeddings absorb the associations in their training text, so audit with paired probes before similarity feeds a decision about people.

## In the interview

A follow-up the lesson expects. You are upgrading the embedding model for 100 million documents. What is the plan?

[pause]

Build a new index alongside the old one. Backfill by re-embedding everything, and budget for it: 100 million documents of 500 tokens is 50 billion tokens of embedding work, plus the rate limits. Dual-write new documents to both indexes. Evaluate recall and relevance on a labelled query set, switch reads, then retire the old index. Never mix versions in one index. The wrong answer is "embed new documents with the new model and let the old ones age out".

And a quicker one: cosine or dot product? Whichever the model was trained with. For normalised vectors they are identical, so normalise at write time and use the dot product.

## Recap

Four things to remember. Embeddings are learned coordinates where distance tracks the training objective, and in contrastive training the hard negatives carry the gradient, sharpened by a low temperature and large batches. Normalise at write time, and dot product, cosine and Euclidean distance all rank the same, unless the model was trained to use the length. Treat the embedding model as a versioned dependency: never mix versions, and plan upgrades as migrations. And embeddings are weak on negation, numbers and exact identifiers, so pair them with keyword search, and start with brute force while the corpus is small.

At your desk: the contrastive batch and temperature table, the three similarity measures worked out, the normalise and top-k code, the storage table, and the cosine and InfoNCE exercises.

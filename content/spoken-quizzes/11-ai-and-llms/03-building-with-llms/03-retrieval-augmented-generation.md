---
lesson: retrieval-augmented-generation
source: 8e374bfa96eda978
---
## 1

Users report that the assistant says "I could not find that" for questions the documentation does answer. What should you measure first?

A, retrieval recall at k, on a labelled set of the failing queries. B, whether the prompt is too long for the model's context window. C, answer faithfulness on those queries, scored with an LLM judge. D, the model's temperature, and how often it declines to answer.

[think]

The answer is A: retrieval recall at k, on a labelled set of the failing queries.

"Not found" for answerable questions points at retrieval: the passage probably never reached the prompt, and recall at k tells you whether it did. Faithfulness measures how the model uses the passages it received, which cannot help if the right one is missing.

## 2

Why does reciprocal rank fusion use ranks, instead of adding BM25 and cosine scores directly?

A, the scores are on different, query-dependent scales, so a sum is meaningless. B, BM25 returns only a ranked list, not scores, so ranks are all it has. C, ranks are cheaper to store and compare than floating-point scores. D, cosine similarity can be negative, which would cancel out the BM25 score.

[think]

The answer is A: the scores are on different, query-dependent scales, so a sum is meaningless.

A BM25 score of 2.8 and a cosine of 0.83 cannot be meaningfully added, and their ranges change from query to query, so a raw sum lets one retriever dominate arbitrarily. Rank fusion needs only positions, which are comparable across lists, and it rewards documents that several retrievers rank highly. BM25 does produce scores; they are just on their own scale.

## 3

In BM25 with k1 set to 1.2, a document of average length mentions a query term four times instead of once. How does that term's contribution change?

A, it doubles, because BM25 takes the square root of term frequency. B, it stays the same, because BM25 only records whether a term is present. C, it rises by about 70 percent, because term frequency saturates toward k1 plus 1. D, it quadruples, because the score is proportional to term frequency.

[think]

The answer is C: it rises by about 70 percent, because term frequency saturates toward k1 plus 1.

At average length, the term weight is the frequency times 2.2, divided by the frequency plus 1.2: 1.0 for one mention, and about 1.69 for four, approaching 2.2 however often the term repeats. Saturation stops keyword stuffing from winning, while the presence of a rare term still counts for a lot.

## 4

You increase chunk overlap from 0 to 100 tokens, with 400-token chunks. Roughly how does the number of chunks change?

A, it stays the same, because overlap only changes what each chunk contains. B, it grows by about a third, because the stride falls from 400 to 300 tokens. C, it grows by a quarter, because 100 is a quarter of the 400-token chunk. D, it doubles, because every boundary region now appears in two chunks, not one.

[think]

The answer is B: it grows by about a third, because the stride falls from 400 to 300 tokens.

The chunk count is about the corpus length divided by the stride, which is the size minus the overlap. 400 over 300 is about 1.33, so a third more vectors to embed and store, not a quarter: the overlap shrinks the stride, and the count scales with one over the stride. Overlap protects facts at boundaries, at a predictable cost.

## 5

A golden set of five queries has the first relevant result at ranks 3, 1, 2, not found, and 1. What are the recall at 3, and the mean reciprocal rank?

A, recall 0.8 and mean reciprocal rank 0.567, with the missing query counted as zero. B, recall 1.0 and mean reciprocal rank 0.708, ignoring the query that was never found. C, recall 0.6 and mean reciprocal rank 0.458, counting only queries found at rank 1 or 2. D, recall 0.8 and mean reciprocal rank 0.708, averaging only the four queries found.

[think]

The answer is A: recall 0.8 and mean reciprocal rank 0.567, with the missing query counted as zero.

Four of the five queries have their answer in the top 3, so recall at 3 is 0.8. Mean reciprocal rank averages one over the rank across all five queries, with zero for the miss: a third, plus 1, plus a half, plus zero, plus 1, over 5, is about 0.567. Dropping the miss from the average inflates both metrics, and hides exactly the queries you need to fix.

## 6

A context packer has a budget of 1,500 tokens, and has taken 1,300. The next candidates are 610 tokens at score 0.55, and 150 tokens at score 0.20. What should a good packer do?

A, take the 610-token chunk, and truncate it to fit the remaining 200 tokens. B, take the 150-token chunk, since any context that fits improves the answer. C, stop at the first chunk that does not fit, so ranking order is preserved. D, skip both: one exceeds the budget, and the other is below the score floor.

[think]

The answer is D: skip both. One exceeds the budget, and the other is below the score floor.

The 610-token chunk would take the total to 1,910, and truncating a chunk mid-passage can cut off the answer. The 150-token chunk fits, but scores 0.20, so it is more likely to distract than help while costing tokens on every request; a score floor exists to refuse it. Stopping at the first misfit would be wrong in general, because a later, relevant, smaller chunk may still fit.

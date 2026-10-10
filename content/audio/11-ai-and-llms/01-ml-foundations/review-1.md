---
review: ml-foundations
source: 3b571d25f5a3c2dc
---
## Introduction

Twelve questions from the machine learning foundations module, two from each lesson: what a model is, neural networks, training and generalisation, classical models, embeddings, and vector search. Each has four options. Answer out loud before the answer comes.

## Question 1

Gradient descent on a line fit uses a learning rate of 0.2, and the loss goes 44.75, then 244, then 1,337, then 7,319. What is happening, and what do you change?

A, the mini-batch gradient is too noisy, so increase the batch size. B, outliers dominate the squared loss, so switch from squared error to absolute error. C, each step overshoots the minimum, so lower the learning rate. D, the model is underfitting, so add more parameters.

[think]

The answer is C: each step overshoots the minimum, so lower the learning rate. A loss that grows by a constant factor every step is the signature of a learning rate above 2 divided by the steepest curvature. Every update jumps past the minimum and lands further up the other side. Lowering the rate, here below about 0.12, fixes it; a bigger batch, a different loss or more parameters do not change the overshoot.

## Question 2

After three steps of gradient descent the loss is within about 6 percent of optimal, but the intercept takes hundreds more steps to settle. What is the most effective fix?

A, raise the learning rate so the intercept takes much bigger steps. B, switch to absolute error so large residuals stop dominating the intercept. C, keep training for more epochs until the intercept settles. D, standardise the input feature to zero mean and unit variance.

[think]

The answer is D: standardise the input feature. The slow crawl comes from a badly conditioned, long narrow valley, because an uncentred input tangles slope and intercept together. Standardising makes the curvature equal in every direction, so a single step at the right learning rate reaches the optimum. Raising the learning rate would make the steep direction diverge long before it speeds up the flat one, and more epochs only waits it out.

## Question 3

A colleague proposes a 12-layer network with no activation functions between the layers, to capture complex interactions. What is the problem?

A, it will overfit, because twelve layers give it far too many parameters. B, nothing, provided it is trained with Adam and a learning-rate schedule. C, it will train slowly, because gradients vanish through twelve layers. D, stacked linear layers collapse into one linear map, so depth adds nothing.

[think]

The answer is D: stacked linear layers collapse into one linear map. A linear function of a linear function is just another linear function, however many layers you stack. Without non-linearities, the network can only represent linear relationships. Vanishing gradients come from small activation slopes multiplied together, and this network has no activations at all.

## Question 4

A binary classifier's loss becomes infinite after hours of healthy training. The code computes the sigmoid of the score, and then minus the log of one minus that, for negative labels. What is the most likely cause?

A, the learning rate was too high and the weights overflowed. B, a confident score made the sigmoid round to exactly 1 in 32-bit floats. C, the dataset contains a label that is neither 0 nor 1. D, gradient clipping was disabled, so the gradient exploded.

[think]

The answer is B: a confident score made the sigmoid round to exactly 1. In 32-bit floats, the sigmoid reaches exactly 1.0 from a score of about 17, so a confidently wrong prediction on a negative example takes the log of zero. The fused loss that takes the raw scores, the logits, computes the same quantity stably. An overflow from the learning rate would usually show up as not-a-number in the weights first.

## Question 5

A model predicting next week's demand is validated with a random 80-20 split of three years of daily rows, and looks excellent. In production it is much worse. What is the most likely cause?

A, the learning rate was too high, so it overfit the training days. B, the model is too small to capture three years of weekly and seasonal patterns. C, the random split let it train on days after the ones it was validated on. D, 20 percent of the rows is too few days for a reliable estimate.

[think]

The answer is C: the random split let it train on the future. Each validation day was surrounded by training days on both sides, so the model was effectively interpolating between known neighbours. Production only ever predicts forward, which the random split never tested. Twenty percent of three years is hundreds of days, plenty for an estimate; the trouble is it estimated the wrong task. Split by time.

## Question 6

Ten scored examples have 4 positives and 6 negatives, and in 20 of the 24 positive-negative pairs the positive has the higher score. What is the ROC-AUC, and what does it not tell you?

A, about 0.83, and it says nothing about how well positives are ranked. B, about 0.83, and it says nothing about precision at the real base rate. C, 0.2, because it counts the fraction of pairs ordered wrongly. D, 0.4, because it equals recall at the best threshold.

[think]

The answer is B: about 0.83, and it is blind to the base rate. ROC-AUC is the probability that a random positive outranks a random negative, 20 out of 24 here. It is exactly a ranking measure, so option A gets it backwards. And the same curve gives 50 percent precision on this sample, but only 1.5 percent precision where 1 percent of traffic is positive.

## Question 7

In gradient boosting with squared-error loss, what does each new tree learn to predict?

A, the residuals of the whole current ensemble's predictions. B, the original target, independently of the other trees. C, the target, using a random subset of the features. D, the errors of the previous tree only, ignoring earlier trees.

[think]

The answer is A: the residuals of the whole ensemble. Each tree fits the target minus the ensemble's current prediction, which is exactly the negative gradient of squared error, and a shrunken copy is added. Fitting only the previous tree's errors would forget what earlier trees already corrected. Fitting the original target independently, on random feature subsets, is what a random forest does.

## Question 8

k-means with k of 2, on the points 1, 2, 3, 8, 9, 10 and 25, converges to centres 5.5 and 25 from one start, and to 2 and 13 from another. What does this show?

A, both are local optima, and the outlier can capture a whole cluster. B, the algorithm has a bug, since k-means converges to one answer. C, centres 2 and 13 are better, since they separate the real groups. D, k-means ignored the outlier, since squared distance down-weights it.

[think]

The answer is A: both are local optima, and the outlier can capture a whole cluster. The algorithm only guarantees a fixed point, which depends on where it starts. By its own objective, the outlier answer is better, 77.5 against 196, because squared distance amplifies far points rather than down-weighting them. Whether that answer is useful is a human judgement, which is why you inspect clusters.

## Question 9

In the worked contrastive batch at a temperature of 0.1, the query "cancel subscription" has similarity 0.55 to a wrong passage about refunds, and 0.3 to a wrong passage about payment cards. Which receives the larger push away?

A, the payment passage, since it is the least similar and most wrong. B, both equally, since in-batch negatives share the gradient evenly. C, the refunds passage, since its softmax probability is far higher. D, neither, since only the correct passage's similarity is updated.

[think]

The answer is C: the refunds passage. The push on each negative is its softmax probability divided by the temperature: about 0.75 for the refunds passage against about 0.06 for the payment one, twelve times more. Hard negatives carry the learning signal, and easy ones are already far away. An even split happens only at a high temperature, where the softmax is nearly uniform.

## Question 10

Your team upgrades to a better embedding model and embeds new documents with it, while the 50 million existing documents keep their old vectors. What happens to search quality?

A, it improves gradually as more documents get the better model's vectors. B, vectors from two unrelated spaces are compared, so results degrade. C, only the similarity threshold needs re-tuning for the new model. D, nothing changes, because both models output the same dimension.

[think]

The answer is B: two unrelated spaces are being compared. Each model's space is learned independently, and an equal dimension does not make their axes correspond. A query embedded with one model is being compared against vectors in an unrelated coordinate system. An upgrade means re-embedding the whole corpus, usually into a new index, before switching queries.

## Question 11

An IVF index with nprobe set to 1 misses a query's true nearest neighbour, even though that neighbour is very close to the query. What is the most likely reason?

A, the inverted lists are sorted by id rather than by distance. B, the neighbour sits in an adjacent cell, across the boundary. C, k-means placed the neighbour's vector in two separate cells. D, the coarse quantiser stores the vectors at lower precision.

[think]

The answer is B: the neighbour sits across the cell boundary. A query near a boundary is closest to one centroid, while its nearest neighbour was filed under the neighbouring cell, exactly as in the lesson's two-dimensional trace. Probing two cells finds it. Each vector lives in exactly one list, the flat variant stores full precision, and list order does not matter because every probed vector is scored.

## Question 12

After a year of updates, 40 percent of an HNSW index's nodes are tombstones. What do you expect to observe, and what is the usual fix?

A, faster queries, since dead nodes are skipped, so no action is needed. B, an immediate crash, since tombstoned nodes break the graph, so restore a backup. C, more distance computations per query, so rebuild the index and swap it in. D, wrong neighbours returned, since tombstones are still returned, so filter them.

[think]

The answer is C: more work per query, fixed by a rebuild and swap. Tombstoned nodes are still traversed, which keeps the graph connected, but never returned, so the search expands more nodes to collect enough live results. In the measured run, work rose from 128 to 229 distances per query at 60 percent deleted. Unlinking dead nodes without repair would fragment the graph instead.

## Recap

Three ideas kept coming back. First, read a symptom as a mechanism: a loss that grows by a constant factor means overshoot, a long crawl means poor conditioning, and an infinite loss on confident mistakes means the log was taken of a rounded probability. Second, honest measurement: split the way production will, remember that ROC-AUC ignores the base rate, and grade every vector index by recall against brute force. Third, structure decides the outcome: boosted trees fitting what the ensemble still gets wrong, hard negatives carrying the contrastive gradient, cell boundaries in IVF, and tombstones in a graph.

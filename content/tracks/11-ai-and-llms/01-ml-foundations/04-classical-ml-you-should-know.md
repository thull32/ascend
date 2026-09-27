---
slug: classical-ml-you-should-know
title: Classical ML you should know (and when not to use deep learning)
description: Logistic regression, decision trees, random forests, gradient boosting, k-NN and k-means, each worked with numbers, plus a decision table for when a 50-line baseline beats a neural network.
minutes: 18
difficulty: medium
tags: [machine-learning, logistic-regression, decision-trees, gradient-boosting, knn, k-means, clustering]
problems: []
---
Your support organisation wants to predict which tickets will escalate, using forty columns from the ticketing database: customer tier, product area, hours since the last release, number of previous escalations, a sentiment score, time of day. Someone proposes fine-tuning a transformer. On data shaped like this (rows and columns of mixed numbers and categories, tens of thousands of examples) a gradient-boosted tree ensemble will very likely match or beat it, train in minutes on a laptop, predict in microseconds, and tell you which features drove each decision.

Deep learning dominates text, images, audio and anything with rich sequential or spatial structure. Most business prediction problems are tabular, and there the classical toolbox still wins more often than not. A senior engineer knows these models well enough to run the right baseline in an afternoon, and to recognise when a proposal is reaching for a GPU it does not need.

## Logistic regression: the baseline you always run

Logistic regression is the single neuron from [Neural networks](/learn/ai-and-llms/ml-foundations/neural-networks): a weighted sum passed through a sigmoid, trained with cross-entropy.

$$p(\text{escalate}) = \sigma(w \cdot x + b) = \frac{1}{1 + e^{-(w \cdot x + b)}}$$

The weighted sum $z = w \cdot x + b$ is the **log-odds**, which gives the coefficients a precise meaning: increasing feature $j$ by one unit multiplies the odds by $e^{w_j}$. Suppose the trained model is $z = -3.0 + 1.2 \cdot \text{enterprise} + 0.8 \cdot \text{previous\_escalations}$.

- A self-serve customer with no history: $z = -3.0$, $p = \sigma(-3.0) = 0.047$.
- An enterprise customer with two previous escalations: $z = -3.0 + 1.2 + 1.6 = -0.2$, $p = 0.45$.
- Each previous escalation multiplies the odds by $e^{0.8} \approx 2.2$.

That interpretability is why logistic regression is still the default in credit scoring and anywhere a regulator can ask "why was this decision made". It trains in seconds on millions of rows, copes well with very high-dimensional sparse inputs (a bag of words with 100,000 columns), and produces reasonably calibrated probabilities. Its weakness is that it is linear in the features: it cannot discover that "enterprise *and* weekend" matters unless you create that interaction feature yourself.

## Decision trees: questions all the way down

A decision tree asks a sequence of yes/no questions about single features ("previous escalations ≤ 1?") and predicts the majority label of the training examples that end up in each leaf. It is built greedily, top-down: at each node, try every feature and every threshold, and choose the split that makes the two children **purest**.

Purity is usually measured with **Gini impurity**, $G = 1 - \sum_c p_c^2$, which is 0 for a node containing a single class and 0.5 for a 50/50 binary mix. Work one split:

- Parent node: 10 tickets, 6 escalated and 4 not. $G = 1 - 0.6^2 - 0.4^2 = 0.48$.
- Candidate A, split on `enterprise`: left has 5 tickets, all escalated ($G = 0$); right has 5 with 1 escalated ($G = 1 - 0.2^2 - 0.8^2 = 0.32$). Weighted by size: $0.5 \times 0 + 0.5 \times 0.32 = 0.16$. Gain $0.48 - 0.16 = 0.32$.
- Candidate B, split on `night_shift`: left 6 tickets (4 escalated, $G = 0.444$), right 4 (2 escalated, $G = 0.5$). Weighted: $0.6 \times 0.444 + 0.4 \times 0.5 = 0.467$. Gain 0.013.

The tree takes split A and recurses into each child until the leaves are pure or a depth limit stops it.

```viz
{"type": "ml", "algorithm": "decision-tree",
 "points": [[1,2,0],[2,1,0],[2,3,0],[3,2.5,0],[5,5,1],[6,4,1],[6,6,1],[7,5,1]],
 "title": "Growing a decision tree with Gini splits",
 "caption": "At each node every threshold on every feature is scored; the purest weighted split wins. Axis-aligned cuts are all a tree can make."}
```

Trees handle mixed numeric and categorical features, need no feature scaling, capture interactions automatically (a split under a split *is* an interaction) and are readable when shallow. Their weakness is variance. A deep tree can give every training example its own leaf and memorise the data perfectly, and small changes in the data produce a completely different tree. Production systems rarely ship a single deep tree; they ship ensembles.

## Random forests: averaging away the variance

A **random forest** trains hundreds of deep trees, each on a bootstrap sample of the rows (sampled with replacement) and, at every split, allowed to consider only a random subset of the features. Its prediction is the average (or majority vote) of the trees.

Why it works: averaging $B$ predictors that each have variance $\sigma^2$ and pairwise correlation $\rho$ gives variance $\rho\sigma^2 + (1 - \rho)\sigma^2 / B$. More trees shrink the second term toward zero; the random feature subsets decorrelate the trees and shrink the first. Each tree overfits in its own way, and the errors partly cancel.

Forests are the "hard to get wrong" default: few hyperparameters that matter, trees trained in parallel, and a built-in validation estimate from the rows each tree did not sample (**out-of-bag** error).

## Gradient boosting: fixing mistakes one tree at a time

**Gradient boosting** builds the ensemble sequentially. It starts from a constant prediction, then repeatedly fits a *small* tree to the errors of the ensemble so far and adds a shrunken copy of that tree. Work it with four examples, $x = (1, 2, 3, 4)$ and $y = (2, 4, 9, 11)$, depth-1 trees (stumps) and learning rate 0.5:

| Round | Residuals being fitted | Stump learned | Predictions after round | MSE |
|---|---|---|---|---|
| 0 | | constant: mean 6.5 | 6.5, 6.5, 6.5, 6.5 | 13.25 |
| 1 | −4.5, −2.5, 2.5, 4.5 | $x \le 2.5$: −3.5, else +3.5 | 4.75, 4.75, 8.25, 8.25 | 4.06 |
| 2 | −2.75, −0.75, 0.75, 2.75 | $x \le 2.5$: −1.75, else +1.75 | 3.875, 3.875, 9.125, 9.125 | 1.77 |
| 3 | −1.875, 0.125, −0.125, 1.875 | $x \le 1.5$: −1.875, else +0.625 | 2.94, 4.19, 9.44, 9.44 | 0.89 |

Each round, the stump is fitted to what the ensemble still gets wrong, and only half of its correction is applied. The first two rounds fix the big left/right difference; round 3 turns to the next largest remaining error, the gap between $x = 1$ and $x = 2$.

The name comes from the residuals: for squared error, the residual $y - \hat{y}$ is exactly the negative gradient of the loss with respect to the prediction. For any other differentiable loss (log loss for classification, a ranking loss for search) you fit each tree to the negative gradient instead. Boosting is gradient descent where each step is a tree rather than a nudge to a parameter vector.

Libraries such as XGBoost, LightGBM and CatBoost add regularised leaf values, clever handling of missing values and categorical features, and histogram-based split finding that makes training on millions of rows take minutes. The hyperparameters that matter are the number of trees, the learning rate, the tree depth, and early stopping on a validation set.

Why do boosted trees beat deep networks on tabular data so often? Tabular features are heterogeneous (dollars, counts, categories, timestamps, each on its own scale), the useful decision boundaries are often sharp thresholds ("more than 3 escalations"), datasets are small to medium, and there is no spatial or sequential structure for a neural architecture to exploit. Trees are built from exactly the kind of axis-aligned threshold those problems need.

## k-nearest neighbours: no training, all lookup

**k-NN** stores the training set. To classify a new point it finds the $k$ closest stored points and lets them vote. There is no training step and every prediction scans the data.

```viz
{"type": "ml", "algorithm": "knn", "k": 3, "query": [4, 3.5],
 "points": [[1,2,0],[2,1,0],[2,3,0],[3,2.5,0],[5,5,1],[6,4,1],[6,6,1],[7,5,1]],
 "title": "k-NN with k = 3",
 "caption": "The query sits between the clusters. Its three nearest neighbours are at distances 1.41, 1.80 and 2.06, and two of them are class 0."}
```

Three things bite in practice:

1. **Feature scaling.** Distance treats all features as comparable. Customer A has income 50,000 and age 30; B has income 51,000 and age 65; C has income 60,000 and age 31. Unscaled, A is 1,000 away from B and 10,000 from C, so the 35-year age gap counts for nothing. Standardise every feature first.
2. **Query cost.** Brute force is $O(n \cdot d)$ per query. Tree indexes (KD-trees) help at low dimension and stop helping above a few dozen dimensions.
3. **The curse of dimensionality.** In high dimensions, almost everything is far from everything. In a unit hypercube, the fraction of volume inside the inner cube of side 0.9 is $0.9^d$: 81% in 2 dimensions, 35% in 10, and 0.003% in 100. Nearly all the volume is near the surface, and the nearest and farthest neighbours of a point end up at similar distances. Nearest neighbours on raw, high-dimensional features become meaningless.

The modern form of k-NN avoids the curse by searching in a *learned* space where distance means something, using approximate indexes that do not scan everything. That is exactly embedding search, the subject of [Embeddings and similarity](/learn/ai-and-llms/ml-foundations/embeddings-and-similarity).

## k-means: finding groups without labels

All the models so far are **supervised**: they learn from labelled examples. **k-means** is **unsupervised**: given unlabelled points and a number $k$, it finds $k$ cluster centres. Lloyd's algorithm alternates two steps until nothing changes: assign each point to its nearest centre, then move each centre to the mean of its points. Each iteration costs $O(n \cdot k \cdot d)$ and never increases the total squared distance, so it converges, but only to a local optimum that depends on the starting centres.

```viz
{"type": "ml", "algorithm": "k-means", "k": 3,
 "points": [[1,1],[1.5,2],[2,1.2],[8,8],[8.5,9],[9,8.2],[1,8],[1.5,9],[2,8.4]],
 "title": "k-means: assign, then update",
 "caption": "Watch assignments stop changing; at that point the centroids stop moving and the algorithm has converged."}
```

Practical notes: use **k-means++** initialisation (spread the initial centres out) and several restarts; choose $k$ with the elbow of the inertia curve or a silhouette score, and sanity-check the clusters with a human; remember it assumes roughly round, similar-sized clusters and is dragged around by outliers and unscaled features. Uses you will meet in production include customer segmentation, grouping near-duplicate documents, and the coarse partitioning step inside vector indexes (an IVF index runs k-means over the vectors and searches only the few nearest partitions).

## When not to use deep learning

| Situation | Reach for | Why |
|---|---|---|
| Tabular data, thousands to millions of rows, mixed feature types | Gradient-boosted trees | Best accuracy per hour of effort; fast; handles missing values |
| Decisions must be explained to customers or regulators | Logistic regression, shallow trees, or boosted trees with per-prediction attributions | Coefficients and paths are auditable |
| Very few labels (hundreds) | Simple model on good features, pretrained embeddings plus logistic regression, or an LLM with a few examples in the prompt | Deep models need data or a pretrained starting point |
| Text, images, audio, long sequences | Pretrained deep models | They learn the representation that classical models need handed to them |
| Sub-millisecond CPU inference at high volume | Linear models or small tree ensembles | A tree ensemble predicts in microseconds; an LLM call takes hundreds of milliseconds and costs money per token |
| Grouping or exploring unlabelled data | k-means or clustering on embeddings | No labels needed |

Two habits separate engineers who ship ML from engineers who demo it. First, **always build the trivial baselines**: predict the majority class, predict last week's value, fit logistic regression. Report the fancy model's improvement over them, not in isolation. Second, **combine rather than choose**: a very common modern pattern embeds free text with a pretrained model and feeds those embeddings, alongside the tabular columns, into logistic regression or a boosted tree. You get much of the big model's language understanding at a fraction of its serving cost, since an embedding is computed once per text and the model that consumes it is tiny.

## Senior signals

- You run **logistic regression and a gradient-boosted tree baseline** before anyone proposes a neural network for tabular data, and you report improvements relative to them.
- You can explain boosting as **fitting each new tree to the negative gradient of the loss**, and random forests as **variance reduction through decorrelated averaging**.
- You **scale features** before any distance-based method and can explain the curse of dimensionality with a number, not a slogan.
- You weigh **explainability, latency and cost per prediction** alongside accuracy, and you know that an LLM call per classification can cost orders of magnitude more than a tree ensemble.
- You reach for **pretrained embeddings plus a simple model** as the bridge between unstructured text and classical ML.

## Check yourself

```quiz
- q: >-
    A node has 10 examples, 6 positive and 4 negative. Split A gives children (5 positive, 0 negative) and (1 positive, 4 negative). What is the weighted Gini impurity after split A?
  options: ["0.48", "0.32", "0.16", "0"]
  answer: 2
  explanation: >-
    The left child is pure (Gini 0); the right child has Gini 1 − 0.2² − 0.8² = 0.32. Weighting each by its share of examples gives 0.5 × 0 + 0.5 × 0.32 = 0.16. 0.48 is the parent's impurity and 0.32 is only the right child's.
- q: >-
    In gradient boosting with squared-error loss, what does each new tree learn to predict?
  options: ["The residuals of the current ensemble, which are the negative gradient of the loss with respect to its predictions", "The original target y", "The errors of the previous tree only, ignoring earlier trees", "A random subset of the features"]
  answer: 0
  explanation: >-
    Each tree fits y minus the whole ensemble's current prediction, the negative gradient of squared error. Its shrunken output is added to the ensemble. Fitting the original target is what a random forest's trees do; random feature subsets are also a forest technique.
- q: >-
    A k-NN model uses income (range 20,000 to 200,000) and age (18 to 90) without scaling. What happens?
  options: ["Age dominates because it has fewer distinct values", "Both contribute equally because Euclidean distance is symmetric", "k-NN automatically normalises features", "Income dominates the distance, so age is effectively ignored"]
  answer: 3
  explanation: >-
    Distances are computed in raw units, so a 1,000-dollar income difference outweighs a 35-year age difference. Standardising each feature puts them on a comparable scale. k-NN does no normalisation itself.
- q: >-
    Your product team wants a model to predict subscription cancellation from 30 account-level columns and 400,000 labelled rows. Which is the best first serious model?
  options: ["A fine-tuned large language model reading the columns as text", "A gradient-boosted tree ensemble, compared against a logistic regression baseline", "k-means with k = 2", "A deep convolutional network"]
  answer: 1
  explanation: >-
    Tabular, mixed-type data at this size is where boosted trees excel; logistic regression gives the baseline and an interpretable reference. An LLM would be slower, costlier and rarely more accurate here; k-means is unsupervised and ignores the labels; convolutions assume spatial structure the data does not have.
- q: >-
    Why do random forests restrict each split to a random subset of the features?
  options: ["To make each tree train faster, with no effect on accuracy", "To decorrelate the trees, so averaging them removes more variance", "To prevent any tree from reaching full depth", "To make the forest interpretable"]
  answer: 1
  explanation: >-
    Averaging reduces variance only to the extent that the trees' errors are uncorrelated; without feature subsampling, every tree would pick the same strong features and make similar mistakes. The speed-up is a side effect, and depth is controlled separately.
```

---
slug: classical-ml-you-should-know
title: Classical ML you should know (and when not to use deep learning)
description: Logistic regression trained by hand through three gradient steps, a decision-tree split scored with Gini and entropy, random forests' variance formula, boosting rounds traced to the leaf-value formula XGBoost uses, k-NN ties, k-means iterations and the outlier that steals a cluster, how the libraries make these fast, and a decision table for when a 50-line baseline beats a neural network.
minutes: 40
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

## Training logistic regression: the gradient, three steps

The loss is the mean cross-entropy, $L = -\frac{1}{n}\sum [y \ln p + (1 - y)\ln(1 - p)]$. The previous lesson showed that with a sigmoid output $\partial L / \partial z = p - y$ per example, so the gradients are

$$\frac{\partial L}{\partial w} = \frac{1}{n}\sum (p_i - y_i)\,x_i, \qquad \frac{\partial L}{\partial b} = \frac{1}{n}\sum (p_i - y_i).$$

That is the same shape as linear regression's gradient in [What a model is](/learn/ai-and-llms/ml-foundations/what-a-model-is), with the predicted probability in place of the predicted value. There is no closed form (setting it to zero gives equations with sigmoids in them), but the loss is convex, so gradient descent finds the single optimum.

Four tickets with one feature, previous escalations $x = (0, 1, 2, 3)$, escalated $y = (0, 0, 1, 1)$, start at $w = b = 0$ with $\eta = 1$:

| Step | $w$, $b$ | $p$ for $x = 0, 1, 2, 3$ | $\partial L/\partial w$ | $\partial L/\partial b$ | Loss |
|---|---|---|---|---|---|
| 1 | 0, 0 | 0.5, 0.5, 0.5, 0.5 | $\tfrac{1}{4}(0 + 0.5 - 1.0 - 1.5) = -0.5$ | $\tfrac{1}{4}(0.5 + 0.5 - 0.5 - 0.5) = 0$ | 0.693 |
| 2 | 0.5, 0 | 0.5, 0.622, 0.731, 0.818 | −0.116 | +0.168 | 0.545 |
| 3 | 0.616, −0.168 | 0.458, 0.610, 0.743, 0.843 | −0.094 | +0.164 | 0.506 |

After step 3, $w = 0.709$, $b = -0.331$, loss 0.471. The slope rises because positive examples have larger $x$; the intercept falls because the model now over-predicts the two negatives on average. Keep going and something instructive happens: this data is perfectly separable at $x = 1.5$, so the loss can always be lowered by scaling $w$ and $b$ up. After 1,000 steps $w = 7.3$, $b = -10.8$, the boundary $-b/w = 1.47$ has settled, and the weights are still growing. Without L2 regularisation they never stop, which is why scikit-learn's `LogisticRegression` applies an L2 penalty by default ($C = 1.0$, the inverse of $\lambda$) and why the [Training and generalisation](/learn/ai-and-llms/ml-foundations/training-and-generalisation) visualisation shows weights climbing after the boundary is found.

## Decision trees: questions all the way down

A decision tree asks a sequence of yes/no questions about single features ("previous escalations ≤ 1?") and predicts the majority label of the training examples that end up in each leaf. It is built greedily, top-down: at each node, try every feature and every threshold, and choose the split that makes the two children **purest**.

Purity is usually measured with **Gini impurity**, $G = 1 - \sum_c p_c^2$, which is 0 for a node containing a single class and 0.5 for a 50/50 binary mix. Work one split:

- Parent node: 10 tickets, 6 escalated and 4 not. $G = 1 - 0.6^2 - 0.4^2 = 0.48$.
- Candidate A, split on `enterprise`: left has 5 tickets, all escalated ($G = 0$); right has 5 with 1 escalated ($G = 1 - 0.2^2 - 0.8^2 = 0.32$). Weighted by size: $0.5 \times 0 + 0.5 \times 0.32 = 0.16$. Gain $0.48 - 0.16 = 0.32$.
- Candidate B, split on `night_shift`: left 6 tickets (4 escalated, $G = 0.444$), right 4 (2 escalated, $G = 0.5$). Weighted: $0.6 \times 0.444 + 0.4 \times 0.5 = 0.467$. Gain 0.013.

## Entropy, recursion and the limits of one tree

The alternative criterion is **entropy**, $H = -\sum_c p_c \log_2 p_c$, and the gain is called information gain. Same split: the parent has $H(0.6, 0.4) = 0.971$ bits; A's right child has $H(0.2, 0.8) = 0.722$, weighted 0.361, gain **0.610**; B's children have 0.918 and 1.0, weighted 0.951, gain **0.020**. The numbers differ, the ranking does not, and the two criteria pick the same split in the great majority of cases, because both are concave functions of the class proportions that peak at a 50/50 mix; Gini avoids a logarithm per evaluation, which is why it is the common default.

The tree takes split A and recurses into each child until the leaves are pure or a depth limit stops it.

```viz
{"type": "ml", "algorithm": "decision-tree",
 "points": [[1,2,0],[2,1,0],[2,3,0],[3,2.5,0],[5,5,1],[6,4,1],[6,6,1],[7,5,1]],
 "title": "Growing a decision tree with Gini splits",
 "caption": "At each node every threshold on every feature is scored; the purest weighted split wins. Axis-aligned cuts are all a tree can make."}
```

Trees handle mixed numeric and categorical features, need no feature scaling (a threshold on $x$ and on $\log x$ splits the same rows), capture interactions automatically (a split under a split *is* an interaction) and are readable when shallow. Their weakness is variance: a deep tree can give every training example its own leaf, and small changes in the data produce a completely different tree. Production systems rarely ship a single deep tree; they ship ensembles.

## Random forests: averaging away the variance

A **random forest** trains hundreds of deep trees, each on a bootstrap sample of the rows (sampled with replacement) and, at every split, allowed to consider only a random subset of the features. Its prediction is the average (or majority vote) of the trees.

Why it works: averaging $B$ predictors that each have variance $\sigma^2$ and pairwise correlation $\rho$ gives variance $\rho\sigma^2 + (1 - \rho)\sigma^2 / B$. Put numbers in with $\sigma^2 = 1$. At $\rho = 0.8$, 10 trees give 0.82 and 1,000 trees give 0.80: more trees barely help, because the floor is $\rho$. At $\rho = 0.3$, 100 trees give 0.307. Decorrelating the trees (the random feature subsets) lowers the floor; adding trees only approaches it. Each tree overfits in its own way, and the errors partly cancel.

Forests are the "hard to get wrong" default: few hyperparameters that matter, trees trained in parallel, and a built-in validation estimate from the rows each tree did not sample (**out-of-bag** error; a bootstrap sample misses about $1/e \approx 37\%$ of the rows).

## Gradient boosting: fixing mistakes one tree at a time

**Gradient boosting** builds the ensemble sequentially. It starts from a constant prediction, then repeatedly fits a *small* tree to the errors of the ensemble so far and adds a shrunken copy of that tree. Work it with four examples, $x = (1, 2, 3, 4)$ and $y = (2, 4, 9, 11)$, depth-1 trees (stumps) and learning rate 0.5:

| Round | Residuals being fitted | Stump learned | Predictions after round | MSE |
|---|---|---|---|---|
| 0 | | constant: mean 6.5 | 6.5, 6.5, 6.5, 6.5 | 13.25 |
| 1 | −4.5, −2.5, 2.5, 4.5 | $x \le 2.5$: −3.5, else +3.5 | 4.75, 4.75, 8.25, 8.25 | 4.06 |
| 2 | −2.75, −0.75, 0.75, 2.75 | $x \le 2.5$: −1.75, else +1.75 | 3.875, 3.875, 9.125, 9.125 | 1.77 |
| 3 | −1.875, 0.125, −0.125, 1.875 | $x \le 1.5$: −1.875, else +0.625 | 2.94, 4.19, 9.44, 9.44 | 0.89 |

Each round, the stump is fitted to what the ensemble still gets wrong, and only half of its correction is applied. The first two rounds fix the big left/right difference; round 3 turns to the next largest remaining error, the gap between $x = 1$ and $x = 2$. (The stump $x \le 3.5$ ties with $x \le 1.5$ at a squared error of 2.375 on the residuals; the trace keeps the first threshold scanned, as the exercise below does.)

The name comes from the residuals: for squared error, the residual $y - \hat{y}$ is exactly the negative gradient of the loss with respect to the prediction. For any other differentiable loss (log loss for classification, a ranking loss for search) you fit each tree to the negative gradient instead. Boosting is gradient descent where each step is a tree rather than a nudge to a parameter vector.

Why do boosted trees beat deep networks on tabular data so often? Tabular features are heterogeneous (dollars, counts, categories, timestamps, each on its own scale), the useful decision boundaries are often sharp thresholds ("more than 3 escalations"), datasets are small to medium, and there is no spatial or sequential structure for a neural architecture to exploit. Trees are built from exactly the kind of axis-aligned threshold those problems need.

## k-nearest neighbours: no training, all lookup

**k-NN** stores the training set. To classify a new point it finds the $k$ closest stored points and lets them vote. There is no training step and every prediction scans the data.

```viz
{"type": "ml", "algorithm": "knn", "k": 3, "query": [4, 3.5],
 "points": [[1,2,0],[2,1,0],[2,3,0],[3,2.5,0],[5,5,1],[6,4,1],[6,6,1],[7,5,1]],
 "title": "k-NN with k = 3",
 "caption": "The query sits between the clusters. Its three nearest neighbours are at distances 1.41, 1.80 and 2.06, and two of them are class 0."}
```

Check the visualisation's distances and you find a trap: the third-nearest place is a **tie**. $(2, 3)$, class 0, and $(6, 4)$, class 1, are both $\sqrt{4.25} = 2.06$ from the query. The visualisation keeps the one that appears first in the input, so the vote is 2–1 for class 0; list the points in another order and the prediction flips. Distance-weighted votes ($1/d$) do not rescue a truncated tie: keep $(6, 4)$ instead of $(2, 3)$ and class 1 wins $1/1.80 + 1/2.06 = 1.04$ against class 0's $1/1.41 = 0.71$. Production code either breaks ties by a stable key such as an ID or includes every point tied at the $k$-th distance; with all four included and $1/d$ weights, class 0 wins $1.19$ to $1.04$ whatever the input order.

Three more things bite in production:

1. **Feature scaling.** Distance treats all features as comparable. Customer A has income 50,000 and age 30; B has income 51,000 and age 65; C has income 60,000 and age 31. Unscaled, A is 1,000 away from B and 10,000 from C, so the 35-year age gap counts for nothing. Standardise every feature first.
2. **Query cost.** Brute force is $O(n \cdot d)$ per query. Tree indexes (KD-trees) help at low dimension and stop helping at around 20 dimensions, where queries degrade towards brute force; scikit-learn's `algorithm='auto'` [switches to brute force](https://scikit-learn.org/stable/modules/neighbors.html) above 15.
3. **The curse of dimensionality.** In a unit hypercube, the fraction of volume inside the inner cube of side 0.9 is $0.9^d$: 81% in 2 dimensions, 35% in 10, and 0.003% in 100. Nearly all the volume is near the surface, and the nearest and farthest neighbours of a point end up at similar distances.

The modern form of k-NN avoids the curse by searching in a *learned* space where distance means something, using approximate indexes that do not scan everything: [Embeddings and similarity](/learn/ai-and-llms/ml-foundations/embeddings-and-similarity) and [Vector search internals](/learn/ai-and-llms/ml-foundations/vector-search-internals).

## k-means: finding groups without labels

All the models so far are **supervised**: they learn from labelled examples. **k-means** is **unsupervised**: given unlabelled points and a number $k$, it finds $k$ cluster centres. Lloyd's algorithm alternates two steps until nothing changes: assign each point to its nearest centre, then move each centre to the mean of its points. Each iteration costs $O(n \cdot k \cdot d)$ and never increases the **inertia** (the total squared distance from points to their centres), so it converges, but only to a local optimum that depends on the starting centres.

Trace it on seven one-dimensional points, $\{1, 2, 3, 8, 9, 10, 25\}$, with $k = 2$ and initial centres 1 and 2:

| Iteration | Centres before | Assignment | New centres | Inertia |
|---|---|---|---|---|
| 1 | 1, 2 | {1} and {2, 3, 8, 9, 10, 25} | 1.0, 9.5 | 341.5 |
| 2 | 1.0, 9.5 | {1, 2, 3} and {8, 9, 10, 25} (boundary at 5.25) | 2.0, 13.0 | 196.0 |
| 3 | 2.0, 13.0 | unchanged (boundary at 7.5) | 2.0, 13.0 | 196.0, converged |

Now start from centres 1 and 25 instead. One iteration assigns {1, 2, 3, 8, 9, 10} to the first and {25} to the second, the centres become 5.5 and 25, and nothing changes after that: inertia **77.5**. Two lessons in one example. The result depends on the initialisation, and both answers are fixed points. And the lower-inertia answer, which is the better one by k-means' own objective, spends a whole cluster on a single outlier and lumps the two real groups together. With $k = 3$ you would get {1, 2, 3}, {8, 9, 10} and {25}.

**k-means++** initialisation picks the first centre at random and each next centre with probability proportional to its squared distance $D^2$ from the nearest centre chosen so far. From a first centre at 1 the squared distances are 0, 1, 4, 49, 64, 81 and 576 (total 775), so the outlier is picked second with probability $576/775 = 74\%$. That spreading is usually what you want, and here it is exactly what hands the outlier its own cluster.

```viz
{"type": "ml", "algorithm": "k-means", "k": 3,
 "points": [[1,1],[1.5,2],[2,1.2],[8,8],[8.5,9],[9,8.2],[1,8],[1.5,9],[2,8.4]],
 "title": "k-means: assign, then update",
 "caption": "Watch assignments stop changing; at that point the centroids stop moving and the algorithm has converged."}
```

Choose $k$ with the elbow of the inertia curve or a silhouette score, run several restarts and keep the lowest inertia, and sanity-check the clusters with a human. Uses you will meet in production include customer segmentation, grouping near-duplicate documents, and the coarse partitioning step inside vector indexes (an IVF index runs k-means over the vectors and searches only the few nearest partitions).

## Under the hood: how the libraries make these fast

**Histogram-based boosting.** A naive tree learner sorts every feature at every node. LightGBM, and XGBoost's `hist` method (its default in recent versions), instead bucket each feature once into at most a few hundred bins (255 by default in LightGBM). At a node, one pass over its rows adds each row's gradient into its bin; scoring every threshold is then a scan over a few hundred bins rather than over millions of rows. The **subtraction trick** halves the work again: a child's histogram equals the parent's minus its sibling's, so only the smaller child needs a pass over data.

**The leaf value is a Newton step.** XGBoost gives each leaf the value $-G/(H + \lambda)$, where $G$ and $H$ sum the first and second derivatives of the loss over the leaf's rows and $\lambda$ is L2 regularisation on leaf values. For squared error, $g_i = \hat{y}_i - y_i$ and $h_i = 1$, so with $\lambda = 0$ the leaf is the mean residual: in round 1 above, the left leaf has $G = 4.5 + 2.5 = 7$ and $H = 2$, giving $-3.5$, exactly the stump in the table. With $\lambda = 1$ it becomes $-7/3 = -2.33$: regularisation shrinks leaves that contain few rows the most. The split gain uses the same quantities, $\tfrac{1}{2}\big[G_L^2/(H_L + \lambda) + G_R^2/(H_R + \lambda) - G^2/(H + \lambda)\big] - \gamma$, with $\gamma$ a minimum gain per split.

**Prediction cost.** A boosted model of 500 trees of depth 6 visits 500 × 6 = 3,000 nodes per prediction, on the order of microseconds to tens of microseconds on one CPU core depending on how well the trees fit in cache. That is why tree ensembles run inside latency-critical paths such as fraud checks and ad ranking.

**k-means at scale.** scikit-learn's `KMeans` uses k-means++ initialisation by default, and in recent versions runs it only once unless you raise `n_init`, so restarts are something you ask for; mini-batch k-means updates centres from small random samples. Vector indexes take a related shortcut when clustering hundreds of millions of vectors for an IVF index: FAISS runs full k-means iterations (25 by default) on a random subsample of at most 256 training points per centroid.

## Choosing a model

| Situation | Reach for | Why |
|---|---|---|
| Tabular data, thousands to millions of rows, mixed feature types | Gradient-boosted trees | Best accuracy per hour of effort; fast; handles missing values |
| Decisions must be explained to customers or regulators | Logistic regression, shallow trees, or boosted trees with per-prediction attributions | Coefficients and paths are auditable |
| Very few labels (hundreds) | Simple model on good features, pretrained embeddings plus logistic regression, or an LLM with a few examples in the prompt | Deep models need data or a pretrained starting point |
| Text, images, audio, long sequences | Pretrained deep models | They learn the representation that classical models need handed to them |
| Sub-millisecond CPU inference at high volume | Linear models or small tree ensembles | A tree ensemble predicts in microseconds; an LLM call takes hundreds of milliseconds and costs money per token |
| Grouping or exploring unlabelled data | k-means or clustering on embeddings | No labels needed |

And the models against each other:

| Model | Training cost | Prediction cost | Needs scaling | Learns interactions | Extrapolates a trend | Interpretable |
|---|---|---|---|---|---|---|
| Logistic / linear regression | seconds | $O(d)$ | yes, for convergence and penalties | only ones you add | yes, linearly | coefficients |
| Single decision tree | seconds | $O(\text{depth})$ | no | yes | no, flat beyond the data | when shallow |
| Random forest | minutes, parallel | $O(B \cdot \text{depth})$ | no | yes | no | feature importance only |
| Gradient boosting | minutes, sequential | $O(B \cdot \text{depth})$ | no | yes | no | attributions per prediction |
| k-NN | none | $O(nd)$ brute force | yes | implicitly | no | by example |
| k-means | $O(nkd)$ per iteration | $O(kd)$ to assign | yes | not applicable | not applicable | centroids |

Two habits separate engineers who ship ML from engineers who demo it. First, **always build the trivial baselines**: predict the majority class, predict last week's value, fit logistic regression, and report the fancy model's improvement over them. Second, **combine rather than choose**: embed free text with a pretrained model and feed those embeddings, alongside the tabular columns, into logistic regression or a boosted tree. You get much of the big model's language understanding at a fraction of its serving cost.

## Failure modes in production

**A tree model that cannot see the future.** *Symptom:* a demand forecaster flat-lines when sales climb past anything in the training data. *Diagnosis:* trees predict leaf averages, so beyond the largest training value they return the last leaf; the boosted model above predicts 9.44 at $x = 4$ and exactly 9.44 at $x = 100$. *Fix:* model the trend separately (predict the change or the ratio to last period, or add a linear term), or use a linear model where extrapolation is the job.

**An ID column tops the feature importance.** *Symptom:* `customer_id` or `ticket_number` is the most important feature and validation looks great. *Diagnosis:* the tree is memorising entities, or the ID is correlated with time (sequential IDs) and leaks it; impurity-based importance is also biased towards high-cardinality features. *Fix:* drop identifiers, use permutation importance on a validation set, and split by group or time.

**Clusters that are one feature in disguise.** *Symptom:* customer segments differ only in income; age and usage are identical across clusters. *Diagnosis:* unscaled features, so the largest-range column dominates the distance. *Fix:* standardise, then check that each cluster's centroid differs on more than one feature.

**An outlier owns a cluster.** *Symptom:* one segment contains a handful of customers and two genuinely different groups are merged, as in the trace above. *Diagnosis:* squared distance lets one far point outweigh many near ones. *Fix:* remove or cap outliers first, try a larger $k$, or use a density-based or median-based method.

**Probabilities stuck at 0 and 1.** *Symptom:* a logistic regression outputs 0.9999 and 0.0001 with coefficients in the hundreds, and they swing wildly between retrains. *Diagnosis:* (quasi-)separable data or collinear features with no penalty, the unbounded growth traced above. *Fix:* L2 regularisation, and drop or merge collinear columns.

## Exercise

```exercise
id: best-gini-split
title: Find the best threshold split
prompt: |
  Given a numeric feature `xs` and binary labels `ys` (equal length, at
  least one element), find the best single threshold split, the way a
  decision tree does at one node.

  Candidate thresholds are the midpoints between consecutive *distinct*
  values of the sorted feature. A split sends `x <= t` left and `x > t`
  right. Its score is the weighted Gini impurity
  `(n_left / n) * G_left + (n_right / n) * G_right`, where
  `G = 1 - p1^2 - p0^2` for the labels on that side.

  Return `[t, score]` for the lowest score; on a tie keep the smallest `t`.
  If the feature has fewer than two distinct values there is no split:
  return `[null, G]` with the Gini impurity of all the labels
  (`None` in Python). Scores are compared to 6 decimal places.
languages: [python, javascript]
entry: best_split
starter:
  python: |
    def best_split(xs, ys):
        # your code here
        return [None, 0.0]
  javascript: |
    function best_split(xs, ys) {
      // your code here
      return [null, 0];
    }
tests:
  - args: [[1, 2, 3, 4], [0, 0, 1, 1]]
    expected: [2.5, 0]
    label: a perfect split
  - args: [[0, 0, 1, 1, 2, 3, 3, 4, 5, 6], [0, 0, 0, 0, 1, 1, 0, 1, 1, 1]]
    expected: [1.5, 0.166667]
    label: ten tickets by previous escalations
  - args: [[3, 1, 2], [1, 0, 1]]
    expected: [1.5, 0]
    label: unsorted input
  - args: [[1, 2, 3, 4], [0, 1, 0, 1]]
    expected: [1.5, 0.333333]
    label: a tie between two thresholds keeps the smaller
  - args: [[2, 2, 2], [0, 1, 1]]
    expected: [null, 0.444444]
    hidden: true
    label: no split possible
  - args: [[1, 1, 2, 2, 3], [0, 1, 0, 1, 1]]
    expected: [2.5, 0.4]
    hidden: true
    label: repeated feature values
  - args: [[5], [1]]
    expected: [null, 0]
    hidden: true
    label: a single example
hints:
  - "Sort the distinct values; each adjacent pair gives one candidate threshold (a + b) / 2."
  - "For each threshold, collect the labels on each side, compute each side's Gini and weight it by its share of the rows."
  - "Replace the best only when the new score is strictly lower, so ties keep the first (smallest) threshold."
```

## Interviewer follow-ups

**"Gini or entropy for tree splits?"** *Model answer:* they almost always choose the same split (on the worked example both prefer split A, 0.32 against 0.013 in Gini gain and 0.610 against 0.020 in information gain); Gini is cheaper because it has no logarithm; the depth limit, minimum leaf size and the ensemble method matter far more. *Common wrong answer:* a confident preference for one, with no mention that the ranking rarely differs.

**"Random forest or gradient boosting?"** *Model answer:* a forest averages deep, decorrelated trees in parallel to cut variance and is hard to misconfigure; boosting adds shallow trees sequentially to cut bias, usually wins on accuracy with tuning, and needs early stopping on a validation set because it will overfit if left running. *Common wrong answer:* "boosting is always better", with no mention of tuning or overfitting.

**"Why don't trees need feature scaling, and what can't they do?"** *Model answer:* a split is a threshold on one feature's order, so any monotone transform (scaling, logarithms) produces the same partitions; the flip side is that predictions are constant beyond the training range, so trees cannot extrapolate a trend. *Common wrong answer:* "trees normalise internally".

**"What is the gradient of logistic regression's loss, and why is it convex?"** *Model answer:* $\frac{1}{n}\sum(p_i - y_i)x_i$; the cross-entropy of a sigmoid is convex in $w$ (its Hessian is $\frac{1}{n}\sum p_i(1 - p_i)x_ix_i^\top$, positive semi-definite), so there is one optimum, although on separable data it is at infinity unless you regularise. *Common wrong answer:* "it has a closed form like linear regression".

**"How do you choose $k$ in k-means?"** *Model answer:* the elbow of inertia against $k$ and silhouette scores as guides, stability of the clusters across restarts and subsamples, and whether the clusters mean something to the people who will use them; k-means' own objective always improves with larger $k$, so it cannot choose $k$ on its own. *Common wrong answer:* "the $k$ with the lowest inertia", which is always $k = n$.

## What mid-level engineers get wrong

- **Skipping the baselines.** A neural network with 0.81 AUC means nothing until you know logistic regression gets 0.80.
- **Reading impurity-based feature importance as causation or as ground truth.** It is biased towards high-cardinality features and says nothing about cause; use permutation importance and domain sense.
- **Running k-means or k-NN on unscaled features.** The largest-range column silently decides everything.
- **Treating k-means clusters as facts about the data.** They depend on $k$, the initialisation and every outlier.
- **Using a tree ensemble to forecast growth.** It predicts the last leaf beyond the training range.
- **Calling an LLM per row for a tabular classification.** Hundreds of milliseconds and a per-token cost, against microseconds for a tree ensemble that is usually as accurate.

## Senior signals

- You run **logistic regression and a gradient-boosted tree baseline** before anyone proposes a neural network for tabular data, and you report improvements relative to them.
- You can explain boosting as **fitting each new tree to the negative gradient of the loss**, derive XGBoost's leaf value $-G/(H + \lambda)$ from it, and explain random forests as **variance reduction through decorrelated averaging** with the $\rho\sigma^2$ floor.
- You **scale features** before any distance-based method and can explain the curse of dimensionality with a number, not a slogan.
- You know k-means converges to **local optima that depend on initialisation and outliers**, and you check clusters for meaning and stability.
- You weigh **explainability, latency, extrapolation and cost per prediction** alongside accuracy, and you know that an LLM call per classification can cost orders of magnitude more than a tree ensemble.
- You reach for **pretrained embeddings plus a simple model** as the bridge between unstructured text and classical ML.

## Check yourself

```quiz
- q: >-
    A node has 10 examples, 6 positive and 4 negative. Split A gives children (5 positive, 0 negative) and (1 positive, 4 negative). What is the weighted Gini impurity after split A?
  options: ["0.48", "0.16", "0.32", "0.00"]
  answer: 1
  explanation: >-
    The left child is pure (Gini 0); the right child has Gini 1 − 0.2² − 0.8² = 0.32. Weighting each by its share of examples gives 0.5 × 0 + 0.5 × 0.32 = 0.16. 0.48 is the parent's impurity and 0.32 is only the right child's.
- q: >-
    In gradient boosting with squared-error loss, what does each new tree learn to predict?
  options: ["The residuals of the whole current ensemble's predictions", "The original target y, independently of the other trees", "The target y, using a random subset of the features", "The errors of the previous tree only, ignoring earlier trees"]
  answer: 0
  explanation: >-
    Each tree fits y minus the whole ensemble's current prediction, which is the negative gradient of squared error with respect to those predictions. Its shrunken output is added to the ensemble. Fitting only the previous tree's errors would forget what earlier trees already corrected; fitting the original target independently, on random feature subsets, is what a random forest's trees do.
- q: >-
    k-means with k = 2 on the points 1, 2, 3, 8, 9, 10 and 25 converges to centres 5.5 and 25 from one start, and to 2 and 13 from another. What does this show?
  options: ["Both are local optima, and the outlier can capture a whole cluster", "The algorithm has a bug, since k-means converges to one answer", "Centres 2 and 13 are better, since they separate the real groups", "k-means ignored the outlier, since squared distance down-weights it"]
  answer: 0
  explanation: >-
    Lloyd's algorithm only guarantees a fixed point, which depends on the starting centres. Centres 5.5 and 25 have inertia 77.5 against 196 for 2 and 13, so by k-means' own objective the outlier deserves its own cluster; squared distance amplifies far points rather than down-weighting them. Whether that answer is useful is a human judgement, which is why you inspect clusters.
- q: >-
    A k-NN model uses income (range 20,000 to 200,000) and age (18 to 90) without scaling. What happens?
  options: ["Both contribute equally because Euclidean distance is symmetric", "Neither dominates, since k-NN normalises features internally", "Income dominates the distance, so age is effectively ignored entirely", "Age dominates because it has fewer distinct values"]
  answer: 2
  explanation: >-
    Distances are computed in raw units, so a 1,000-dollar income difference outweighs a 35-year age difference. Standardising each feature puts them on a comparable scale. k-NN does no normalisation itself.
- q: >-
    A gradient-boosted model forecasts weekly sales well until sales grow beyond anything in the training history, then its forecast stays flat. Why?
  options: ["The model overfit the history and needs stronger regularisation", "The learning rate was too low for the new range of sales", "Trees predict leaf averages, so beyond the data they are constant", "Boosting needs feature scaling to handle values it has not seen"]
  answer: 2
  explanation: >-
    Every tree maps inputs above its last threshold to the same leaf, so the ensemble's prediction stops changing beyond the training range; it cannot extrapolate a trend. Modelling the change or ratio, or adding a linear component, fixes it. Regularisation and the learning rate change the fit inside the range, and trees are invariant to feature scaling.
- q: >-
    Why do random forests restrict each split to a random subset of the features?
  options: ["To make each tree's splits easier for a human to interpret", "To decorrelate the trees, so averaging removes more variance", "To stop any tree from reaching full depth, which limits overfitting", "To make each tree train faster, with no effect on accuracy"]
  answer: 1
  explanation: >-
    Averaging B trees gives variance ρσ² + (1 − ρ)σ²/B; the first term is a floor that more trees cannot lower, and only decorrelation (smaller ρ) does. Without feature subsampling every tree picks the same strong features and makes similar mistakes. The speed-up is a side effect, and depth is controlled separately.
```

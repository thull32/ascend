---
lesson: classical-ml-you-should-know
source: c7307a0d817709e7
fit: partial
desk:
  - "Logistic regression's three gradient steps, row by row"
  - "The Gini and entropy split calculations"
  - "The boosting rounds traced, and XGBoost's leaf-value and split-gain formulas"
  - "The k-NN tie and the k-means traces, including k-means plus plus"
  - "The two model-choice tables"
  - "Exercise: find the best Gini threshold split"
---
## Introduction

Your support organisation wants to predict which tickets will escalate, from forty columns in the ticketing database: customer tier, product area, hours since the last release, previous escalations, a sentiment score, time of day. Someone proposes fine-tuning a transformer.

On data shaped like this, rows and columns of mixed numbers and categories, tens of thousands of examples, a gradient-boosted tree ensemble will very likely match or beat it. It trains in minutes on a laptop, predicts in microseconds, and tells you which features drove each decision. Deep learning dominates text, images, audio and anything with rich sequential or spatial structure. Most business prediction problems are tabular, and there the classical toolbox still wins more often than not.

So, the toolbox: logistic regression, decision trees, forests and boosting, k-nearest neighbours, and k-means. For each, what it does, why it wins, and the trap it sets.

## Logistic regression: the baseline you always run

Logistic regression is the single neuron from the previous lesson: a weighted sum passed through a sigmoid, trained with cross-entropy. The weighted sum is the log-odds, and that gives every coefficient a precise meaning. Increase a feature by one unit and the odds are multiplied by e to the power of its coefficient.

Say the trained model has a coefficient of 0.8 on previous escalations. Each previous escalation then multiplies the odds of escalating by about 2.2. A self-serve customer with no history comes out at under 5 percent; an enterprise customer with two previous escalations at about 45 percent.

That interpretability is why logistic regression is still the default in credit scoring, and anywhere a regulator can ask why a decision was made. It trains in seconds on millions of rows, copes with a hundred thousand sparse columns, and gives reasonably calibrated probabilities. Its weakness: it is linear in the features, so it cannot discover that "enterprise and weekend" matters unless you build that combination yourself.

Its gradient has the same shape as linear regression's, with the predicted probability in place of the predicted value. There is no closed form, but the loss is a convex bowl, so gradient descent finds the one optimum. With one trap. On data that can be perfectly separated, the loss can always be lowered by scaling the weights up. In the lesson's four-ticket example, after a thousand steps the boundary has settled but the weights are still growing, and without L2 regularisation they never stop. That is why scikit-learn applies an L2 penalty by default.

## Trees, forests and boosting

A decision tree asks a sequence of yes-or-no questions about single features, like "previous escalations at most 1?", and predicts the majority label in each leaf. It is built greedily: at each node, try every feature and every threshold, and keep the split that makes the two children purest.

Purity is usually Gini impurity: zero for a node of one class, a half for a 50-50 mix. A parent of 10 tickets, 6 escalated, has an impurity of 0.48. Splitting on "enterprise" gives one pure child and one mostly-clean child, cutting it to 0.16. Splitting on "night shift" barely moves it. The alternative, entropy, gives different numbers but the same ranking, and the two almost always pick the same split. Gini skips a logarithm, so it is the common default.

Trees handle mixed features and need no scaling, because a threshold on a value and on its logarithm splits the same rows. They capture interactions automatically, since a split under a split is an interaction. Their weakness is variance: a deep tree can give every example its own leaf, and small changes in the data produce a completely different tree. So production ships ensembles.

A random forest trains hundreds of deep trees, each on a random resample of the rows and allowed to consider only a random subset of features at each split, then averages them. Here is why that subset matters. Averaging correlated predictors leaves a floor on the variance equal to their correlation. With trees correlated at 0.8, ten trees and a thousand trees land in the same place, about 0.8 of a single tree's variance. More trees only approach the floor; decorrelating them lowers it. Forests are the hard-to-get-wrong default, with a free validation estimate from the roughly 37 percent of rows each tree never saw.

Gradient boosting builds the ensemble sequentially. Start from a constant, the mean. Then fit a small tree to what the ensemble still gets wrong, and add a shrunken copy of it, say half its correction. Repeat. In the lesson's trace on four points, the first rounds fix the big left-versus-right difference, and the third round turns to the next largest remaining error. For squared error, those residuals are exactly the negative gradient of the loss, and for any other loss you fit the negative gradient instead. Boosting is gradient descent where each step is a tree.

Why do boosted trees beat deep networks on tabular data so often? The features are heterogeneous, dollars, counts, categories, each on its own scale. The useful boundaries are often sharp thresholds, like "more than 3 escalations". The datasets are small to medium. And there is no spatial or sequential structure for a neural architecture to exploit. Trees are built from exactly the axis-aligned thresholds those problems need.

## k-nearest neighbours

k-nearest neighbours stores the training set, and to classify a new point it finds the k closest stored points and lets them vote. No training, all lookup.

It has a trap even on the lesson's tiny example. With k of 3, the third-nearest place is a tie: one point of each class at exactly the same distance. Whichever the code happens to keep decides the vote, so listing the points in another order flips the prediction. Production code breaks ties by a stable key such as an ID, or includes every point tied at the k-th distance.

Three more things bite. Scaling: distance treats every feature as comparable, so with income in the tens of thousands and age in years, a thousand-dollar income gap outweighs a 35-year age gap. Standardise first. Query cost: brute force scans everything, and tree indexes stop helping at around 20 dimensions. And the curse of dimensionality. Take the inner cube of side 0.9 inside a unit cube. In 2 dimensions it holds 81 percent of the volume; in 10 dimensions, 35 percent; in 100 dimensions, 0.003 percent. Nearly all the volume is near the surface, and a point's nearest and farthest neighbours end up at similar distances. The modern form of k-nearest neighbours escapes this by searching a learned space with approximate indexes, which is where the next two lessons go.

## k-means and the outlier

Everything so far is supervised, learning from labels. k-means is unsupervised: given unlabelled points and a number k, find k cluster centres. It alternates two steps until nothing changes. Assign each point to its nearest centre. Move each centre to the mean of its points. Each round never makes the total squared distance worse, so it converges, but only to a local optimum that depends on where it started.

The lesson's example is seven numbers on a line: 1, 2, 3, then 8, 9, 10, then 25, with k of 2. Start the centres at 1 and 2, and it settles on 2 and 13: the first group, and everything else. Start them at 1 and 25 instead, and it settles on 5.5 and 25: the outlier alone, and both real groups lumped together.

Before I tell you: which of those two answers does k-means itself consider better?

[pause]

The second one. Its total squared distance is 77.5, against 196. By its own objective, the outlier deserves a whole cluster, because squared distance lets one far point outweigh many near ones. And the standard smart initialisation, k-means plus plus, picks spread-out starting centres, here choosing the outlier second about 74 percent of the time. Usually that spreading is what you want. Here it hands the outlier its own cluster. With k of 3, you would get the three groups you expected.

So choose k with the elbow of the inertia curve or a silhouette score, run several restarts, cap outliers, and have a human sanity-check the clusters. You will meet k-means inside vector indexes too: an IVF index runs it to partition the vectors.

## Under the hood, and choosing a model

The libraries make boosting fast with histograms. Instead of sorting every feature at every node, LightGBM and XGBoost bucket each feature once into a few hundred bins, so scoring every threshold is a scan over bins rather than millions of rows. And a child's histogram is the parent's minus its sibling's, so only the smaller child needs a pass over the data. XGBoost's leaf value is a Newton step, and for squared error with no penalty it is simply the mean residual in the leaf; regularisation shrinks the leaves with few rows the most. A model of 500 trees of depth 6 visits 3 thousand nodes per prediction, microseconds to tens of microseconds on one core, which is why tree ensembles sit inside fraud checks and ad ranking.

Choosing comes down to the situation. Tabular data with mixed types: gradient-boosted trees. Decisions explained to regulators: logistic regression or shallow trees. Very few labels: a simple model on good features, or pretrained embeddings plus logistic regression. Text, images and audio: pretrained deep models. Sub-millisecond inference at high volume: linear models or small tree ensembles, against hundreds of milliseconds and a per-token cost for a language model call.

Two habits separate engineers who ship machine learning from engineers who demo it. Always build the trivial baselines: the majority class, last week's value, logistic regression, and report the fancy model against them. And combine rather than choose: embed the free text with a pretrained model and feed those embeddings, alongside the tabular columns, into a boosted tree.

The production failures follow from the mechanisms. A tree model flat-lines when sales climb past the training range, because beyond the last threshold every tree returns the same leaf; the lesson's boosted model predicts 9.44 at x equals 4, and exactly 9.44 at x equals 100. A customer ID tops the feature importance, because the tree is memorising entities or the ID leaks time. Clusters that differ only in income, because nobody scaled. And logistic probabilities stuck at 0 and 1, with coefficients in the hundreds, from separable data with no penalty.

## In the interview

A follow-up the lesson expects. Random forest or gradient boosting?

[pause]

A forest averages deep, decorrelated trees in parallel to cut variance, and it is hard to misconfigure. Boosting adds shallow trees one after another to cut bias. It usually wins on accuracy with tuning, and it needs early stopping on a validation set, because left running it will overfit. The weak answer is "boosting is always better", with no mention of tuning or overfitting.

And: why don't trees need feature scaling, and what can't they do? A split is a threshold on one feature's order, so any order-preserving transform gives the same partitions. The flip side is that predictions are constant beyond the training range, so trees cannot extrapolate a trend.

## Recap

Four things to remember. On tabular data, run logistic regression and a gradient-boosted tree before anyone proposes a neural network, and report against them. Forests cut variance by averaging decorrelated trees, with a floor set by their correlation; boosting fits each new tree to the negative gradient of the loss. Distance-based methods, k-nearest neighbours and k-means, need scaled features, and k-means converges to local optima that depend on the start and on every outlier. And trees cannot extrapolate: beyond the data they return the last leaf.

At your desk: the logistic regression steps, the Gini and entropy calculations, the boosting trace and XGBoost's formulas, the k-nearest-neighbour tie and k-means traces, the model-choice tables, and the best-split exercise.

---
lesson: classical-ml-you-should-know
source: a82fdc14489c2de9
---
## 1

A decision-tree node has 10 examples, 6 positive and 4 negative. A split gives one child with 5 positives and no negatives, and another with 1 positive and 4 negatives. What is the weighted Gini impurity after the split?

A, 0.48. B, 0.16. C, 0.32. D, zero.

[think]

The answer is B: 0.16.

The left child is pure, so its Gini is zero. The right child's Gini is one minus 0.2 squared minus 0.8 squared, which is 0.32. Each child holds half the examples, so the weighted impurity is half of zero plus half of 0.32, which is 0.16. 0.48 is the parent's impurity, and 0.32 is only the right child's.

## 2

In gradient boosting with squared-error loss, what does each new tree learn to predict?

A, the residuals of the whole current ensemble's predictions. B, the original target, independently of the other trees. C, the target, using a random subset of the features. D, the errors of the previous tree only, ignoring earlier trees.

[think]

The answer is A: the residuals of the whole current ensemble's predictions.

Each tree fits the target minus the whole ensemble's current prediction, which is the negative gradient of squared error with respect to those predictions, and its shrunken output is added to the ensemble. Fitting only the previous tree's errors would forget what earlier trees already corrected. Fitting the original target independently, on random feature subsets, is what a random forest's trees do.

## 3

k-means with k equals 2, on the points 1, 2, 3, 8, 9, 10 and 25, converges to centres 5.5 and 25 from one start, and to centres 2 and 13 from another. What does this show?

A, both are local optima, and the outlier can capture a whole cluster. B, the algorithm has a bug, since k-means converges to one answer. C, centres 2 and 13 are better, since they separate the real groups. D, k-means ignored the outlier, since squared distance down-weights it.

[think]

The answer is A: both are local optima, and the outlier can capture a whole cluster.

Lloyd's algorithm only guarantees a fixed point, which depends on the starting centres. Centres 5.5 and 25 have an inertia of 77.5, against 196 for 2 and 13, so by k-means' own objective the outlier deserves its own cluster; squared distance amplifies far points rather than down-weighting them. Whether that answer is useful is a human judgement, which is why you inspect clusters.

## 4

A k-nearest-neighbours model uses income, ranging from 20,000 to 200,000, and age, from 18 to 90, without scaling. What happens?

A, both contribute equally, because Euclidean distance is symmetric. B, neither dominates, since the model normalises features internally. C, income dominates the distance, so age is effectively ignored. D, age dominates, because it has fewer distinct values.

[think]

The answer is C: income dominates the distance, so age is effectively ignored.

Distances are computed in raw units, so a 1,000-dollar difference in income outweighs a 35-year difference in age. Standardising each feature puts them on a comparable scale. k-nearest neighbours does no normalisation itself.

## 5

A gradient-boosted model forecasts weekly sales well, until sales grow beyond anything in the training history. Then its forecast stays flat. Why?

A, the model overfit the history and needs stronger regularisation. B, the learning rate was too low for the new range of sales. C, trees predict leaf averages, so beyond the data they are constant. D, boosting needs feature scaling to handle values it has not seen.

[think]

The answer is C: trees predict leaf averages, so beyond the data they are constant.

Every tree maps inputs above its last threshold to the same leaf, so the ensemble's prediction stops changing beyond the training range; it cannot extrapolate a trend. Modelling the change or the ratio, or adding a linear component, fixes it. Regularisation and the learning rate change the fit inside the range, and trees are unaffected by feature scaling.

## 6

Why do random forests restrict each split to a random subset of the features?

A, to make each tree's splits easier for a human to interpret. B, to decorrelate the trees, so averaging removes more variance. C, to stop any tree from reaching full depth, which limits overfitting. D, to make each tree train faster, with no effect on accuracy.

[think]

The answer is B: to decorrelate the trees, so averaging removes more variance.

The variance of an average of trees has two parts: one shrinks as you add trees, and the other, the correlation between trees times a single tree's variance, is a floor that more trees cannot lower. Only decorrelating the trees lowers it. Without feature subsampling, every tree picks the same strong features and makes similar mistakes. The speed-up is a side effect, and depth is controlled separately.

---
lesson: what-a-model-is
source: f6961401c7a95840
---
## 1

Gradient descent on a line fit uses a learning rate of 0.2, and the loss goes 44.75, then 244, then 1,337, then 7,319. What is happening, and what do you change?

A, the mini-batch gradient is too noisy; increase the batch size. B, outliers dominate the squared loss; switch from mean squared error to mean absolute error. C, each step overshoots the minimum; lower the learning rate. D, the model is underfitting the data; add more parameters so it can fit.

[think]

The answer is C: each step overshoots the minimum, so lower the learning rate.

A loss that grows by a constant factor every step is the signature of a learning rate above 2 divided by the largest curvature. Every update jumps past the minimum and lands further up the other side. Lowering the rate, here below about 0.12, fixes it. More parameters, a different loss or a bigger batch do not change the overshoot.

## 2

Fitting a line by gradient descent, after three steps the loss is within about 6 percent of optimal, but the intercept takes hundreds more steps to settle. What is the most effective fix?

A, raise the learning rate, so the intercept takes much bigger steps. B, switch to mean absolute error, so large residuals stop dominating the intercept. C, keep training for more epochs until the intercept settles. D, standardise the input feature to zero mean and unit variance.

[think]

The answer is D: standardise the input feature to zero mean and unit variance.

The slow crawl comes from a badly conditioned, long narrow valley, because an uncentred input tangles slope and intercept together. Standardising makes the curvature 2 in every direction, so a single step at a learning rate of 0.5 reaches the optimum. Raising the learning rate would make the steep direction diverge long before it speeds up the flat one, and more epochs only waits it out.

## 3

Your runtime history contains one 90-minute job, caused by a node failure, among hundreds of jobs taking 3 to 10 minutes. With mean squared error, what happens to the fitted line?

A, it barely moves, because one point among hundreds has negligible weight. B, it ignores the point, because gradient descent discounts points it cannot fit. C, it is pulled toward the outlier, because squaring amplifies large errors. D, it fails to converge, because the outlier makes the loss surface non-convex.

[think]

The answer is C: it is pulled toward the outlier, because squaring amplifies large errors.

Squaring makes an error of 80 minutes cost as much as 6,400 errors of 1 minute, so the optimum shifts noticeably toward the outlier; under squared error, one point among hundreds is not negligible. Mean absolute error, a robust loss such as Huber, or cleaning the data are the usual remedies. The optimisation still converges fine, because squared error on a line is a convex bowl; it just converges to a worse line.

## 4

Why do large-scale training runs use mini-batch gradients, rather than the exact gradient over the full dataset?

A, full-batch gradients cannot be computed for deep neural networks. B, the exact gradient costs a full pass over all the data for every update. C, mini-batch gradients are more accurate than the exact full-batch one. D, mini-batches remove the need to choose and tune a learning rate.

[think]

The answer is B: the exact gradient costs a full pass over all the data for every update.

At trillions of examples, a full pass per update is infeasible. The mini-batch gradient is noisier, not more accurate, but it is an unbiased estimate whose cost does not grow with the dataset, so you get millions of cheap updates instead of a handful of exact ones. Full-batch gradients can be computed for any differentiable model; they are just too expensive per step, and mini-batch training still needs a learning rate.

## 5

A model fitted on jobs of 1 to 4 million rows predicts 211 minutes for a 100-million-row job. What is the right senior reaction?

A, retrain with a lower learning rate, so the line generalises to bigger jobs. B, add more parameters, so the model can represent very large jobs. C, trust it, because the line fits the training data almost perfectly. D, treat it as an extrapolation beyond the training range, and add a guard.

[think]

The answer is D: treat it as an extrapolation beyond the training range, and add a guard.

A good fit inside the data range says nothing about behaviour far outside it; effects such as disk spill never appeared in training. The right move is to detect out-of-range inputs and fall back or flag them, and to collect data in that range. The learning rate and the parameter count are irrelevant to missing evidence.

## 6

You plan to train a 7-billion-parameter model with Adam in mixed precision. Roughly how much memory do the weights, gradients and optimiser state need, before activations?

A, about 14 gigabytes, the size of the 16-bit weights. B, about 28 gigabytes, the weights plus their gradients. C, about 56 gigabytes, the 32-bit weights plus gradients. D, about 112 gigabytes, around 16 bytes per parameter.

[think]

The answer is D: about 112 gigabytes, around 16 bytes per parameter.

Mixed-precision Adam holds 16-bit weights and gradients, 4 bytes per parameter, plus a 32-bit master copy and the two moment estimates, another 12 bytes. That is about 16 bytes per parameter, or 112 gigabytes for 7 billion. The 14 gigabyte figure is what serving the 16-bit weights needs, which is why training needs several accelerators when inference fits on one.

---
lesson: training-and-generalisation
source: b83a1e1a4e8847be
fit: partial
desk:
  - "The bias-variance decomposition and the simulation code behind its table"
  - "The leave-one-out cross-validation table, fold by fold"
  - "The regularisation table across seven penalty strengths"
  - "The ROC sweep on ten examples, and the area computed both ways"
  - "Exercises: precision, recall and F1, and ROC-AUC as a ranking probability"
---
## Introduction

A churn model scores 97 percent accuracy on the validation set. The team celebrates. In production it is barely better than guessing. The post-mortem finds one feature, days since the last support ticket, computed from a support table that included the cancellation ticket itself. In the history, "has a ticket from yesterday" almost perfectly meant "has already churned". The model did not learn to predict churn. It learned to read the answer off a leaked column.

Minimising the training loss is not the goal. The goal is low error on data the model has never seen, drawn from what it will face in production. The difference is the generalisation gap, and almost every expensive machine learning failure is a failure to measure it honestly or to control it.

Four ideas: overfitting and what bias and variance really mean, how to split data so the estimate stays honest, leakage, and the metrics that tell you whether a classifier is any use.

## Perfect on training, wrong on everything else

Training loss is always optimistic, because the optimiser was actively pushing it down. A flexible model can drive it to zero by memorising.

The lesson's example: six points from the true relationship "y equals x", plus a little noise. Fit a straight line, with 2 parameters, and a degree-5 polynomial, with 6 parameters, which can pass exactly through all six points. The polynomial's training error is zero. On fresh points between them, its error is 16 times the line's. And outside the data it is catastrophic: at x equals 7, where the truth is 7, the line says about 7 and the polynomial says 69. It spent its extra parameters fitting the noise, with huge coefficients of alternating sign cancelling each other, where the truth has one slope of 1.

That is overfitting: low training error, high error on new data. Underfitting is the opposite: a model too rigid for the pattern, so training and validation error are both high.

"Fitting the noise" has a precise meaning. Imagine redrawing the training set many times from the same process and refitting each time. The expected error at a test point splits into three parts. Bias: how far the average fitted model is from the truth, because the family is too rigid. Variance: how much the fit moves when the sample changes, because the family is flexible enough to follow the noise. And noise in the labels, which no model removes.

The lesson measured all three, over 4 thousand redrawn training sets. A constant model is pure bias, about 2, with tiny variance. The line, and polynomials of degree 3 and 5, all contain the true line, so their bias is zero. The only thing their extra parameters buy is variance: about 0.01 for the line, 0.02 for degree 3, 0.06 for degree 5. And that variance is not spread evenly. It is largest at the edges of the data, which is why flexible models fail first at the edges and worst beyond them.

So the diagnosis is simple. Training and validation error both high: underfitting, so a bigger model or better features. Training low and validation much higher: overfitting, so more data, regularisation, a smaller model, or early stopping. Both low and production bad: distribution shift or leakage.

## Three sets, and splitting like production

Three sets, three jobs. The training set fits the parameters. The validation set is for your choices: learning rate, model size, features, when to stop. The optimiser never sees it, but you do. And the test set is touched once, at the end, for the number you will stand behind.

Why is a train-test pair not enough? Try 200 hyperparameter settings and keep the best validation score, and that score is the maximum of 200 noisy estimates. It is biased upward. The test set exists so that one number has not been optimised against. Peek at it and go back to tuning, and it becomes a second validation set.

With small data, one validation split is noisy, so k-fold cross-validation trains k times, each time holding out a different slice, and reports the mean and the spread. On the six points, holding out one point at a time, cross-validation picks the straight line, which is the true model. The individual fold errors varied by more than a hundred times; any single split could have told a different story. Five or ten folds is the usual compromise for tabular models. Large neural networks rarely afford it and use one big validation set instead.

The bigger point: split the way production will. If you predict next month from the past, split by time: train on January to September, validate on October, test on November. A random split lets the model learn from the future. If one user contributes 500 rows, put all of them on one side. And watch for near-duplicates across the split; for large language models that problem is called benchmark contamination, test questions that leaked into the pretraining crawl.

## Leakage

Leakage is any path by which information unavailable at prediction time reaches the model during training. It is the most expensive bug in machine learning, because it produces great offline numbers, so nobody investigates until production disagrees.

Target leakage is a feature that is a consequence of the label: "refund issued" when predicting fraud, or the churn ticket from the opening. Temporal leakage is an aggregate computed over the whole history, including rows after the prediction time. Preprocessing leakage is fitting a scaler or an encoder on all the data before splitting: usually mild, but severe for target encoding, where each row's encoding contains its own label. And training-serving skew is not strictly leakage, but it has the same symptom: good offline, bad online.

The single best test for every feature: would I know this value, exactly as computed, at the moment I have to make the prediction? And the single best smell: a validation score that is too good, or one feature that dominates the importance chart.

## Regularisation

Regularisation is anything that trades a little training fit for better generalisation. L2 regularisation, also called weight decay, adds a penalty on large weights, so every update first shrinks every weight a little, then applies the usual gradient. Weights the data does not actively support decay toward zero. L1 pushes unhelpful weights to exactly zero, which doubles as feature selection. Early stopping keeps the checkpoint where validation loss bottomed out. Dropout randomly zeroes hidden units during training so no unit can rely on another. And more data is the most reliable regulariser of all.

The lesson measured it on the degree-5 polynomial. Read it as a dial. With no penalty, training error is zero and test error is 0.113. Add a small penalty and the squared size of the coefficients collapses from about 288 thousand to under a hundred, and test error falls below 0.01. Training error only ever rises, because the penalty stops the fit from reaching the points. Turn the dial too far and test error climbs again, because now the model cannot follow even the real slope. That U-shape is the bias-variance trade-off with a dial on it, and cross-validation finds its bottom.

One note on very large models. They can have far more parameters than examples, fit random labels perfectly, and still generalise well; test error can even fall again as models grow past the point of fitting the training set, called double descent. Pretraining is usually limited by data and compute, not classical overfitting. But fine-tuning on a small dataset overfits exactly as that table says, within a few epochs.

## Metrics that mean something

A fraud model scores 10 thousand transactions, of which 100 are fraud. It flags 150, and 80 of those are real fraud.

Its accuracy is 99.1 percent. A model that never flags anything scores 99.0. On imbalanced problems, which is most of the interesting ones, accuracy is nearly useless. Precision asks: of what you blocked, how much deserved it? 80 out of 150, about 0.53. Recall asks: of the fraud that happened, how much did you catch? 80 out of 100, 0.8.

The model outputs a score, and you choose the threshold. That is a business calculation. Say a missed fraud costs 500 dollars and a false flag costs 5. The lower threshold, flagging 150, costs about 10 thousand dollars. A higher threshold, flagging 90, has much better precision, 0.78, and costs about 15 thousand, because it misses more fraud. Put the costs in writing and the threshold becomes arithmetic.

For a threshold-free summary there is ROC-AUC, and here is the meaning to hold on to: it is the probability that a random positive outranks a random negative. A random scorer gets 0.5, a perfect one 1. On the lesson's ten examples, the positive scores higher in 20 of the 24 positive-negative pairs, so the AUC is about 0.83.

Before I tell you what it hides: this model, at its middle threshold, catches three quarters of positives and wrongly flags half the negatives. On a balanced sample, precision is 50 percent. What happens to precision when only 1 percent of real traffic is positive?

[pause]

It collapses to 1.5 percent. Of 10 thousand events, it catches 75 real positives and flags almost 5 thousand false ones. The ROC curve did not change. The usefulness did. That is why rare-event problems report precision at a fixed recall, or the area under the precision-recall curve, and why calibration matters whenever code multiplies probabilities by money.

## Failures in production

Under the hood, a library pipeline refits every preprocessing step inside each training fold, which prevents preprocessing leakage. And AdamW applies weight decay directly to the weights, because plain Adam would scale the decay down for parameters with large gradients; that is why transformers train with AdamW.

The production failures map onto everything above. A validation score that is too good: rank features by importance, ask the top one "would I know this at prediction time?", and compute every feature as of the prediction timestamp. A random split on time-series data: a forecaster validated at 4 percent error runs at 15 in production. A threshold tuned on a rebalanced 50-50 test set: the fraud queue floods at the real 1 percent base rate. A validation set worn out by hundreds of decisions: rotate in fresh data, and treat the online A/B test as the judge. And silent distribution shift, where labels arrive too late to show it: monitor input and prediction distributions against the training reference.

## In the interview

Here is a follow-up the lesson expects. Your model has a ROC-AUC of 0.95. Is it good?

[pause]

It ranks well. But AUC says nothing about precision at the base rate, or about calibration. At 1 percent positives, a model with that AUC can still have single-digit precision at a useful recall. Ask for precision at the operating recall on data with the production base rate, and the cost of each error type. The weak answer is "yes, anything above 0.9 is excellent".

And another: when does more data not help? When the error is bias, not variance. The constant model's bias of 2 does not shrink with more points; only a richer model or better features fix it. More data also does not fix leakage, systematic label noise, or a mismatch between training and production.

## Recap

Four things to remember. Error splits into bias, variance and noise; more data and regularisation attack variance, not bias. Split the way production will, by time or by user, and keep one test set nobody tunes against, because the best of 200 validation runs is optimistic. Treat a score that is too good as a bug report, and ask of every feature whether you would know it at prediction time. And refuse accuracy on imbalanced problems: ROC-AUC is a ranking probability blind to the base rate, and the threshold comes from the business cost of each mistake.

At your desk: the bias-variance simulation, the cross-validation and regularisation tables, the ROC sweep, and the two metric exercises.

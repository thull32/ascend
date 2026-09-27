---
slug: training-and-generalisation
title: "Training and generalisation: overfitting, leakage and honest metrics"
description: Why a model that is perfect on its training data can fail in production, how to split data so your numbers are honest, how regularisation works, and how to pick metrics that match the decision.
minutes: 28
difficulty: medium
tags: [machine-learning, overfitting, regularisation, evaluation, metrics, data-leakage]
problems: []
---
A churn model scores 97% accuracy on the validation set, the team celebrates, and in production it is barely better than guessing. The post-mortem finds that one feature, `days_since_last_support_ticket`, was computed from a support table that included the cancellation ticket itself. In the historical data, "has a ticket from yesterday" almost perfectly meant "has already churned". The model did not learn to predict churn; it learned to read the answer off a leaked column.

Minimising the training loss, the whole of [What a model is](/learn/ai-and-llms/ml-foundations/what-a-model-is), is not the goal. The goal is low error on data the model has **never seen**, drawn from the distribution it will face in production. The difference between the two is the **generalisation gap**, and almost every expensive ML failure is a failure to measure it honestly or to control it. This lesson covers both.

## The goal is unseen data

Training loss tells you how well the parameters fit the examples used to choose them. That number is always optimistic, because the optimiser was actively pushing it down. What you want is the expected loss on the next example that arrives in production. You cannot measure that directly, so you estimate it with data the model did not train on, and the whole discipline of evaluation is about keeping that estimate honest.

A flexible model can drive training loss to zero by memorising. Six points, generated from the true relationship $y = x$ plus a little noise:

| $x$ | 0 | 1 | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|---|
| $y$ | 0.2 | 1.1 | 1.8 | 3.3 | 3.9 | 5.2 |

Fit two models. A line ($\hat{y} = 0.997x + 0.090$, 2 parameters) and a degree-5 polynomial (6 parameters, which can pass exactly through all six points). Then evaluate both on fresh points at $x = 0.5, 1.5, 2.5, 3.5, 4.5$ where the truth is $y = x$:

| | Line | Degree-5 polynomial |
|---|---|---|
| Training MSE | 0.031 | **0.000** |
| Test MSE | **0.007** | 0.113 (16× worse) |
| Prediction at $x = 6$ (truth 6) | 6.07 | 18.1 |
| Prediction at $x = 7$ (truth 7) | 7.07 | 68.8 |

The polynomial is perfect on the data it saw, worse on fresh points on average, and catastrophically worse outside the training range. It spent its extra parameters fitting the noise. That is **overfitting**: low training error, high error on new data. The opposite, **underfitting**, is a model too simple to capture the real pattern: training and validation error are both high.

| Symptom | Diagnosis | What to try |
|---|---|---|
| Train error high, validation error high | Underfitting (high bias) | Bigger model, better features, train longer, less regularisation |
| Train error low, validation error much higher | Overfitting (high variance) | More data, regularisation, smaller model, early stopping |
| Both low, production bad | Distribution shift or leakage | Fix the split, check features, monitor inputs |

## Train, validation, test: three sets for three jobs

- **Training set.** The optimiser sees it and fits the parameters to it.
- **Validation set.** You use it to make choices: learning rate, model size, which features, when to stop. The optimiser never sees it, but *you* do.
- **Test set.** Touched once, at the end, to report the number you will stand behind.

Why not just train and test? Because every decision you make by looking at a dataset leaks a little information about it into the model. Try 200 hyperparameter settings and keep the best validation score, and that score is the maximum of 200 noisy estimates: it is biased upward, sometimes by a lot on small datasets. The test set exists so that one number has not been optimised against. If you peek at it and go back to tuning, it becomes a second validation set and you no longer have an honest estimate.

With small data, a single validation split is noisy. **k-fold cross-validation** splits the data into $k$ folds, trains $k$ times, each time validating on a different fold, and reports the mean and the spread. Five folds costs five trainings; it is standard for tabular models and rarely used for large neural networks, where one training run is already expensive.

### Split the way production will split

A random split assumes every row is an independent draw from the same distribution. Production data rarely is:

- **Time.** If you will predict next month from the past, split by time: train on January to September, validate on October, test on November. A random split lets the model learn from the future (a feature trend in December helps predict a row in March) and flatters it.
- **Groups.** If one user contributes 500 rows, put all of them on one side of the split. Otherwise the model memorises that user's quirks from training rows and "predicts" the validation rows.
- **Duplicates.** Near-identical records on both sides of the split (the same support ticket filed twice, the same product under two IDs) turn memorisation into apparent skill. For large language models this problem has a name, **benchmark contamination**: test questions that leaked into the pretraining crawl.

## Data leakage: the most expensive bug in ML

Leakage is any path by which information unavailable at prediction time reaches the model during training. It is expensive because it produces great offline numbers, so nobody investigates until production disagrees.

Common forms:

- **Target leakage.** A feature that is a consequence of the label: `refund_issued` when predicting fraud, `discharge_code` when predicting a hospital stay, the churn ticket in the opening.
- **Temporal leakage.** Aggregates computed over the whole history, including rows after the prediction time ("average order value", computed with next month's orders included).
- **Preprocessing leakage.** Fitting a scaler, an imputer or a vocabulary on all data before splitting. Usually mild, sometimes not (target encoding without folds is severe).
- **Training-serving skew.** The feature is computed one way in the offline pipeline and another way in the online service. Not leakage strictly, but the same symptom: offline good, online bad. See [ML data pipelines](/learn/big-data/data-platforms/ml-data-pipelines) for how feature stores attack it.

The best single test for every feature: *would I know this value, exactly as computed, at the moment I have to make the prediction?* The best single smell: a validation score that is too good, or one feature that dominates the feature-importance chart.

## Regularisation: making memorising expensive

Regularisation is anything that trades a little training fit for better generalisation. The main tools:

**L2 regularisation (weight decay).** Add a penalty on large weights to the loss: $L_{\text{total}} = L + \lambda \sum_j w_j^2$. Its gradient adds $2\lambda w$ to every weight's gradient, so each update becomes

$$w \leftarrow w(1 - 2\eta\lambda) - \eta \nabla L$$

With $\eta = 0.1$ and $\lambda = 0.01$, every step first multiplies every weight by 0.998, then applies the usual gradient. Weights that the data does not actively support decay toward zero. Large weights are what let a model make sharp, wiggly fits (the degree-5 polynomial hits every noisy point with coefficients such as 3.2, −4.3 and 2.6 that fight each other, where the true relationship has a single slope of 1), so penalising them smooths the function.

**L1 regularisation** penalises $\sum |w_j|$ instead and pushes unhelpful weights to exactly zero, which doubles as feature selection.

**Early stopping.** Track validation loss during training. It typically falls, flattens, then rises as the model starts memorising. Keep the checkpoint from the minimum. It is free, effective, and the reason every training loop logs a validation curve.

**Dropout.** During training, zero each hidden activation with probability $p$ (say 0.1) and scale the survivors up to compensate. No unit can rely on any specific other unit, so the network learns redundant features; at inference nothing is dropped. It behaves like averaging many thinned networks.

**More data.** The most reliable regulariser. Memorising 6 points is easy; memorising 6 million while also fitting them is not. Data augmentation (crops and flips of images, paraphrases of text) manufactures more of it.

The visualisation trains a logistic-regression classifier on two separable clusters. Watch the weights: once the data is perfectly separated, the loss keeps shrinking only by making the weights larger and larger, which is exactly the unbounded growth that L2 regularisation exists to stop.

```viz
{"type": "ml", "algorithm": "logistic-regression", "steps": 12, "lr": 0.5,
 "points": [[1,2,0],[2,1,0],[2,3,0],[3,2.5,0],[5,5,1],[6,4,1],[6,6,1],[7,5,1]],
 "title": "Training a classifier: loss falls, weights keep growing",
 "caption": "The boundary is found within a few steps; after that, gradient descent only makes the model more confident by scaling up w."}
```

### An honest note on very large models

The classic picture (more parameters means more overfitting, so keep models small) is incomplete. Modern neural networks have far more parameters than training examples, can fit random labels perfectly, and still generalise well on real data. Test error can even fall again as models grow past the point where they interpolate the training set, a phenomenon called **double descent**. The practical lessons for you: large pretrained models are usually limited by data and compute rather than classical overfitting (LLM pretraining sees most of its data about once), but **fine-tuning on a small dataset overfits exactly as the textbook says**, within a few epochs. Validation curves and early stopping remain non-negotiable there.

## Metrics that match the decision

A fraud model scores 10,000 transactions, of which 100 are fraudulent. It flags 150, and 80 of those are real fraud. The **confusion matrix**:

| | Actually fraud | Actually legitimate |
|---|---|---|
| **Flagged** | 80 (true positives) | 70 (false positives) |
| **Not flagged** | 20 (false negatives) | 9,830 (true negatives) |

- **Accuracy** = (80 + 9,830) / 10,000 = **99.1%**. A model that never flags anything scores **99.0%**. Accuracy is nearly useless when classes are imbalanced, which is most of the interesting problems.
- **Precision** = TP / (TP + FP) = 80 / 150 = **0.53**. Of the transactions you blocked, how many deserved it? Low precision means angry customers and wasted analyst time.
- **Recall** = TP / (TP + FN) = 80 / 100 = **0.80**. Of the fraud that happened, how much did you catch? Low recall means losses.
- **F1** = $2PR/(P+R)$ = **0.64**, the harmonic mean, useful as a single number only when you have no better way to weigh the two.

Most classifiers output a score, and you choose a **threshold**. Raise it and precision goes up while recall goes down. The right threshold is a business calculation, not a modelling one. Suppose a missed fraud costs \$500 on average and a false flag costs \$5 of review time and friction:

| Threshold | TP | FP | FN | Cost |
|---|---|---|---|---|
| Lower (flags 150) | 80 | 70 | 20 | $20 \times 500 + 70 \times 5$ = \$10,350 |
| Higher (flags 90) | 70 | 20 | 30 | $30 \times 500 + 20 \times 5$ = \$15,100 |

The higher threshold has much better precision (0.78) and costs more. Put the costs in writing and the threshold choice becomes arithmetic.

Other metrics you should know what they hide:

- **ROC-AUC** is the probability that a random positive gets a higher score than a random negative. It is threshold-free, but with 1% positives it can look excellent while precision at any useful threshold is poor. **PR-AUC** (area under precision versus recall) is more honest for rare positives.
- **Calibration** asks whether "0.8" means "right 80% of the time". A model can rank well and be badly calibrated. If downstream code multiplies probabilities by dollar amounts, calibration matters more than AUC.
- For regression: **MAE** (typical error, robust), **RMSE** (punishes big misses), and **MAPE** (percentage error, which explodes when true values are near zero).

Offline metrics are proxies. A recommender that improves an offline ranking metric may not increase what the business cares about (retention, hours watched), which is why companies like Netflix treat the **online A/B test** as the final judge and the offline metric as a filter for what is worth testing.

## When the world moves

A model is a snapshot of the distribution it was trained on. **Distribution shift** breaks it silently: the inputs change (a new client app sends different fields), the base rate changes (fraud spikes during a holiday), or the relationship itself changes (**concept drift**: fraudsters adapt to your model). Production ML therefore needs monitoring of input feature distributions and prediction distributions, not just service health, because labels often arrive weeks late. Retraining cadence is a design decision you should make explicitly, along with how you will detect that it is needed.

## Exercise

```exercise
id: precision-recall-f1
title: Precision, recall and F1 from predictions
prompt: |
  Given two equal-length lists of 0/1 labels, `y_true` (what actually happened)
  and `y_pred` (what the model predicted), return `[precision, recall, f1]`.

  - precision = TP / (TP + FP)
  - recall = TP / (TP + FN)
  - f1 = 2 * precision * recall / (precision + recall)

  Where a denominator is zero the metric is undefined; return `0` for it (and
  return `0` for F1 if precision + recall is 0). Return unrounded floats; results
  are compared to 6 decimal places.
languages: [python, javascript]
entry: precision_recall_f1
starter:
  python: |
    def precision_recall_f1(y_true, y_pred):
        # your code here
        return [0.0, 0.0, 0.0]
  javascript: |
    function precision_recall_f1(y_true, y_pred) {
      // your code here
      return [0, 0, 0];
    }
tests:
  - args: [[1, 1, 1, 1, 0, 0, 0, 0, 0, 0], [1, 1, 1, 0, 1, 1, 0, 0, 0, 0]]
    expected: [0.6, 0.75, 0.666667]
    label: three hits, two false alarms, one miss
  - args: [[1, 0, 1], [1, 0, 1]]
    expected: [1, 1, 1]
    label: perfect predictions
  - args: [[1, 0, 0, 0], [1, 1, 1, 1]]
    expected: [0.25, 1, 0.4]
    label: flag everything gives perfect recall and poor precision
  - args: [[1, 0, 1], [0, 0, 0]]
    expected: [0, 0, 0]
    label: never predicting positive leaves precision undefined
  - args: [[0, 0, 0], [0, 1, 0]]
    expected: [0, 0, 0]
    hidden: true
    label: no actual positives leaves recall undefined
  - args: [[1, 1, 0, 0, 1, 0, 1, 0], [1, 0, 0, 1, 1, 0, 0, 0]]
    expected: [0.666667, 0.5, 0.571429]
    hidden: true
hints:
  - "Count TP (true 1, predicted 1), FP (true 0, predicted 1) and FN (true 1, predicted 0) in one pass. True negatives are not needed."
  - "Guard each division: if the denominator is 0, use 0 for that metric."
```

## Senior signals

- You ask **how the data was split** before you ask about the model, and you insist on time-based or group-based splits whenever production will predict the future or new users.
- You treat a validation score that is **too good as a bug report** and go looking for leakage, feature by feature: *would I know this value at prediction time?*
- You keep a **test set that has not been tuned against**, and you know that the best of 200 validation runs is an optimistic number.
- You refuse accuracy on imbalanced problems and pick the **threshold from the business cost** of false positives and false negatives.
- You know that regularisation, early stopping and more data address variance, not bias, and that **fine-tuning on small datasets overfits fast** even though giant pretrained models seem not to.
- You plan **monitoring for distribution shift** and a retraining cadence as part of the design, not after the first incident.

## Check yourself

```quiz
- q: >-
    You tune 300 hyperparameter configurations and report the best validation accuracy, 91.4%, as the expected production accuracy. What is wrong?
  options: ["It should be the average over all 300 configurations, not the best", "It understates production, since validation is always harder than live traffic", "The best of 300 noisy validation scores is biased upward; use a test set", "Nothing, because the validation data was never used to fit the weights"]
  answer: 2
  explanation: >-
    Selecting the best of many configurations by validation score fits your choices to that particular validation set, so its best score overstates real performance even though the weights never saw it. An untouched test set, used once after all choices are made, gives the honest number. Averaging all configurations answers a different question.
- q: >-
    A model predicting next week's demand is validated with a random 80/20 split of three years of daily rows and looks excellent. In production it is much worse. What is the most likely cause?
  options: ["The random split let it train on days after the ones it was validated on", "The learning rate was too high, so it overfit the training days", "20% of the rows is too few days for a reliable validation estimate", "The model is too small to capture three years of weekly and seasonal patterns"]
  answer: 0
  explanation: >-
    With a random split, validation days are surrounded by training days on both sides, so the model effectively interpolates between known neighbours, including future ones. Production only ever extrapolates forward, which the random split never tested. A 20% slice of three years is hundreds of days, plenty for an estimate; the problem is that the estimate is of the wrong task. Split by time to get an honest number.
- q: >-
    A fraud dataset has 1% positives. Model A has 99.2% accuracy; a model that never flags anything has 99.0%. Which statement is right?
  options: ["Accuracy says little here; compare precision and recall at the chosen threshold", "Model A is clearly excellent, because 99.2% accuracy is nearly perfect", "Rebalance the test set to 50/50 so accuracy becomes meaningful again", "Model A is worse than the trivial model, because it raises false alarms too"]
  answer: 0
  explanation: >-
    With 1% positives, accuracy is dominated by the easy negatives. The decision depends on how many frauds are caught (recall) and how many good customers are blocked (precision) at the chosen operating threshold, weighted by what each error costs. Rebalancing the test set changes the base rate and makes precision meaningless for production.
- q: >-
    With learning rate 0.1 and L2 coefficient 0.01, what does weight decay do to each weight on every step, before the ordinary gradient update?
  options: ["Zeroes it if it is below 0.01", "Subtracts 0.002 from it", "Multiplies it by 0.99", "Multiplies it by 0.998"]
  answer: 3
  explanation: >-
    The penalty λΣw² contributes 2λw to the gradient, so the update is w(1 − 2ηλ) − η∇L = w × 0.998 − η∇L. Multiplying by 0.99 forgets that the decay is scaled by the learning rate (and the 2 from the square). L2 shrinks each weight in proportion to its size, so weights the data does not keep pushing up decay geometrically; subtracting a fixed amount or pushing small weights to exactly zero is closer to what L1 does.
- q: >-
    During fine-tuning on 2,000 examples, training loss keeps falling but validation loss started rising after epoch 3. What do you do?
  options: ["Evaluate on the training set instead, because it is larger and less noisy", "Stop at the epoch-3 checkpoint and add data or stronger regularisation", "Raise the learning rate so the model escapes the validation plateau", "Keep training, because validation loss usually recovers after a plateau"]
  answer: 1
  explanation: >-
    Diverging train and validation curves are the signature of memorisation. The checkpoint at the validation minimum (early stopping) is your best model; more data, augmentation or regularisation push that minimum lower. A higher learning rate does not address memorisation, and training-set evaluation hides it.
```

---
slug: training-and-generalisation
title: "Training and generalisation: overfitting, leakage and honest metrics"
description: Why a model that is perfect on its training data can fail in production, bias and variance measured by simulation, regularisation's effect shown coefficient by coefficient, cross-validation worked on six points, leakage, and precision, recall, F1 and ROC-AUC computed from a confusion matrix and a ten-example ranking.
minutes: 28
difficulty: medium
tags: [machine-learning, overfitting, regularisation, evaluation, metrics, data-leakage]
problems: []
---
A churn model scores 97% accuracy on the validation set, the team celebrates, and in production it is barely better than guessing. The post-mortem finds that one feature, `days_since_last_support_ticket`, was computed from a support table that included the cancellation ticket itself. In the historical data, "has a ticket from yesterday" almost perfectly meant "has already churned". The model did not learn to predict churn; it learned to read the answer off a leaked column.

Minimising the training loss, the whole of [What a model is](/learn/ai-and-llms/ml-foundations/what-a-model-is), is not the goal. The goal is low error on data the model has **never seen**, drawn from the distribution it will face in production. The difference between the two is the **generalisation gap**, and almost every expensive ML failure is a failure to measure it honestly or to control it. This lesson covers both, with every number computed on data small enough to check.

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

The polynomial is perfect on the data it saw, worse on fresh points on average, and catastrophically worse outside the training range. It spent its extra parameters fitting the noise: its coefficients are $0.2 + 3.21x - 4.34x^2 + 2.59x^3 - 0.61x^4 + 0.05x^5$, large terms of alternating sign cancelling each other, where the truth has a single slope of 1. That is **overfitting**: low training error, high error on new data. The opposite, **underfitting**, is a model too simple to capture the real pattern: training and validation error are both high.

## Bias and variance, measured

"Fitting the noise" has a precise meaning. Imagine redrawing the training set many times from the same process and refitting each time. At a test point, the expected squared error splits exactly into three parts:

$$E[(\hat{y} - y)^2] = \underbrace{(E[\hat{y}] - f(x))^2}_{\text{bias}^2} + \underbrace{E[(\hat{y} - E[\hat{y}])^2]}_{\text{variance}} + \underbrace{\sigma^2}_{\text{noise}}$$

Bias is how far the *average* model is from the truth $f(x)$: a model family too rigid to express $f$. Variance is how much the fitted model moves when the training sample changes: a family so flexible that it follows the noise. $\sigma^2$ is noise in the labels, which no model removes.

You can measure all three. Draw 4,000 training sets of six points from $y = x + \varepsilon$ with $\sigma = 0.2$, fit polynomials of degree 0 (a constant), 1, 3 and 5, and average over the five test points:

| Degree | Parameters | Bias² | Variance | Noise $\sigma^2$ | Expected test MSE |
|---|---|---|---|---|---|
| 0 | 1 | 2.000 | 0.007 | 0.040 | 2.047 |
| 1 | 2 | 0.000 | 0.011 | 0.040 | 0.051 |
| 3 | 4 | 0.000 | 0.021 | 0.040 | 0.061 |
| 5 | 6 | 0.000 | 0.060 | 0.040 | 0.100 |

The constant is pure bias: it predicts about 2.5 everywhere, and $(0.5 - 2.5)^2, (1.5 - 2.5)^2, \ldots$ average to exactly 2.0. Degrees 1, 3 and 5 all contain the true line, so their bias is zero, and the only thing extra parameters buy is variance: 0.011 → 0.021 → 0.060. The degree-5 variance is not spread evenly either; it is about 0.10 at the edge points 0.5 and 4.5 and 0.03 in the middle, which is why flexible models fail first at the edges of the data and worst of all beyond them.

```python
import random

def solve(A, b):
    """Gaussian elimination with partial pivoting; A is a small square matrix."""
    n = len(A)
    M = [row[:] + [v] for row, v in zip(A, b)]
    for c in range(n):
        p = max(range(c, n), key=lambda r: abs(M[r][c]))
        M[c], M[p] = M[p], M[c]
        for r in range(n):
            if r != c:
                f = M[r][c] / M[c][c]
                M[r] = [a - f * m for a, m in zip(M[r], M[c])]
    return [M[i][n] / M[i][i] for i in range(n)]

def fit_poly(xs, ys, deg, lam=0.0):
    """Least squares (ridge if lam > 0; the intercept is not penalised)."""
    X = [[x ** j for j in range(deg + 1)] for x in xs]
    d = deg + 1
    A = [[sum(r[a] * r[b] for r in X) + (lam if a == b and a > 0 else 0.0) for b in range(d)] for a in range(d)]
    rhs = [sum(r[a] * y for r, y in zip(X, ys)) for a in range(d)]
    return solve(A, rhs)

def predict(w, x):
    return sum(c * x ** j for j, c in enumerate(w))

xs, tests, sigma, trials = [0, 1, 2, 3, 4, 5], [0.5, 1.5, 2.5, 3.5, 4.5], 0.2, 4000
rng = random.Random(42)
for deg in (0, 1, 3, 5):
    preds = {t: [] for t in tests}
    for _ in range(trials):
        ys = [x + rng.gauss(0, sigma) for x in xs]          # a fresh noisy training set from y = x
        w = fit_poly(xs, ys, deg)
        for t in tests:
            preds[t].append(predict(w, t))
    mean = {t: sum(p) / trials for t, p in preds.items()}
    bias2 = sum((mean[t] - t) ** 2 for t in tests) / len(tests)
    var = sum(sum((p - mean[t]) ** 2 for p in preds[t]) / trials for t in tests) / len(tests)
    print(deg, round(bias2, 4), round(var, 4), round(bias2 + var + sigma ** 2, 4))
```

| Symptom | Diagnosis | What to try |
|---|---|---|
| Train error high, validation error high | Underfitting (high bias) | Bigger model, better features, train longer, less regularisation |
| Train error low, validation error much higher | Overfitting (high variance) | More data, regularisation, smaller model, early stopping |
| Both low, production bad | Distribution shift or leakage | Fix the split, check features, monitor inputs |

## Train, validation, test: three sets for three jobs

- **Training set.** The optimiser sees it and fits the parameters to it.
- **Validation set.** You use it to make choices: learning rate, model size, which features, when to stop. The optimiser never sees it, but *you* do.
- **Test set.** Touched once, at the end, to report the number you will stand behind.

Why is a train/test pair not enough? Because every decision you make by looking at a dataset leaks a little information about it into the model. Try 200 hyperparameter settings and keep the best validation score, and that score is the maximum of 200 noisy estimates: it is biased upward, sometimes by a lot on small datasets. The test set exists so that one number has not been optimised against. If you peek at it and go back to tuning, it becomes a second validation set and you no longer have an honest estimate. (The size of that upward bias is the maximum of many noisy draws, the same order-statistics reasoning as the tail arithmetic in [Probability for engineers](/learn/foundations/math-for-engineers/probability-for-engineers).)

## Cross-validation, worked

With small data, a single validation split is noisy: which rows land in validation changes the answer. **k-fold cross-validation** splits the data into $k$ folds, trains $k$ times, each time validating on a different fold, and reports the mean and the spread. With $k = n$ it is **leave-one-out** (LOOCV).

Run LOOCV on the six points to choose the polynomial degree. For each held-out point, fit on the other five and record the squared error on the one left out:

| Held-out $x$ | Degree 1 | Degree 2 | Degree 3 |
|---|---|---|---|
| 0 | 0.053 | 0.006 | 0.004 |
| 1 | 0.000 | 0.002 | 0.017 |
| 2 | 0.121 | 0.110 | 0.131 |
| 3 | 0.071 | 0.219 | 0.271 |
| 4 | 0.065 | 0.053 | 0.190 |
| 5 | 0.068 | 0.026 | 1.300 |
| **Mean** | **0.063** | 0.069 | 0.319 |

Cross-validation picks the line, which is the true model. Look at the last row for degree 3: holding out $x = 5$ turns the fit into an extrapolation, and the cubic misses by $\sqrt{1.3} \approx 1.1$. The individual fold errors vary by a factor of more than 100; any single split could have told a different story, and the mean over folds is what makes the choice stable.

Five or ten folds is the usual compromise: each fold trains on 80–90% of the data, and the cost is five or ten trainings. That is standard for tabular models and rarely affordable for large neural networks, where one run is already expensive and a single large validation set is used instead.

### Split the way production will split

A random split assumes every row is an independent draw from the same distribution. Production data rarely is:

- **Time.** If you will predict next month from the past, split by time: train on January to September, validate on October, test on November. A random split lets the model learn from the future and flatters it.
- **Groups.** If one user contributes 500 rows, put all of them on one side of the split. Otherwise the model memorises that user's quirks from training rows and "predicts" the validation rows.
- **Duplicates.** Near-identical records on both sides of the split turn memorisation into apparent skill. For large language models this problem has a name, **benchmark contamination**: test questions that leaked into the pretraining crawl ([Capabilities and failure modes](/learn/ai-and-llms/how-llms-work/capabilities-and-failure-modes) covers what it does to published scores).

| Validation strategy | Trainings | Variance of the estimate | Protects against | Use when |
|---|---|---|---|---|
| Single holdout | 1 | high on small data | nothing structural | large data, expensive models |
| k-fold ($k = 5$ or 10) | $k$ | lower | split luck | small or medium tabular data |
| Stratified k-fold | $k$ | lower for rare classes | folds with no positives | imbalanced labels |
| Group k-fold | $k$ | medium | one entity on both sides | many rows per user, patient, device |
| Time-series (expanding window) | one per cut-off | medium | training on the future | any forecast or next-period prediction |
| Leave-one-out | $n$ | low bias, high variance | split luck | tiny datasets only |

## Data leakage: the most expensive bug in ML

Leakage is any path by which information unavailable at prediction time reaches the model during training. It is expensive because it produces great offline numbers, so nobody investigates until production disagrees.

- **Target leakage.** A feature that is a consequence of the label: `refund_issued` when predicting fraud, `discharge_code` when predicting a hospital stay, the churn ticket in the opening.
- **Temporal leakage.** Aggregates computed over the whole history, including rows after the prediction time ("average order value", computed with next month's orders included).
- **Preprocessing leakage.** Fitting a scaler, an imputer or a vocabulary on all data before splitting. Usually mild, sometimes not (target encoding without folds is severe, because each row's encoding contains its own label).
- **Training-serving skew.** The feature is computed one way in the offline pipeline and another way in the online service. Not leakage strictly, but the same symptom: offline good, online bad. See [ML data pipelines](/learn/big-data/data-platforms/ml-data-pipelines) for how feature stores attack it.

The best single test for every feature: *would I know this value, exactly as computed, at the moment I have to make the prediction?* The best single smell: a validation score that is too good, or one feature that dominates the feature-importance chart.

## Regularisation: making memorising expensive

Regularisation is anything that trades a little training fit for better generalisation.

**L2 regularisation (weight decay).** Add a penalty on large weights to the loss: $L_{\text{total}} = L + \lambda \sum_j w_j^2$. Its gradient adds $2\lambda w$ to every weight's gradient, so each update becomes

$$w \leftarrow w(1 - 2\eta\lambda) - \eta \nabla L$$

With $\eta = 0.1$ and $\lambda = 0.01$, every step first multiplies every weight by 0.998, then applies the usual gradient. Weights that the data does not actively support decay toward zero. **L1 regularisation** penalises $\sum |w_j|$ instead and pushes unhelpful weights to exactly zero, which doubles as feature selection.

**Early stopping.** Track validation loss during training. It typically falls, flattens, then rises as the model starts memorising. Keep the checkpoint from the minimum.

**Dropout.** During training, zero each hidden activation with probability $p$ (say 0.1) and scale the survivors by $1/(1 - p)$ so the expected activation is unchanged. No unit can rely on any specific other unit, so the network learns redundant features; at inference nothing is dropped.

**More data.** The most reliable regulariser. Memorising 6 points is easy; memorising 6 million while also fitting them is not. Data augmentation (crops and flips of images, paraphrases of text) manufactures more of it.

## Regularisation, measured

Fit the degree-5 polynomial again, now with an L2 penalty $\lambda$ (with $x$ rescaled to $x/5$ so all five powers are on a similar scale, and the intercept left unpenalised):

| $\lambda$ | Training MSE | Test MSE | $\sum w_j^2$ | Prediction at $x = 6$ |
|---|---|---|---|---|
| 0 | 0.000 | 0.113 | 287,925 | 18.10 |
| 0.0001 | 0.023 | 0.002 | 85.5 | 7.18 |
| 0.001 | 0.025 | 0.005 | 20.2 | 6.41 |
| 0.01 | 0.028 | 0.008 | 15.2 | 6.15 |
| 0.1 | 0.077 | 0.044 | 8.7 | 6.93 |
| 1 | 0.392 | 0.303 | 2.9 | 7.37 |
| 10 | 1.736 | 1.241 | 0.3 | 4.32 |

Read it top to bottom. Training error only ever rises, because the penalty stops the fit from reaching the points. Test error falls from 0.113 to under 0.01 as soon as the coefficients are no longer allowed to be enormous (their squared size drops from 287,925 to 85), then climbs again once $\lambda$ is so large that the model cannot follow even the real slope (at $\lambda = 10$ it is nearly a constant, the degree-0 model from the bias table). That U-shape is the bias-variance trade-off with a dial on it. Leave-one-out cross-validation over the same $\lambda$ values picks 0.01 (CV error 0.146, against 0.553 at 0.001 and 0.263 at 0.1), whose test MSE of 0.008 is within noise of the line's.

The visualisation trains a logistic-regression classifier on two separable clusters. Watch the weights: once the data is perfectly separated, the loss keeps shrinking only by making the weights larger and larger, which is exactly the unbounded growth that L2 regularisation exists to stop.

```viz
{"type": "ml", "algorithm": "logistic-regression", "steps": 12, "lr": 0.5,
 "points": [[1,2,0],[2,1,0],[2,3,0],[3,2.5,0],[5,5,1],[6,4,1],[6,6,1],[7,5,1]],
 "title": "Training a classifier: loss falls, weights keep growing",
 "caption": "The boundary is found within a few steps; after that, gradient descent only makes the model more confident by scaling up w."}
```

**A note on very large models.** Modern neural networks have far more parameters than training examples, can fit random labels perfectly, and still generalise well on real data; test error can even fall again as models grow past the point where they interpolate the training set (**double descent**). Large pretrained models are usually limited by data and compute rather than classical overfitting (LLM pretraining sees most of its data about once), but **fine-tuning on a small dataset overfits exactly as the table above says**, within a few epochs.

## Metrics from a confusion matrix

A fraud model scores 10,000 transactions, of which 100 are fraudulent. It flags 150, and 80 of those are real fraud:

| | Actually fraud | Actually legitimate |
|---|---|---|
| **Flagged** | 80 (true positives) | 70 (false positives) |
| **Not flagged** | 20 (false negatives) | 9,830 (true negatives) |

- **Accuracy** = (80 + 9,830) / 10,000 = **99.1%**. A model that never flags anything scores **99.0%**. Accuracy is nearly useless when classes are imbalanced, which is most of the interesting problems.
- **Precision** = TP / (TP + FP) = 80 / 150 = **0.53**. Of the transactions you blocked, how many deserved it?
- **Recall** = TP / (TP + FN) = 80 / 100 = **0.80**. Of the fraud that happened, how much did you catch?
- **F1** = $2PR/(P+R)$ = **0.64**, the harmonic mean, useful as a single number only when you have no better way to weigh the two.

Most classifiers output a score, and you choose a **threshold**. The right threshold is a business calculation, not a modelling one. Suppose a missed fraud costs \$500 and a false flag costs \$5 of review time and friction:

| Threshold | TP | FP | FN | Cost |
|---|---|---|---|---|
| Lower (flags 150) | 80 | 70 | 20 | $20 \times 500 + 70 \times 5$ = \$10,350 |
| Higher (flags 90) | 70 | 20 | 30 | $30 \times 500 + 20 \times 5$ = \$15,100 |

The higher threshold has much better precision (0.78) and costs more. Put the costs in writing and the threshold choice becomes arithmetic.

## ROC-AUC on ten examples

A threshold-free summary asks: how well does the score *rank* positives above negatives? Ten scored examples, four positive (P) and six negative (N), sorted by score:

| Score | 0.95 | 0.85 | 0.80 | 0.70 | 0.60 | 0.55 | 0.45 | 0.40 | 0.30 | 0.10 |
|---|---|---|---|---|---|---|---|---|---|---|
| Label | P | P | N | P | N | N | P | N | N | N |

Sweep the threshold down through the list. Each positive passed moves the true-positive rate (TPR = recall) up by 1/4; each negative moves the false-positive rate (FPR = FP / all negatives) right by 1/6:

| Flag if score ≥ | TP | FP | Precision | Recall (TPR) | FPR | F1 |
|---|---|---|---|---|---|---|
| 0.90 | 1 | 0 | 1.00 | 0.25 | 0.00 | 0.40 |
| 0.75 | 2 | 1 | 0.67 | 0.50 | 0.17 | 0.57 |
| 0.50 | 3 | 3 | 0.50 | 0.75 | 0.50 | 0.60 |
| 0.35 | 4 | 4 | 0.50 | 1.00 | 0.67 | 0.67 |

Plot TPR against FPR and you get the ROC curve; the area under it is **ROC-AUC**. Computed as area: each negative step is 1/6 wide at the current TPR, $(0.5 + 0.75 + 0.75 + 1 + 1 + 1)/6 = 0.833$. Computed as a probability, count the 24 positive–negative pairs in which the positive scores higher: the positives at 0.95 and 0.85 beat all 6 negatives, the one at 0.70 beats 5, the one at 0.45 beats 3, so $20/24 = 0.833$. The two agree because they are the same quantity: ROC-AUC is the probability that a random positive outranks a random negative. A random scorer gets 0.5, a perfect one 1.0.

What AUC hides is the base rate. At the 0.50 threshold this model has TPR 0.75 and FPR 0.50, and in this balanced-ish sample the precision is 0.50. Deploy the same model where 1% of traffic is positive: of 10,000 events, it flags $0.75 \times 100 = 75$ true positives and $0.5 \times 9{,}900 = 4{,}950$ false ones, a precision of **1.5%**. The ROC curve did not change; the usefulness did. That is why rare-event problems report **PR-AUC** (area under precision against recall) or precision at a fixed recall, and why **calibration** (does "0.8" mean right 80% of the time?) matters whenever downstream code multiplies probabilities by money.

## Under the hood: what the libraries do

- **Scoring pipelines.** In scikit-learn, `cross_val_score` on a `Pipeline` refits every preprocessing step (scaler, imputer, encoder) inside each training fold, which is what prevents preprocessing leakage; scaling the whole dataset first and then cross-validating the model does not. `StratifiedKFold`, `GroupKFold` and `TimeSeriesSplit` implement the rows of the strategy table.
- **Computing AUC.** A pairwise count is $O(PN)$. Libraries sort once by score, $O(n \log n)$, sweep the threshold as in the table above, and integrate with the trapezoid rule; tied scores count as half a correctly ordered pair, which is the diagonal segment the trapezoid draws through a tie.
- **Early stopping.** Frameworks evaluate on the validation set every $N$ steps, keep the best checkpoint, and stop after a *patience* of several evaluations without improvement, because validation loss is noisy and one bad evaluation is not a trend.
- **Weight decay in Adam.** Adding $\lambda w^2$ to the loss and running Adam divides the decay term by Adam's per-parameter scale, which weakens it for weights with large gradients; AdamW applies the decay directly to the weights instead, which is why transformer training uses AdamW.

## Failure modes in production

**A validation score that is too good.** *Symptom:* 97% offline, near-random online. *Diagnosis:* target or temporal leakage; rank features by importance and ask of the top one "would I know this at prediction time?", and re-run validation with that feature removed. *Fix:* compute every feature as of the prediction timestamp (point-in-time joins), and add a check that fails the pipeline when one feature carries most of the importance.

**Random split on temporal data.** *Symptom:* a forecaster validated at 4% error runs at 15% in production. *Diagnosis:* validation rows were surrounded by training rows from both sides in time, so the model interpolated. *Fix:* expanding-window time splits, with a gap between train and validation at least as long as the forecast horizon.

**A threshold tuned on the wrong base rate.** *Symptom:* the fraud queue floods after launch, though recall matches the offline estimate. *Diagnosis:* the threshold was chosen on a rebalanced 50/50 test set, and precision collapses at the real 1% base rate (the 1.5% computed above). *Fix:* choose thresholds on data with the production base rate, and monitor the flag rate as a first-class metric.

**The validation set wears out.** *Symptom:* each model iteration improves validation accuracy, and the online A/B tests stop agreeing. *Diagnosis:* hundreds of decisions tuned against one validation set have overfit it. *Fix:* rotate in fresh validation data, keep a final test set that nobody tunes against, and treat the online test as the judge. The same discipline applies to LLM features, where [Evals and observability](/learn/ai-and-llms/building-with-llms/evals-and-observability) builds held-out eval sets for prompts.

**Silent distribution shift.** *Symptom:* accuracy degrades over weeks; labels arrive too late to show it. *Diagnosis:* input features or the prediction distribution have moved (a new client app, a seasonal base-rate change, fraudsters adapting to the model). *Fix:* monitor input and prediction distributions against the training reference, alert on drift, and make the retraining cadence an explicit design decision.

Offline metrics are proxies. A recommender that improves an offline ranking metric may not move what the business cares about (retention, hours watched), which is why Netflix has written publicly about treating the **online A/B test** as the final judge and the offline metric as a filter for what is worth testing.

## Exercises

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

```exercise
id: roc-auc-pairs
title: ROC-AUC as a ranking probability
prompt: |
  Given `labels` (0/1) and `scores` (numbers, higher means "more likely
  positive") of equal length, return the ROC-AUC: the fraction of
  (positive, negative) pairs in which the positive has the higher score.
  A tied pair counts as 0.5. If there are no positives or no negatives, the
  AUC is undefined: return `null` (`None` in Python).

  An O(P * N) double loop over positives and negatives is fine here.
  Results are compared to 6 decimal places.
languages: [python, javascript]
entry: roc_auc
starter:
  python: |
    def roc_auc(labels, scores):
        # your code here
        return 0.5
  javascript: |
    function roc_auc(labels, scores) {
      // your code here
      return 0.5;
    }
tests:
  - args: [[1, 1, 0, 1, 0, 0, 1, 0, 0, 0], [0.95, 0.85, 0.8, 0.7, 0.6, 0.55, 0.45, 0.4, 0.3, 0.1]]
    expected: 0.833333
    label: the ten-example worked ranking
  - args: [[0, 1, 0, 1], [0.1, 0.9, 0.2, 0.8]]
    expected: 1
    label: every positive outranks every negative
  - args: [[1, 0], [0.2, 0.7]]
    expected: 0
    label: perfectly reversed ranking
  - args: [[1, 0, 1, 0], [0.5, 0.5, 0.9, 0.1]]
    expected: 0.875
    label: a tie counts as half a pair
  - args: [[1, 1, 1], [0.3, 0.6, 0.9]]
    expected: null
    hidden: true
    label: no negatives means AUC is undefined
  - args: [[0, 1, 0, 1, 0, 1], [3, 3, 3, 3, 3, 3]]
    expected: 0.5
    hidden: true
    label: a constant score is no better than chance
hints:
  - "Split the scores into a list for positives and a list for negatives; return null if either is empty."
  - "For every pair add 1 if the positive is higher, 0.5 if equal, 0 otherwise, then divide by P * N."
```

## Interviewer follow-ups

**"Explain bias and variance with a concrete example."** *Model answer:* redraw the training set many times; bias is how far the average fitted model is from the truth, variance is how much the fit moves between draws. On six noisy points from $y = x$, a constant has bias² 2.0 and tiny variance, a line has neither, and a degree-5 polynomial has zero bias but five times the line's variance, concentrated at the edges. *Common wrong answer:* "bias is training error and variance is test error", which conflates the symptoms with the causes.

**"How would you validate a model that predicts next week's demand?"** *Model answer:* expanding-window time splits with a gap equal to the horizon, features computed as of each cut-off, and a final untouched period as the test set; report error per cut-off to see whether it degrades with recency. *Common wrong answer:* "five-fold cross-validation", which shuffles the future into training.

**"Your model has ROC-AUC 0.95. Is it good?"** *Model answer:* it ranks well, but AUC says nothing about precision at the base rate or about calibration; at 1% positives a model with that AUC can still have single-digit precision at a useful recall. I would ask for precision at the operating recall on data with the production base rate, and the cost of each error type. *Common wrong answer:* "yes, anything above 0.9 is excellent".

**"Why does cross-validation need the preprocessing inside the loop?"** *Model answer:* a scaler, imputer or target encoder fitted on all data has seen the validation fold, so the validation score includes information from it; a pipeline refits them per fold. For target encoding the effect is large because each row's encoding contains its own label. *Common wrong answer:* "it makes no difference, scaling is linear".

**"When does adding more data not help?"** *Model answer:* when the error is bias, not variance: the degree-0 model's bias² of 2.0 does not shrink with more points; only a richer model or better features fix it. More data also does not fix leakage, label noise that is systematic, or a mismatch between training and production distributions. *Common wrong answer:* "more data always helps".

## What mid-level engineers get wrong

- **Reporting the best validation score as the expected production score.** It was selected; it is biased upward.
- **Random splits on data with time or group structure.** The resulting number measures interpolation, not the task.
- **Fitting preprocessing on the full dataset.** Mild leakage for scalers, severe for target encoding.
- **Accuracy or AUC on imbalanced problems, with no base-rate precision.** A 1.5% precision can hide behind a respectable ROC curve.
- **Choosing the threshold by F1 by default.** F1 weighs precision and recall equally, which the business almost never does; the costs choose the threshold.
- **Tuning regularisation by eye.** The penalty's effect is a U-shaped curve; cross-validation finds its bottom.

## Senior signals

- You ask **how the data was split** before you ask about the model, and you insist on time-based or group-based splits whenever production will predict the future or new users.
- You can decompose error into **bias², variance and noise**, say which one a proposed fix attacks, and know that more data and regularisation address variance, not bias.
- You treat a validation score that is **too good as a bug report** and go looking for leakage, feature by feature: *would I know this value at prediction time?*
- You keep a **test set that has not been tuned against**, and you know that the best of 200 validation runs is an optimistic number.
- You refuse accuracy on imbalanced problems, read **ROC-AUC as a ranking probability** that ignores the base rate, and pick the **threshold from the business cost** of false positives and false negatives.
- You plan **monitoring for distribution shift** and a retraining cadence as part of the design, not after the first incident.

## Check yourself

```quiz
- q: >-
    You tune 300 hyperparameter configurations and report the best validation accuracy, 91.4%, as the expected production accuracy. What is wrong?
  options: ["It understates production, since validation is always harder than live traffic", "The best of 300 noisy validation scores is biased upward; use a test set", "Nothing, because the validation data was never used to fit the weights", "It should be the average over all 300 configurations, not the best"]
  answer: 1
  explanation: >-
    Selecting the best of many configurations by validation score fits your choices to that particular validation set, so its best score overstates real performance even though the weights never saw it. An untouched test set, used once after all choices are made, gives the honest number. Averaging all configurations answers a different question.
- q: >-
    A model predicting next week's demand is validated with a random 80/20 split of three years of daily rows and looks excellent. In production it is much worse. What is the most likely cause?
  options: ["The learning rate was too high, so it overfit the training days", "The model is too small to capture three years of weekly and seasonal patterns", "The random split let it train on days after the ones it was validated on", "20% of the rows is too few days for a reliable validation estimate"]
  answer: 2
  explanation: >-
    With a random split, validation days are surrounded by training days on both sides, so the model effectively interpolates between known neighbours, including future ones. Production only ever extrapolates forward, which the random split never tested. A 20% slice of three years is hundreds of days, plenty for an estimate; the problem is that the estimate is of the wrong task. Split by time to get an honest number.
- q: >-
    In the simulation, degree-1 and degree-5 polynomials both have zero bias on data from y = x, but the degree-5 model's expected test error is about twice the line's. Where does the extra error come from?
  options: ["Variance: the fit moves more between training samples", "Label noise, which grows with the number of parameters", "Bias at the edges, where the polynomial bends away", "Optimisation error, since degree 5 has no closed form"]
  answer: 0
  explanation: >-
    Both families contain the true line, so the average fit is correct (zero bias). The degree-5 fit follows each sample's noise, so it moves far more from sample to sample: variance 0.060 against 0.011, largest at the edge points. Label noise is a property of the data, not the model, and a polynomial fit has a closed-form least-squares solution at any degree.
- q: >-
    Ten scored examples have 4 positives and 6 negatives, and in 20 of the 24 positive-negative pairs the positive has the higher score. What is the ROC-AUC, and what does it not tell you?
  options: ["0.83; it says nothing about how well positives are ranked", "0.83; it says nothing about precision at the real base rate", "0.20; it counts the fraction of pairs that are ordered wrongly", "0.40; it equals recall at the best threshold, not a ranking"]
  answer: 1
  explanation: >-
    ROC-AUC is the probability that a random positive outranks a random negative: 20/24 = 0.833, the same number as the area under the TPR-against-FPR curve. It is exactly a ranking measure, and it is blind to the base rate: the same curve gives 50% precision on this sample and 1.5% precision at a 1% positive rate.
- q: >-
    Adding an L2 penalty to the degree-5 fit raises training MSE from 0 to 0.028 at λ = 0.01. Why is that an improvement?
  options: ["Test error falls from 0.113 to 0.008 as coefficients shrink", "The penalty removes the noise from the training labels", "It moves the model to degree 1, which is the true model", "Higher training error always means less overfitting"]
  answer: 0
  explanation: >-
    The penalty stops the coefficients from growing to the huge cancelling values that pass exactly through noisy points (their squared sum falls from about 288,000 to 15), which cuts variance; test error drops from 0.113 to 0.008. Training error rising is the price, not the goal, and too much penalty (λ = 10) raises test error again. The model is still degree 5, and the labels are unchanged.
- q: >-
    During fine-tuning on 2,000 examples, training loss keeps falling but validation loss started rising after epoch 3. What do you do?
  options: ["Stop at the epoch-3 checkpoint and add data or stronger regularisation", "Keep training, because validation loss usually recovers after a plateau", "Raise the learning rate so the model escapes the validation plateau", "Evaluate on the training set instead, because it is larger and less noisy"]
  answer: 0
  explanation: >-
    Diverging train and validation curves are the signature of memorisation. The checkpoint at the validation minimum (early stopping) is your best model; more data, augmentation or regularisation push that minimum lower. A higher learning rate does not address memorisation, and training-set evaluation hides it.
```

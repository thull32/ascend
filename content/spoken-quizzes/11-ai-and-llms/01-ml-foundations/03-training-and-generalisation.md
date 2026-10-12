---
lesson: training-and-generalisation
source: 32d6b64499d205d4
---
## 1

You tune 300 hyperparameter configurations, and report the best validation accuracy, 91.4 percent, as the expected production accuracy. What is wrong?

A, it understates production, since validation is always harder than live traffic. B, the best of 300 noisy validation scores is biased upward; use a test set. C, nothing, because the validation data was never used to fit the weights. D, it should be the average over all 300 configurations, not the best.

[think]

The answer is B: the best of 300 noisy validation scores is biased upward, so use a test set.

Selecting the best of many configurations by validation score fits your choices to that particular validation set, so its best score overstates real performance, even though the weights never saw it. An untouched test set, used once after all choices are made, gives the honest number. Averaging all the configurations answers a different question.

## 2

A model predicting next week's demand is validated with a random 80 to 20 split of three years of daily rows, and looks excellent. In production it is much worse. What is the most likely cause?

A, the learning rate was too high, so it overfit the training days. B, the model is too small to capture three years of weekly and seasonal patterns. C, the random split let it train on days after the ones it was validated on. D, 20 percent of the rows is too few days for a reliable validation estimate.

[think]

The answer is C: the random split let it train on days after the ones it was validated on.

With a random split, each validation day is surrounded by training days on both sides, so the model effectively interpolates between known neighbours, including future ones. Production only ever predicts forward, which the random split never tested. Twenty percent of three years is hundreds of days, plenty for an estimate; the trouble is that it estimated the wrong task. Split by time to get an honest number.

## 3

On data generated from y equals x, a degree 1 and a degree 5 polynomial both have zero bias, but the degree 5 model's expected test error is about twice the line's. Where does the extra error come from?

A, variance: the fit moves more between training samples. B, label noise, which grows with the number of parameters. C, bias at the edges, where the polynomial bends away. D, optimisation error, since degree 5 has no closed form.

[think]

The answer is A: variance. The fit moves more between training samples.

Both families contain the true line, so the average fit is correct, which is zero bias. The degree 5 fit follows each sample's noise, so it moves far more from sample to sample: a variance of 0.060 against 0.011, largest at the edge points. Label noise is a property of the data, not the model, and a polynomial fit has a closed-form least-squares solution at any degree.

## 4

Ten scored examples have 4 positives and 6 negatives, and in 20 of the 24 positive-negative pairs, the positive has the higher score. What is the ROC-AUC, and what does it not tell you?

A, 0.83, and it says nothing about how well positives are ranked. B, 0.83, and it says nothing about precision at the real base rate. C, 0.20; it counts the fraction of pairs that are ordered wrongly. D, 0.40; it equals recall at the best threshold, not a ranking.

[think]

The answer is B: about 0.83, and it is blind to the base rate.

ROC-AUC is the probability that a random positive outranks a random negative: 20 out of 24, or 0.833, the same number as the area under the curve of true positive rate against false positive rate. It is exactly a ranking measure, and it is blind to the base rate: the same curve gives 50 percent precision on this sample, and 1.5 percent precision where 1 percent of traffic is positive.

## 5

Adding an L2 penalty to a degree 5 polynomial fit raises the training mean squared error from 0 to 0.028, with a penalty strength of 0.01. Why is that an improvement?

A, test error falls from 0.113 to 0.008 as the coefficients shrink. B, the penalty removes the noise from the training labels. C, it moves the model to degree 1, which is the true model. D, higher training error always means less overfitting.

[think]

The answer is A: test error falls from 0.113 to 0.008 as the coefficients shrink.

The penalty stops the coefficients from growing to the huge cancelling values that pass exactly through noisy points; their squared sum falls from about 288,000 to 15. That cuts variance, and test error drops from 0.113 to 0.008. Rising training error is the price, not the goal, and too much penalty, a strength of 10, raises test error again. The model is still degree 5, and the labels are unchanged.

## 6

During fine-tuning on 2,000 examples, training loss keeps falling, but validation loss started rising after epoch 3. What do you do?

A, stop at the epoch 3 checkpoint, and add data or stronger regularisation. B, keep training, because validation loss usually recovers after a plateau. C, raise the learning rate, so the model escapes the validation plateau. D, evaluate on the training set instead, because it is larger and less noisy.

[think]

The answer is A: stop at the epoch 3 checkpoint, and add data or stronger regularisation.

Training and validation curves that diverge are the signature of memorisation. The checkpoint at the validation minimum, which is early stopping, is your best model, and more data, augmentation or regularisation push that minimum lower. A higher learning rate does not address memorisation, and evaluating on the training set hides it.

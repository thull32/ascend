---
lesson: ml-data-pipelines
source: 6060a603b5fb7067
---
## 1

A churn model's training set joins labels for 1 May to a features table on user id only, taking each user's latest row. Offline accuracy is excellent, and production accuracy is poor. What is the most likely cause?

A, the model is overfitting to noise in the training month. B, the labels are imbalanced, since few users churn in May. C, the online store is too slow, so serving drops features. D, label leakage from feature rows computed after 1 May.

[think]

The answer is D: label leakage from feature rows computed after 1 May.

Without a point-in-time condition, the latest feature rows were computed after the prediction time, for example zero plays after a user churned, and they leak the label into the inputs. The model learns the leak, which does not exist at prediction time. Overfitting to noise would hurt held-out offline accuracy too, not only production.

## 2

Training uses a nightly batch feature computed as of midnight, while serving reads a streaming version updated every minute. Both implement the same definition correctly. Why can this still hurt the model?

A, the model learned day-old values, and now gets fresh ones. B, it cannot hurt, because the definitions are identical. C, streaming features are approximate, so the values drift apart. D, nightly jobs cannot compute the same windowed aggregates.

[think]

The answer is A: the model learned day-old values, and now gets fresh ones.

Freshness and window boundaries are part of a feature's meaning. The model learned the relationship between labels and values whose window ended at midnight; in serving, it gets values whose window ends now, with a different distribution. Identical code does not make a 12-hour-stale input and a 1-minute-stale input the same. Training on logged serving values, or computing training features at the same freshness, removes the skew.

## 3

Why is training on features logged at serving time an effective defence against skew, and what is its main cost?

A, it removes the need for labels, and costs some accuracy. B, it is faster to compute, and its only cost is extra storage. C, it avoids point-in-time joins entirely, so it has no real cost. D, training sees what serving saw, but new features lack history.

[think]

The answer is D: training sees what serving saw, but new features lack history.

Logged features are, by construction, what the model saw in production, including staleness and defaults. A new feature has no logged history until it has been served for a while, so it must either wait, or be backfilled point-in-time from the offline path. Labels are still joined to the logged features by time, so neither labels nor time-based joins go away.

## 4

A range-based point-in-time join over two years of daily feature snapshots, for 50 million labels, runs for hours and spills terabytes. What is the most effective fix?

A, sort the labels table by timestamp before the join. B, switch to a random split, so fewer labels need features. C, add more executors, so the spill spreads over more disks. D, bound the range with a time-to-live, and bucket both sides by entity.

[think]

The answer is D: bound the range with a time-to-live, and bucket both sides by entity.

Without a lower bound, each label joins about 730 earlier rows, an intermediate of about 36 billion rows. A time-to-live predicate, or a native as-of join, keeps the intermediate close to one row per label, and bucketing both sides by entity avoids a large shuffle. More executors only spread the same oversized intermediate.

## 5

The day after a deploy, the population stability index of a seven-day play count feature, between training and serving, is 0.19. What should happen first?

A, compare served values with an offline recomputation for the same requests. B, roll back the model, since drift means it is no longer valid. C, raise the alert threshold to 0.25, the conventional major-shift level. D, retrain the model on the last week of served data.

[think]

The answer is A: compare served values with an offline recomputation for the same requests.

A stability index of 0.19 says the distribution moved, not why. If an offline recomputation for the same entities and timestamps disagrees with the served values, the deploy changed the feature pipeline, and retraining would bake the bug into the next model. If it agrees, behaviour really changed, and retraining is appropriate. Neither raising the threshold nor rolling back the model addresses the feature path.

## 6

Which record best makes a trained model's dataset reproducible six months later?

A, the Git commit of the service that serves the model. B, the row count and schema of the final training set. C, the model's hyperparameters, random seed and framework version. D, the feature versions, the label definition, and the input snapshot ids.

[think]

The answer is D: the feature versions, the label definition, and the input snapshot ids.

Reproducing data means knowing exactly what was computed, and from which versions of the inputs: feature definitions and versions, the label definition and time range, and the snapshot ids of every input table. Table-format snapshot ids pin the input files, and definitions pin the logic. Hyperparameters and row counts describe the model, not the data.

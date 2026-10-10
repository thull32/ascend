---
lesson: ml-data-pipelines
source: 7acb6faddb67e9e9
fit: great
desk:
  - "The ML data pipeline diagram"
  - "The four-user leakage table, and the as-of and range-join SQL"
  - "The skew trace for user u7, with both windows"
  - "The feature store parts table, the write and read paths, and the design trade-off table"
  - "The worked PSI table and the PSI code"
  - "Exercises: a point-in-time join, and the population stability index"
---
## Introduction

A churn model scores beautifully offline: an AUC of 0.91 on a held-out month. In production it barely beats the rule "users who have not played anything in two weeks will churn". Two bugs explain the gap, and neither is in the model.

First, the training set joined each user's label, churned within 30 days of 1 May, to features computed as of the day the training set was built, in June. A user who churned on 10 May had zero plays in the last seven days, in June. So the model learned that zero recent plays predicts churn: true, and useless, because on 1 May that user still had plays. Second, in production the same feature comes from a streaming job written by another team, which excludes plays shorter than 60 seconds. The batch version counted them. The model is fed numbers from a different distribution than the one it learned.

Most production ML failures are data pipeline failures of these two kinds. Leakage: training data holds information that would not exist at prediction time. And training-serving skew: features in serving differ from those in training. Both are prevented by pipeline design, not modelling skill, and both are what a senior engineer is expected to spot in a design review.

## Point-in-time correctness

Four things set ML pipelines apart from the analytics pipelines earlier in the module. Features are needed in two places: history for training, millisecond lookups for serving. Training data must be reconstructed as of the past, per example. The model's outputs change the data it is trained on next. And serving has a latency budget in milliseconds.

A training example is an entity, a prediction time, and a label observed after it. Every feature attached to it must be computed only from data available before the prediction time. The operation that enforces this is the point-in-time join, also called an as-of join: for each label, take the most recent feature value at or before the prediction time, optionally no older than a time to live.

The lesson traces four users, predicted on 1 May. Two churn, two stay. With the correct join, the churners have 9 and 2 plays in the last week, and the stayers 3 and 8. No threshold separates them. That is the honest difficulty of the problem. Now join to each user's latest row instead. What do you expect to see?

[pause]

Every churner has 0. Every stayer has more than 0. The feature separates the labels perfectly, the offline AUC is 1.0, and the model has learned that people who have stopped watching have stopped watching. The leak is invisible offline, because the test set is built the same way.

Leakage also enters in quieter ways: windows that extend past the prediction time, dimension tables read in their current state, like a plan the user switched to after churning, and random train-test splits on time-structured data, which show the model the future of the same users. Split by time for anything that predicts the future.

And watch the join's cost. Without a time-to-live bound, each label joins every earlier feature row for its user. With two years of daily snapshots, that is about 730 rows per label, so 50 million labels become a 36-billion-row intermediate before you pick the latest. Bound the range with a time to live, bucket both sides by user, or use an engine with a native as-of join. More executors only spread the same oversized intermediate.

## Training-serving skew

Skew is any difference between the values a model sees in serving and those it would have seen for the same entity and time in training. Four common sources: two implementations, a SQL one and a Flink one that drift in filters, nulls and time zones; different time semantics, a daily window ending at midnight against a window ending now; different sources, the warehouse against an operational cache; and defaults, null and imputed in training, zero in serving, where zero means something real.

Trace user u7, scored at noon on 1 May, with four plays in the past week: 180 seconds, 45 seconds, 600 seconds, and one of 30 seconds that very morning. The batch definition, run at midnight, counts every play in the seven days to midnight: 3. The streaming definition counts plays of at least 60 seconds in the seven days to noon: 2. Now decompose. Apply the streaming filter to the batch window, and you get 2. Apply the batch filter to the streaming window, and you get 4. The two paths differ in two independent ways, a code difference and a time difference, and the model trained on 3 receives 2 with no way of knowing why. Multiply by 200 features.

Two structural fixes, and mature platforms use both. One definition, two materialisations: a feature is defined once, and the platform computes it for both stores, with the streaming logic replayed over historical events to produce its history. And log at serving time, train on the log: when serving fetches features, it logs exactly those values with the request, and training sets join labels to the logged features. Training then sees precisely what serving saw, staleness and defaults included. The cost: a brand-new feature has no logged history, so you combine logging with a point-in-time backfill.

Then monitor. For a sample of served requests, recompute the features offline for the same entity and timestamp, and track the mismatch rate per feature. A monitor saying the play count differs on 18 percent of sampled requests finds the 60-second bug in a day instead of a quarter.

## Feature stores

A feature store implements these patterns. A registry of definitions, owners, keys, types and time-to-live settings. An offline store with full history, usually lakehouse tables. An online store with the latest value per entity, read in single-digit milliseconds, like Redis. Materialisation jobs that write both. And two retrieval calls: historical features for a label set, point-in-time, and online features for a request.

The write path. The offline store is appended daily, never overwritten, so the point-in-time join has every past value. A batch materialisation reads rows newer than the last run, keeps the latest per entity, and writes one hash per entity to Redis. At 50 thousand writes a second, 250 million entities take about 83 minutes, which must finish before the morning peak. A streaming feature writes the online hash directly and appends to the offline log.

The read path for a ranking request is one read for the user's 200 features, and a pipelined multi-get for 500 candidate items. A same-zone Redis round trip is about a millisecond, and a budget of 10 to 20 milliseconds allows one or two round trips, not 500. So item features are pre-joined, hot items cached in process, lookups batched. When the 99th percentile jumped from 15 to 90 milliseconds as candidates grew from 100 to 500, the cause was one round trip per item.

Then a time-to-live check per feature in the serving code: a value older than its limit comes back as null. A stalled materialisation then surfaces as missing values the model was trained to handle, not as day-old values that look valid. And notice freshness: a nightly job finishing at 5 in the morning serves values between 5 and 29 hours old. A streaming feature is seconds old. Same code, different features.

Backfilling a new feature, refunds over 90 days, for two years means 730 point-in-time runs, each using only events before its day. At 10 minutes each that is 122 hours serially, or about 15 at eight wide. The alternative is log and wait. Backfill when the feature is expected to matter.

## Embeddings and drift

Embeddings only mean something relative to the model that produced them. Item vectors for 50 thousand titles at 128 dimensions are 25 megabytes, cheap to rebuild nightly. User vectors for 250 million members are 128 gigabytes in 32-bit floats, which is why they are stored smaller and often computed from recent events. Two rules. Version every vector by the model that produced it, because vectors from two training runs live in different spaces even with identical architecture. And swap the model, the vectors and the index atomically, so no request compares a version 2 user vector against a version 1 item index. If you mix them, recommendations become quietly random for part of the traffic.

For drift, the standard statistic is the population stability index, PSI. Bin the feature on training quantiles. For each bin, take the serving share minus the training share, times the log of their ratio, and sum. Every term is non-negative. After the 60-second filter shipped, the share of users with zero plays went from 30 percent in training to 50 percent in serving, and the PSI came to about 0.19. The common thresholds, under 0.1 no meaningful shift, 0.1 to 0.25 moderate, above 0.25 major, come from credit-scoring practice, not a theorem. A milder version of the same bug scored about 0.06, under the usual alarm, which is why PSI is paired with the skew monitor rather than trusted alone.

And reproducibility: record, with every model, the feature versions, the label definition, the time range, and the snapshot ids of every input table. An Iceberg snapshot id pins exactly which files were read, as long as snapshot expiry has not removed it, which is a real tension with privacy deletion.

## In the interview

The lesson's follow-up. PSI on a feature is 0.19 after a deploy. What do you do first?

[pause]

Check the skew monitor. If offline recomputation disagrees with the served values for the same requests, the deploy changed the pipeline, and retraining would bake the bug into the next model. If it agrees, the world changed, and retraining is the right response. The wrong answer is to retrain immediately.

And: training and serving use the same feature definition; can they still disagree? Yes, through time semantics, a window ending at midnight against one ending now, through freshness, defaults and sources. Trace one user through both paths, and fix it by training on logged serving features or computing both from one job. "No, the code is identical" is the wrong answer.

## Recap

Four things to remember. Ask "as of when?" for every feature: point-in-time joins with a time to live, dimensions read as of the prediction time, and splits by time. Skew comes from two implementations, time semantics, sources and defaults, and the structural fixes are one definition with two materialisations, and training on logged serving features. A feature store's online reads need one round trip per entity and time-to-live checks that turn staleness into nulls. And check skew before retraining on drift; version embeddings with their model.

At your desk: the pipeline diagram, the leakage table and SQL, the u7 skew trace, the feature store tables, the PSI worked example and code, and the two exercises.

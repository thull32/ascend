---
slug: streaming
title: "Stream processing"
description: "Kafka internals, event time and watermarks, checkpointed state, the lambda/kappa debate and change data capture: how real-time data actually stays correct."
prerequisites: [big-data/batch-processing]
---
A stream is a batch job that never gets to see the end of its input. That single difference breaks every comfortable assumption: you cannot sort what has not arrived, you cannot know a window is complete, and a machine that crashes mid-computation has to resume without double counting. Stream processing is the collection of mechanisms that restore those guarantees: partitioned logs with replication, watermarks that declare "nothing older is coming", checkpoints that snapshot state consistently across a cluster, and transactional sinks that make retries invisible.

This module starts inside Kafka, because almost every streaming system sits on top of a partitioned, replicated log, and the broker and client configuration (acks, in-sync replicas, retention, consumer-group rebalancing) decides whether your pipeline can lose or duplicate data before your code even runs. It then builds the processing model shared by Flink, Kafka Streams and Spark Structured Streaming, moves into state and fault tolerance, and steps back to the architectural question of whether you need a separate batch layer at all. It ends with change data capture, the technique that turns a database into a stream and keeps caches, search indexes and warehouses in sync with the system of record.

Every lesson names the configuration or arithmetic that matters: how many partitions, how much lateness, how big a checkpoint, how long a transaction timeout. By the end you should be able to take a requirement like "count plays per title per minute, exactly once, with events up to ten minutes late" and turn it into a topology, a set of configs and a failure analysis.

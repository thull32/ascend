---
slug: batch-processing
title: "Batch processing"
description: "From MapReduce to Spark, Parquet, Iceberg and OLAP engines: how a terabyte gets read, shuffled, joined and stored, and where the time goes."
prerequisites: [system-design/building-blocks]
---
Batch processing is the part of big data that looks simple from the outside: read a lot of files, transform them, write a lot of files. Inside, every decision is about moving bytes across a network as few times as possible. The shuffle (regrouping data by key across machines) is the single most expensive thing a distributed job does, and most of what separates a job that runs in ten minutes from one that runs in ten hours is how many shuffles it does and how evenly the keys spread.

This module starts with MapReduce because its constraints (two phases, a disk write between them) make the shuffle visible, then moves to Spark, where the same shuffle hides behind a DataFrame API and you have to know it is there. The storage lessons cover what HDFS and S3 actually guarantee, why columnar formats make analytical scans ten to a hundred times cheaper, and how table formats like Iceberg and Delta turn a directory of files into something with transactions. The module closes with OLAP engines, where columnar storage and vectorised execution meet interactive latency.

By the end you will be able to look at a Spark plan or a warehouse query and predict, in bytes and partitions, why it is slow.
EOF
cat > /home/tristan/ascend/content/tracks/10-big-data/02-streaming/module.md <<'"'"'EOF'"'"'
---
slug: streaming
title: "Stream processing"
description: "Kafka internals, event time and watermarks, checkpointed state, the lambda/kappa debate and change data capture: how real-time data actually stays correct."
prerequisites: [big-data/batch-processing]
---
A stream is a batch job that never gets to see the end of its input. That single difference breaks every comfortable assumption: you cannot sort what has not arrived, you cannot know a window is complete, and a machine that crashes mid-computation has to resume without double counting. Stream processing is the collection of mechanisms that restore those guarantees: partitioned logs with replication, watermarks that declare "nothing older is coming", checkpoints that snapshot state consistently across a cluster, and transactional sinks that make retries invisible.

This module starts inside Kafka, because almost every streaming system sits on top of a partitioned, replicated log, and the broker configuration (acks, in-sync replicas, retention, consumer-group rebalancing) decides whether your pipeline can lose or duplicate data before your code even runs. It then builds the processing model shared by Flink, Kafka Streams and Spark Structured Streaming, moves into state and fault tolerance, and steps back to the architectural question of whether you need a batch layer at all. It ends with change data capture, the technique that turns a database into a stream and keeps caches, search indexes and warehouses in sync with the system of record.

Every lesson names the configuration or arithmetic that matters: how many partitions, how much lateness, how big a checkpoint, how long a transaction timeout.
EOF
cat > /home/tristan/ascend/content/tracks/10-big-data/03-data-platforms/module.md <<'"'"'EOF'"'"'
---
slug: data-platforms
title: "Data platforms"
description: "Orchestration, dimensional modelling, data quality and lineage, and ML feature pipelines: the platform work that turns raw events into data people can trust."
---
The engines in the previous two modules are commodities. What distinguishes a data platform that a company trusts from one it works around is everything wrapped around the engines: pipelines that can be rerun without corrupting anything, tables modelled so that an analyst can answer a question without a data engineer, tests and lineage that catch a broken upstream before the CFO's dashboard does, and a feature pipeline that serves a model the same numbers it was trained on.

This module is written for the engineer who will be asked in a design review "how do we backfill this?", "what happens if the upstream schema changes?", or "why does the model do worse in production than in the notebook?" Each lesson gives the mechanism behind the answer: idempotent partition overwrites, slowly changing dimensions, data contracts enforced at the producer, and point-in-time correct feature joins. The Netflix examples are limited to what the company has published: Keystone, Iceberg, Metaflow and Maestro.
EOF
echo done'
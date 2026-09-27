---
slug: big-data
title: "Big Data & Streaming"
description: "Process data that does not fit on one machine, in batch and in real time, and know exactly what each guarantee costs."
icon: workflow
phase: 5
---
Every senior interview loop at a data-heavy company eventually reaches the question "and what happens when this does not fit on one machine?" The honest answer involves shuffles, partitions, watermarks, replication factors and commit protocols, not a product name. This track builds that answer from the ground up: how MapReduce split work and why Spark replaced it, what a distributed file system and an object store actually promise, how columnar formats and table formats make a data lake queryable, and how OLAP engines turn a scan of a billion rows into something you can wait for.

The second half moves from batch to streams. Kafka is the spine of most modern data platforms, and its configuration (acks, in-sync replicas, retention, consumer groups) is where correctness lives or dies. From there you learn the stream processing model that Flink, Kafka Streams and Spark Structured Streaming share: event time, windows, watermarks, checkpointed state and the arithmetic of rescaling. Change data capture connects the two worlds by turning the databases

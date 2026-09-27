---
slug: batch-processing
title: "Batch processing"
description: "From MapReduce to Spark, Parquet, Iceberg and OLAP engines: how a terabyte gets read, shuffled, joined and stored, and where the time goes."
prerequisites: [system-design/building-blocks]
---
Batch processing is the part of big data that looks simple from the outside: read a lot of files, transform them, write a lot of files. Inside, every decision is about moving bytes across a network as few times as possible. The shuffle (regrouping data by key across machines) is the single most expensive thing a distributed job does, and most of what separates a job that runs in ten minutes from one that runs in ten hours is how many shuffles it does and how evenly the keys spread.

This module starts with MapReduce because its constraints (two phases, a disk write between them) make the shuffle visible, then moves to Spark, where the same shuffle hides behind a DataFrame API and you have to know it is there. The storage lessons cover what HDFS and S3 actually guarantee, why columnar formats make analytical scans ten to a hundred times cheaper, and how table formats like Iceberg and Delta turn a directory of files into something with transactions. The module closes with OLAP engines, where columnar storage and vectorised execution meet interactive latency.

By the end you will be able to look at a Spark plan or a warehouse query and predict, in bytes and partitions, why it is slow.

---
lesson: distributed-file-systems
source: 0cad6cf0efaef7d1
fit: great
desk:
  - "The write, failure and read trace, step by step with generation stamps"
  - "The HDFS versus object store comparison table, and the committer walkthrough"
  - "The worked design decision for 2 terabytes a day"
  - "Exercise: audit replication after nodes fail"
---
## Introduction

Your cluster has a thousand machines with 12 disks each. Hard drives fail at around 1 to 2 percent a year; Backblaze, with a fleet of about 344 thousand drives, reported 1.36 percent for 2025. So you should expect a few dead disks every week, and one of them will hold part of the file your nightly job is reading. At the same time, you want that file read at the speed of all twelve thousand disks together, not at the speed of whichever disk it happens to live on.

A distributed file system solves both at once. It cuts files into large blocks, spreads the blocks over every disk, and keeps several copies of each.

Almost every batch and streaming system sits on one of two storage models: a Hadoop-style distributed file system, HDFS, or a cloud object store like S3. From a Spark job they look the same: read every Parquet file under this path. But they promise different things about rename, listing and consistency, and those differences explain a surprising amount of modern data engineering, including why table formats like Iceberg exist.

Three ideas, then. How HDFS keeps blocks safe, and why its one metadata server is its limit. What an object store does and does not promise, above all about rename. And why small files hurt on both.

## Blocks and the write pipeline

HDFS has two kinds of server. DataNodes store blocks as ordinary files on local disks. The NameNode holds the entire namespace in memory: the directory tree, each file's list of blocks, and which DataNodes hold each block.

A file is cut into blocks of 128 megabytes, each stored on three DataNodes. The large block size is deliberate arithmetic. A spinning disk spends about 10 milliseconds seeking, then streams at 100 to 200 megabytes a second. If the seek should cost no more than about 1 percent of the read, each read must stream for at least a second, which means blocks of 100 megabytes or more.

Every DataNode sends a heartbeat every 3 seconds. One that goes quiet is declared dead only after about ten and a half minutes. That long timeout is on purpose: declaring a node dead after a network blip would trigger terabytes of pointless re-replication.

A client never pushes data through the NameNode. It asks where the blocks go, then streams to the DataNodes directly, through a pipeline: the client sends packets to the first DataNode, which forwards to the second, which forwards to the third, and acknowledgements flow back along the chain. The client's own bandwidth is spent once, not three times.

Here is the trace worth carrying. A client is writing a block through three DataNodes; call them A1, C2 and C3. The block has a version number the NameNode tracks, called the generation stamp, and it is 1001.

After 900 packets, C2's disk fails and it stops acknowledging. The client's timeout fires. It still holds every unacknowledged packet in an ack queue. It tells the NameNode, which issues a new generation stamp, 1002. The client rebuilds the pipeline as A1 then C3, both survivors truncate to the last byte they both hold, and the client resends from its ack queue. The block finishes with two copies, and on a later heartbeat the NameNode asks C3 to copy it to a third node.

The write never failed. The client noticed a pause. Now a question: a week later C2 comes back online, still holding its partial copy of the block. Why does the NameNode not count it as a replica?

[pause]

Its generation stamp is 1001, older than the 1002 the NameNode recorded, so it is marked stale and deleted instead of counted. That one number is what keeps a returning node from resurrecting a half-written block.

Reads have their own safety net. Data is checksummed every 512 bytes, costing about 0.8 percent. A reader that hits a corrupt chunk reports the bad replica, re-reads that range from another copy, and the NameNode schedules a fresh copy. The read completes with the right bytes and a warning in the log. Nobody gets paged.

## Placement is a failure model

The default placement puts the first copy on the writer's own node, the second on a node in a different rack, and the third on another node in that second rack. That encodes a failure model. A top-of-rack switch or a power strip can take out a whole rack, so no block may live on one rack only. But cross-rack bandwidth is scarce, so the write crosses racks just once.

The policy is only as real as the rack map. HDFS learns racks from a topology script, and a cluster that never configured one puts every node in one default rack. The policy becomes meaningless, and a rack outage becomes a data-loss event. So three replicas do not mean three racks. By default they mean two, and with no script, one.

Spreading copies everywhere also makes recovery fast. When an 8-terabyte disk dies, the other copies of its roughly 65 thousand blocks are scattered over hundreds of machines, so the whole fleet re-copies in parallel, a few gigabytes per node, done in minutes. A RAID array rebuilding the same 8 terabytes onto one spare disk at 150 megabytes a second takes about 15 hours, and a second failure in that window is far more likely to lose data.

Three replicas cost 200 percent overhead. For cold data, HDFS 3 supports erasure coding, for example Reed-Solomon six plus three: every six data blocks get three parity blocks, any six of the nine rebuild the data, and the overhead is 50 percent. It even survives three losses where replication survives two. The price: reading lost data means fetching six blocks and computing, and small files waste stripe space. So replication for hot data, erasure coding for large, cold data.

## The NameNode heap and small files

HDFS gives you one property that quietly underpins all of batch processing: renaming a directory is a single, atomic metadata change. MapReduce and Spark commit a job by having each task write into a temporary directory, then renaming successful attempts into place. Readers see none of the output or all of it. Hold on to that; it breaks on object stores.

The cost of keeping everything in one server's memory is the small-files problem. Every file, directory and block is an object in the NameNode's heap, at roughly 150 bytes each. A 1-gigabyte file is eight blocks plus a file, about 1.4 kilobytes of heap. A 100-kilobyte file is about 300 bytes of heap, for ten thousand times less data. Store a petabyte as 1-gigabyte files and you have about a million files. Store it as 100-kilobyte files and you have ten billion, which no NameNode can hold. Size a NameNode by objects, not by bytes stored.

The failure it causes is dramatic. A heap of hundreds of millions of objects takes a long garbage-collection pause, the pause outlasts the heartbeat window, healthy DataNodes are declared dead in a wave, and the NameNode starts re-replicating data that was never lost. Fix it by shrinking the object count: compaction, archiving, and federation, which splits the namespace across several NameNodes.

## Object stores and the missing rename

Cloud object stores replaced HDFS for most new platforms; Netflix's data warehouse lives in S3. They are not file systems. Keys are flat, and directories are just shared prefixes. You cannot append to an object, only replace it whole. Listing is paginated, a thousand keys per call. Compute is separate, so every byte crosses the network. And rename does not exist. It is emulated as a copy and a delete of every object, so its cost grows with the bytes, not the file count.

Two features matter. A large object is written as a multipart upload: parts upload in parallel, and the object appears all at once, only when the upload is completed. An upload never completed is invisible but still billed, so every output bucket needs a lifecycle rule that aborts them. And a read can ask for a byte range, which is the whole basis of reading just a few columns from a big Parquet file.

Consistency has a history. For years S3 was only eventually consistent for overwrites and listings: a job could write a thousand files and the next job's listing might return 997. Netflix built a tool to detect it. Since December 2020, S3 is strongly consistent for writes, overwrites, deletes and listings. In 2024 it gained conditional writes: create a key only if it does not exist, or replace it only if nobody else has since. That is the compare-and-swap that table formats once needed a separate database for.

Strong consistency did not bring atomic rename. Trace the classic Hadoop committer writing 4 thousand files, one terabyte, to S3. Each task writes into a temporary directory. Task commit renames its files, which on S3 is a copy and a delete per object. Job commit renames everything again into the final location: another copy and delete. Every byte is copied twice at commit time. And if the driver crashes in the middle, some files are in the final location and some are not. Partial output, visible to readers.

The second version of that committer copies straight to the final location at task commit. It halves the copying and makes the partial-output window as long as the whole job.

Two designs fix it properly. The magic committer has each task start a multipart upload against the final key and never complete it. Job commit then issues one small complete request per file: 4 thousand metadata requests instead of a terabyte of copies, and a crash leaves only invisible uploads. Visibility is still per file, not per job. The full fix is a table format, like Iceberg, Delta Lake or Hudi: the list of files lives in metadata, and a commit is one atomic pointer swap. Iceberg was started at Netflix largely because Hive tables on S3 depended on listings and renames that were slow and unsafe there.

## Cost, latency, and why small files survive

Per request, an object store is slow: tens to low hundreds of milliseconds to the first byte, and tens of megabytes a second per connection. Speed comes from parallelism: many concurrent ranged reads, so a cluster can read hundreds of gigabytes a second. S3 documents at least 3,500 writes and 5,500 reads a second per partitioned prefix. Exceed it and you get a 503, Slow Down, and must back off.

Requests also cost money. On S3 Standard in one US region, at the time of writing, a thousand writes or listings cost half a cent and a thousand reads less than a tenth as much. Reading a terabyte as 10 million objects of 100 kilobytes needs 10 million requests; the same terabyte as a thousand 1-gigabyte objects needs a few thousand. So the small-files problem survives the move to the cloud. It changes from a heap problem into a latency and cost problem, and the fix is the same: compact into files of roughly 128 megabytes to a gigabyte.

Why did separate storage win anyway? Networks moved to 25 to 100 gigabits per server, so a remote disk is often as fast as a local one, and storage and compute can scale apart: a nightly job starts 500 machines, reads S3, and releases them an hour later. The price is that every byte a query touches crosses the network, which is why the next lessons obsess over not reading bytes.

## In the interview

Here is a follow-up the lesson expects. How would you make a job's output on S3 appear atomically?

[pause]

You cannot with keys alone. Either commit through a table format, whose metadata pointer swap is the atomic step, or write a success marker after every file is complete and have readers require it. The magic committer removes the copying but still exposes files one by one. The wrong answer is "use the version two committer, it's faster", which widens the partial-output window.

And the trap question: S3 is strongly consistent now, so is a directory a safe table? No. Consistency fixed missing listings. It did not give you an atomic commit across many files, or isolation between writers, and planning by listing is still one request per thousand keys. Do not confuse consistency with atomicity.

## Recap

Four things to remember. Describe storage by its contract, rename, listing, append and consistency, before its throughput, because the contract decides whether a commit is safe. HDFS survives failures through a pipeline that shrinks rather than fails, generation stamps that reject stale copies, and rack-aware, declustered replication. Object stores have no rename, so rename-based commits are slow and non-atomic; use a multipart committer or a table format. And small files hurt everywhere: NameNode heap on HDFS, request latency and cost on S3, fixed by compaction.

At your desk: the write and failure trace, the comparison table and committer walkthrough, the worked design decision, and the replication audit exercise.

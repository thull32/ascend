---
lesson: search-engines
source: 38e8ded77a343f62
fit: partial
desk:
  - "The postings-list example, the AND and phrase traces, and the table of Lucene's files"
  - "The analyze output for the english analyzer"
  - "The BM25 formula and the three-document calculation, step by step"
  - "The two-phase distributed query diagram and the per-shard idf arithmetic"
  - "The Postgres full-text measurements table"
  - "Exercises: analyse, match and rank; rank documents with BM25"
---
## Introduction

The help centre has a search box, and behind it is a query that looks for the phrase connection pool anywhere in the article body, with wildcards on both sides. Over half a million articles it reads every row, about 200 milliseconds, and the cost grows with the corpus, because a leading wildcard cannot use a B-tree.

Worse, it is wrong in ways speed will not fix. It misses an article that only says "pooling connections". It cannot rank, so a footnote mention published last week beats the definitive guide. And a user who types "conection" with one n gets nothing.

Search engines exist because text retrieval is a different problem from row retrieval. The data structure is different, an inverted index. The idea of a match is different: terms produced by an analysis pipeline, not bytes. And the result is a ranking, not a set. Four ideas, then: what the index holds and why analysis decides what can ever match, how BM25 ranks, why search is near-real-time and sharded, and how to keep the index in sync with your database.

## The inverted index and analysis

A B-tree maps a key to rows. An inverted index maps each term to the sorted list of documents containing it, called the postings list, along with the positions where it occurs. A query looks up each term and combines lists. Because the lists are sorted by document ID, combining is a merge. AND is an intersection, and skip data stored every 128 documents lets it jump over whole blocks, so the cost tracks the shorter list. A phrase query intersects, then checks that the second word sits one position after the first.

Sorted IDs also make the lists compress. Store the gaps between IDs instead of the IDs, and most gaps fit in a byte. Common terms have the densest lists and the smallest gaps, so they compress best, which is exactly where it matters.

Now the part that causes most "search is broken" bugs. The index contains whatever the analyzer emitted, and a query only matches terms the same analysis produces. The English analyzer splits words, strips possessives, lowercases, drops stop words, and stems. "Pooling" becomes pool. "Connections" becomes connect. "With" is dropped, but leaves a gap in the positions so phrase distances stay right. So the query "connection pool" goes through the same chain, becomes connect pool, and now matches the article about pooling connections.

The failures are all mismatches between index time and query time, and they fail silently with zero results. A term query skips analysis, so searching for the literal word "Running" finds nothing: the index only holds run. Identifiers like SKUs, emails and error codes must not be stemmed or split; map them as keyword, which indexes the exact value as one term. And changing an analyzer does not change existing documents. Their segments keep their old terms, so the only safe change is a new index.

Typos are handled on the term dictionary, not the documents. Fuzzy matching allows one edit for terms of three to five characters and two for longer ones, so "conection" finds "connection" without scanning every term.

## Relevance: BM25

Matching gives a set. Search returns a ranking, and Lucene's default is BM25. A document's score is a sum over the query terms, and each term's contribution has three parts.

First, inverse document frequency: rare terms are worth more. A term in every document is nearly worthless. Second, saturation: more occurrences help, but with diminishing returns. In an average-length document, one occurrence scores 0.45 and ten score 0.89. Ten mentions are worth about twice one, not ten times, which is what stops keyword stuffing from winning. Third, length normalisation: a match in a short document counts for more than the same match in a long one.

The lesson works this by hand on three help articles and the query pgbouncer pool. The first article mentions pgbouncer once and pool twice. The third mentions pool five times and never mentions pgbouncer. Counting occurrences, which comes first?

[pause]

The first, by a wide margin. Pool is in every document, so its weight is tiny. Pgbouncer is in one, so it carries real weight. The single rare term in the first article is worth four and a half times all five of the third article's matches. That is the whole intuition: rarity beats repetition.

Ranking every match would be expensive, so Lucene stores, for each block of postings, the best score any document in it could reach. Once the current twentieth-best score beats what a block could contribute, the block is skipped. That is also why Elasticsearch stops counting at 10 thousand hits by default: exact counting would force every match to be visited. And conditions that should not affect ranking, like a tag or a date range, go in filter context, which is unscored and cached.

## Segments, refresh and shards

A Lucene index is a set of immutable segments. On a write, the document is analysed into an in-memory buffer and appended to the translog, which by default is fsynced before the request is acknowledged. So the write is durable. But it is not searchable yet. Every second, a refresh writes the buffer out as a new small segment and opens it for search. That is why Elasticsearch is near-real-time: a document is invisible for up to a second. If a caller must see it, ask the request to wait for the refresh; never refresh per document.

Segments are never modified. A delete clears a bit, and an update is a delete plus a new document. Background merges combine roughly ten similar segments at a time, and only then do deleted documents finally disappear. It is an LSM tree for text. One surprising consequence: deleted documents still count in the statistics until merged, so scores drift with update churn, and a primary and its replica, which merge independently, can score the same document slightly differently.

An index has a fixed number of primary shards, each a complete Lucene index. A search runs in two phases: every shard returns its own top 20 IDs and scores, the coordinator merges them, then fetches the winning documents. Aim for shards of 10 to 50 gigabytes.

Two problems come with sharding. Each shard computes term rarity from its own documents. In the lesson's example, the same document scores 2.8 times higher on one shard than another, purely by routing. For small or skewed indexes, a mode that first collects global statistics fixes it, at the cost of an extra round trip. And deep pagination: page 500 means every shard returns its top 10 thousand, and on five shards the coordinator sorts 50 thousand entries to return 20. Elasticsearch refuses past 10 thousand. Use search-after with a sort key over a point-in-time snapshot, so each page costs what the first did, like keyset pagination in SQL.

## Keeping the index in sync

Elasticsearch should almost never be your source of truth. It has no multi-document transactions, and you will reindex from scratch several times in a system's life. The database is the truth; the index is a derived view that lags it.

The tempting design is the dual write: insert into Postgres, then put into Elasticsearch, in the request handler. It fails both ways. If the second write fails, the index silently misses the document. If two updates race, the index can apply them in the opposite order to the database and keep the older title forever.

The robust design is change data capture: read the database's write-ahead log, which already has every committed change in commit order, and turn it into index operations. Delivery is at least once, so make the sink order-safe with external versions. If version 11 is indexed and version 10 arrives late, Elasticsearch rejects it and keeps 11. Duplicates are rejected the same way.

Mapping and analyzer changes go behind an alias. The application queries the alias. Build version two of the index, backfill it from the database, let change data capture catch it up, compare, then swap the alias in one atomic call. Rollback is swapping it back.

## Postgres full-text search

Postgres has an inverted index too: an analysed column of terms with positions, and a GIN index over it. Measured on half a million articles: the wildcard scan took 216 milliseconds. A ranked search for a rare term, in about 1,500 articles, took 1.7 milliseconds. A ranked search for a common term, in about 250 thousand articles, took 49 milliseconds.

Why the gap, even with a limit of 20? Because Postgres must rank every match before it can know the top 20, so cost tracks the match count, not the page size. Lucene's block skipping makes cost track the result size instead. Postgres's ranking also has no term rarity at all: a word in half the corpus counts like a rare one.

So stay in Postgres when the corpus is up to a few million documents, ranking can be simple, and results must reflect writes the moment they commit. Move to a search engine when relevance is a product feature, common-term queries over tens of millions of documents run under load, or you need facets, many languages and fuzzy matching at scale.

## In the interview

You index a document and search for it immediately. What happens?

[pause]

The write is in the indexing buffer and the translog, acknowledged and durable, but it is not in a searchable segment until the next refresh, up to a second later. If the caller must see it, wait for the refresh; never refresh per document. The wrong answer is "it is searchable when the index call returns".

And: how do you keep Elasticsearch in sync with Postgres? Change data capture from the write-ahead log in commit order, an idempotent sink with external versions, backfill and alias swaps for mapping changes, and lag monitoring on the replication slot, because an abandoned slot makes Postgres keep log until the disk fills. "Write to both in one transaction" is wrong: no transaction spans the two systems.

## Recap

Five things to remember. Search is analysis plus an inverted index plus ranking, and most missing-result bugs are index-time and query-time analysis disagreeing. BM25 rewards rare terms, saturates repetition, and favours short documents, so rarity beats repetition. Writes are durable at once but searchable after a refresh, about a second, and deletes only vanish at merge time. Sharding brings per-shard scoring and expensive deep pages: use search-after. And the index is never the truth: feed it by change data capture with external versions, and change mappings behind an alias.

At your desk: the postings and phrase traces, the Lucene file table, the BM25 calculation, the distributed query diagram, the Postgres measurements, and the two exercises.

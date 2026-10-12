---
lesson: search-engines
source: 296415106e99b80f
---
## 1

Users report that searching for Running, with a capital R, finds nothing, although many documents contain running. The field uses the English analyzer, and the application sends a term query. What is wrong?

A, BM25 gave those documents a score of zero, so they were filtered out. B, a term query skips analysis, but the index holds only the stemmed word run. C, the index has not refreshed yet, so those documents are still invisible. D, the English stop-word filter removed running from the index entirely.

[think]

The answer is B: a term query skips analysis, and the index holds only run.

Only the terms the analyzer emitted exist in the index: lowercasing and stemming turned running into run. A term query does no analysis, so it looks for the literal token with its capital R. A match query analyses the query text the same way as the documents. Stop words are words like the and of, and refresh lag lasts about a second, not indefinitely.

## 2

In BM25, with k1 set to 1.2, a term appears once in document A and ten times in document B, both of average length. How do their contributions for that term compare?

A, A scores higher, since BM25 penalises repeated terms as stuffing. B, B scores about twice as high, since term frequency saturates. C, they score the same, since BM25 counts only presence per document. D, B scores ten times higher, since term frequency is multiplied straight in.

[think]

The answer is B: B scores about twice as high, because term frequency saturates.

At average length, the frequency factor is the count divided by the count plus 1.2: about 0.45 for one occurrence and 0.89 for ten, a ratio of 1.96. More occurrences still help, so the presence-only and penalty models are wrong, but saturation stops keyword stuffing from dominating the ranking.

## 3

A corpus has 3 documents, and the query term pool appears in all of them. Under Lucene's BM25, what does pool contribute to the ranking?

A, nothing, because the inverse document frequency is exactly zero when the term is in every document. B, a small positive amount, because the inverse document frequency is the natural log of 1 plus 0.5 over 3.5. C, a negative amount, because a term in every document is noise. D, the largest amount, because it matches every document.

[think]

The answer is B: a small positive amount.

Lucene's formula gives the natural log of about 1.14, which is 0.13: positive but small, so a rarer query term dominates the ranking. The classic Robertson formula, without the added 1, would be the log of 0.5 over 3.5, which is negative. Lucene added the 1 precisely to avoid penalising documents for containing a common query term.

## 4

A team updates Postgres and then calls Elasticsearch in the same request handler. Occasionally, search shows an outdated title forever, although the database is correct. What is the likely mechanism?

A, the refresh interval is too long, so the new title never surfaces. B, two updates reached the index out of order, so the older one won. C, an analyzer change left the old title's terms in older segments. D, Elasticsearch drops some writes under load without reporting them.

[think]

The answer is B: two updates reached the index out of order, and the older one won.

Dual writes have no ordering guarantee between the two systems, so two concurrent updates can reach the index in the opposite order from the database. Refresh delays visibility by about a second, not forever. Change data capture applies committed changes in commit order, and external versioning makes the index reject a stale version, even if it arrives late.

## 5

A Postgres full-text query with a GIN index, ranked and limited to 20 rows, takes about 50 milliseconds for a common term, but under 2 milliseconds for a rare one. Why?

A, every match must be fetched and ranked before the top 20 are known. B, GIN indexes cannot store postings for terms in over half the rows. C, the web-search query parser reparses the query once for each row it sees. D, the planner's statistics are stale for the most common search terms.

[think]

The answer is A: every match must be fetched and ranked before the top 20 are known.

Ordering by the rank forces Postgres to compute the rank of every matching row before sorting. Measured, 1,550 matches took 1.7 milliseconds, and about 250 thousand took 49, with the planner switching to a sequential scan. Lucene's block-max WAND skips blocks that cannot enter the top k, so its cost tracks the result size much more closely.

## 6

You need to change the analyzer on a 200-million-document Elasticsearch index without downtime. What is the standard approach?

A, build a new index, backfill it and keep it in sync, then swap the alias to it. B, close the index, change its analyzer, and reopen it. C, update the mapping in place, since old documents are reanalysed. D, add a replica with the new analyzer, then promote it to primary.

[think]

The answer is A: build a new index, backfill and sync it, then swap the alias.

Segments are immutable and hold the terms the old analyzer produced, so neither an in-place change nor a reopened index reanalyses them, and a replica is a copy of the same segments. Build the new index, backfill it from the source of truth while change data capture keeps it current, compare, and move the alias atomically, which also gives an instant rollback.

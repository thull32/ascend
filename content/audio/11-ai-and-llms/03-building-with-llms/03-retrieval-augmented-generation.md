---
lesson: retrieval-augmented-generation
source: 3709b3f753a8bfa9
fit: partial
desk:
  - "The pipeline diagram and the four chunkers compared on the returns policy page"
  - "The cosine trace by hand, and the BM25 formula worked for the E4012 query"
  - "The reciprocal rank fusion, packing and golden-set tables"
  - "Exercises: chunk text with overlap, reciprocal rank fusion, and the context packer"
---
## Introduction

A support assistant has to answer questions from 12 thousand help-centre articles that change every week. The model has never seen them, or saw a stale copy in pretraining. Fine-tuning them in takes days, has to be redone on every change, and still cannot tell the user which article an answer came from. And putting everything in the prompt is out: at about 750 tokens an article, the corpus is 9 million tokens, nine times a million-token context window.

Retrieval-augmented generation, RAG, is the standard answer. At query time, find the handful of passages most likely to contain the answer, and put only those in the prompt. The model answers from text it can see and cite, and updating knowledge means updating an index, not a model.

The idea fits in a sentence. Almost all of the engineering, and almost all of the failures, sit in the retrieval half. Offline, you clean documents, chunk them, embed the chunks, and build a vector index and a keyword index. Online, you rewrite the question into a standalone query, retrieve from both indexes, fuse and rerank, pack the best chunks into the prompt, and the model answers with citations.

Two details are easy to miss. The query must be embedded with the same model as the chunks, or the two sets of vectors live in unrelated spaces. And in a conversation, "what about for EU customers?" means nothing without the previous turn, so a small, fast model first rewrites it into a standalone query: "refund window for EU customers".

Four ideas, then. Chunking, which caps everything downstream. Why keyword search stays beside vectors. Spending compute on a shortlist. And measuring retrieval on its own.

## Chunking

You cannot usefully embed whole documents. One vector for a 20-page article averages every topic in it into a blur. So documents are split into chunks, each with its own vector. The chunk is also what lands in the prompt, so chunking decides both what can be found and what the model sees.

The lesson takes a 101-word returns policy page with three sections: standard returns, electronics, and EU customers. Users ask two questions: how long do I have to return headphones, and can EU customers return things without a reason. Four chunkers.

Fixed windows of 20 words split both answer sentences across chunks, so no chunk answers either question, and the last chunk is the single word "item". Fixed windows of 40 words keep the headphones sentence whole but split the EU sentence in two, and the middle chunk mixes three topics. Forty words with 10 words of overlap keep both answers whole, at the price of a third more chunks, though topics are still mixed. Splitting on the page's own headings, with the heading path prefixed to each chunk, keeps both answers whole, one topic per chunk, in only three chunks.

So small fixed windows destroy answers, overlap rescues boundary sentences at a predictable cost, and structure gets both. That cost is a formula worth saying once: the chunk count grows by the chunk size divided by the chunk size minus the overlap. For the 9 million token corpus, 400-token chunks give 22,500 vectors. With 80 tokens of overlap, about 28 thousand: 25 percent more to embed and store.

Better chunkers split on headings, then paragraphs, then sentences, and never split a table row, a code block or a numbered procedure. And they prepend context. On its own, "It must be submitted within 30 days" no longer says of what. With "Returns policy, EU customers, refund window" in front of it, it does. Anthropic's contextual retrieval write-up prepended 50 to 100 generated tokens of context to each chunk, and top-20 retrieval failures fell from 5.7 percent to 3.7, and to 2.9 when the same context also went into the keyword index.

## Embeddings and nearest neighbours

An embedding model maps text to a vector, typically a few hundred to a few thousand dimensions, so that texts with similar meaning point the same way. Retrieval ranks chunks by the cosine of the angle between each chunk's vector and the query's.

The lesson traces this with five made-up, readable dimensions. For "how long do I have to return headphones", the electronics policy chunk scores 0.99. Second, at 0.87, comes the warranty page, because it is about electronics and time. Similarity measures topical closeness, not whether a passage answers the question. That gap is what reranking closes.

Three operational facts matter more than the choice of model. Some models are asymmetric and expect a different mode for queries and for documents; using the document mode for queries silently costs recall. Changing the embedding model means re-embedding everything, because vectors from two models are not comparable: build the new index beside the old one and switch reads when it is complete. And embeddings are weak on exact tokens. Error codes, product codes, version numbers and surnames carry little meaning, which is why keyword search stays in the pipeline.

As for the search itself, an exact scan of 28 thousand chunks takes a few milliseconds, and many RAG systems never need anything cleverer. At 10 million chunks, that scan streams about 41 gigabytes per query. Approximate indexes such as HNSW, a layered graph searched by greedy descent from sparse express lanes down to the dense bottom layer, touch a few thousand vectors instead, trading a little recall for orders of magnitude less work.

Filtering is where it gets subtle. Retrieve the top 10 and then filter to a tenant that owns 1 percent of the corpus, and you expect about 0.1 surviving results. You need filtering inside the search, a partition per large tenant, or a much larger candidate set. And when the filter is an access-control rule, it belongs in retrieval, never in the prompt.

## Keyword search and fusion

Keyword search keeps an inverted index: for each term, the list of documents that contain it. The ranking function behind Lucene, Elasticsearch and OpenSearch is BM25, and three ideas carry it. Rare terms count more: an error code found in two of five documents weighs about three times as much as "export", found in four. Term frequency saturates: at average length, one mention scores 1, four mentions about 1.7, and no number of mentions ever passes 2.2, so repeating a keyword cannot win on its own. And length is normalised, so a long list of every error code ranks below a short article about the one you asked for.

Take the query "error E4012 when exporting invoices". BM25 ranks the article that documents E4012 first. Vector search ranks general articles about exporting invoices first, and the E4012 article third: the embedding caught the topic and all but ignored the code. Each retriever catches what the other misses, so you run both and fuse the results.

But a BM25 score of 2.8 and a cosine of 0.83 are on different, query-dependent scales, and adding them lets whichever produces bigger numbers dominate. Reciprocal rank fusion uses only ranks. Each document scores one over 60 plus its rank, summed over the lists it appears in. Documents that both retrievers found rise above anything only one of them liked. The constant 60 controls how steeply rank matters: make it large and agreement dominates; make it small and one first place can outweigh several middling appearances.

## Reranking and packing

In the example, fusion still left the general exporting article narrowly above the one that answers the question. Embedding retrieval uses a bi-encoder: query and chunk are embedded separately, so chunk vectors are computed once, offline. That makes it fast, and it means the model never sees the query and the chunk together. A cross-encoder reranker reads them together and outputs a relevance score, and it puts the E4012 page first. But nothing can be precomputed: reranking 50 candidates of 400 tokens is 21 thousand tokens per query, 21 billion a day at a million queries. So the funnel is to retrieve 50 to 100 candidates cheaply with hybrid search, rerank them in tens to a few hundred milliseconds, and keep the top 5 to 10.

Then pack them into a token budget. The lesson's packer has 1,500 tokens, at most two chunks per document, and a minimum score of 0.3. It takes the two best E4012 chunks and one exporting chunk, 1,300 tokens. It skips a 610-token chunk that would overflow. Then a 150-token chunk fits, but scores 0.2. Should the packer take it?

[pause]

No. Without the floor, it would fill the space with an article about exporting reports, which costs tokens on every request and pulls the model toward the wrong passage. At a million queries a day and an illustrative 5 dollars per million input tokens, 1,300 tokens of context cost 6,500 dollars a day, so the floor and the per-document cap are cost controls as well as quality ones.

Then lay the chunks out deliberately. Label each with an id and ask for citations by id. Give the model an exit: if the passages do not contain the answer, say so; without it, the model fills the gap from memory. Put the strongest chunks first and do not pad, because models use the middle of a long context least reliably. And treat retrieved text as data: anyone who can get a document into your index can put instructions in front of your model.

## Evaluating retrieval

When a RAG answer is wrong, the first question is which half failed. Did retrieval miss the passage, or did the model misuse one it was given? So measure retrieval on its own, against a golden set of queries, each labelled with the chunks that answer it.

Recall at k is the fraction of relevant chunks in the top k. It is the ceiling on answer quality: the model cannot use a passage it never saw. Mean reciprocal rank averages one over the rank of the first relevant result, zero if none is found, so it rewards putting the answer near the top.

On the lesson's five queries, vector search alone gets a recall at one of 0.4, recall at three of 0.8, and a mean reciprocal rank of about 0.57. Hybrid search with reranking gets 0.8, 1.0, and 0.9. The two queries vector search struggled with both contained exact tokens: an error code, and a product code it never found in the top 10. That is the case hybrid search exists for. A real golden set has hundreds of queries, sliced by type, because an average over mixed queries hides exactly this pattern. For the generation half, measure faithfulness, whether every claim is supported by the passages, along with answer relevance and citation accuracy.

## In the interview

The follow-up the lesson leads with: your RAG assistant gives wrong answers. How do you find out why?

[pause]

Pull failing traces and check whether the right chunk id was in the prompt. If not, it is a retrieval problem: measure recall at k on a golden set of those queries, and fix it in chunking, hybrid search or query rewriting. If it was, it is a generation problem: rerank, pack fewer and better-ordered chunks, tighten the instructions, and measure faithfulness. The wrong answer is "rewrite the prompt" or "use a bigger model" before knowing which half failed.

And another: when would you not build RAG? When the corpus fits in the context with caching; a 50-page handbook is about 30 thousand tokens, and sending it whole cannot miss a passage. When the data is structured and wants SQL. When the question aggregates over every document, such as how many contracts mention auto-renewal, because top-k returns ten. And often for code, where search tools beat embeddings.

## Recap

Four things to remember. Chunking caps everything downstream: split on structure, prefix each chunk with where it sits, and know that overlap multiplies the chunk count by size over size minus overlap. Run hybrid search, because embeddings are weak on exact tokens, and fuse by rank, because the scores are not comparable. Rerank a shortlist and pack to a budget with a score floor, because every chunk is paid for on every request. And debug by asking which half failed, with recall at k and mean reciprocal rank on a sliced golden set.

At your desk: the four-chunker comparison, the cosine and BM25 arithmetic, the fusion, packing and golden-set tables, and three exercises: chunking with overlap, reciprocal rank fusion, and the context packer.

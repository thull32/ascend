---
slug: tokenization
title: "Tokenization: BPE, vocabularies and why tokens matter"
description: How byte-pair encoding turns text into token IDs, worked merge by merge and replayed on unseen words, byte-level fallback down to the UTF-8 bytes, a measured experiment on why languages the tokenizer rarely saw cost several times more, the cost arithmetic, what production tokenizers do under the hood, and the failures that are really tokenization.
minutes: 25
difficulty: medium
tags: [llm, tokenization, bpe, vocabulary, cost]
problems: []
---
Three complaints land in the same week. Finance asks why the LLM feature's bill doubled when the Japanese-language rollout went live, although traffic only grew 30%. A support agent reports that the assistant misspelled a customer's surname while copying it from the ticket. And a product manager has a screenshot of the model insisting that "strawberry" contains two r's. They look unrelated. They are all the same fact: a language model never sees characters or words. It sees a sequence of integers, **token IDs**, produced by a **tokenizer** that was fixed before the model was trained.

Price, context limits and latency are all counted in tokens. Some failures that look like reasoning failures are really tokenization artefacts. A senior engineer building on LLMs should know exactly what a token is, how the text got chopped up, and how to predict what a given input will cost.

## The problem tokenization solves

A neural network needs a fixed, finite set of inputs and outputs. The model has an embedding table with one row per vocabulary entry, and its last layer produces one score per vocabulary entry, as you saw in [Embeddings and similarity](/learn/ai-and-llms/ml-foundations/embeddings-and-similarity). Text, meanwhile, is unbounded: names, typos, URLs, code identifiers, emoji, a hundred scripts. The tokenizer maps the unbounded set of strings onto a finite vocabulary of pieces. There are three basic choices:

| Unit | Vocabulary size | Sequence length | Problem |
|---|---|---|---|
| Characters or bytes | 256 bytes | Long: roughly 4× more positions than subwords for English | Attention cost grows with the square of length, and the model must learn spelling from scratch |
| Whole words | Unbounded (millions) | Short | Every unseen word, name or typo is out-of-vocabulary; the embedding table explodes |
| **Subwords** | 32k to 256k | Moderate | Common words are one token, rare words are split into pieces |

Every major model family uses subword tokenization, in most cases with a **byte-level fallback**: any byte sequence that no learned piece covers is encoded byte by byte. Nothing is ever out-of-vocabulary; unusual text costs more tokens.

The dominant algorithm is **byte-pair encoding** (BPE). WordPiece and SentencePiece's unigram model are close relatives that choose merges or pieces by slightly different criteria (compared under the hood below); the consequences for you are the same.

## Training BPE, merge by merge

BPE learns its vocabulary from a corpus by repeatedly gluing together the most frequent adjacent pair of symbols:

1. Split text into words (real tokenizers use a regex that also separates punctuation and digits, and usually attaches a leading space to the following word).
2. Start with every word as a sequence of single characters (or bytes).
3. Count every adjacent pair across the corpus, weighted by how often each word occurs.
4. Merge the most frequent pair into a new symbol, add it to the vocabulary, and record the merge.
5. Repeat until the vocabulary reaches the target size.

Work it on a tiny corpus of four words with their frequencies: **log** ×6, **logs** ×3, **blog** ×2, **cog** ×4. (Real tokenizers would also mark word boundaries; this example leaves the marker out to keep the counts readable. The visualisation below includes it.)

Initially every word is spelled out, 50 symbols in total. The weighted pair counts are:

| Pair | Occurs in | Count |
|---|---|---|
| o g | log 6 + logs 3 + blog 2 + cog 4 | **15** |
| l o | log 6 + logs 3 + blog 2 | 11 |
| c o | cog 4 | 4 |
| g s | logs 3 | 3 |
| b l | blog 2 | 2 |

- **Merge 1:** `o` + `g` → `og` (15). The words become `l og`, `l og s`, `b l og`, `c og`.
- **Merge 2:** recount. `l og` appears in log, logs and blog: 6 + 3 + 2 = 11, the most frequent. Merge → `log`. Words: `log`, `log s`, `b log`, `c og`.
- **Merge 3:** `c og` (4) beats `log s` (3) and `b log` (2). Merge → `cog`.
- **Merge 4:** `log` + `s` → `logs` (3).
- **Merge 5:** `b` + `log` → `blog` (2).

After five merges, every word in the corpus is a single token: 50 symbols have become 15 tokens. The vocabulary is the six base characters plus five learned pieces, and the ordered **merge list** is the tokenizer. Production tokenizers run the same loop over a large sample of their training data until they have tens or hundreds of thousands of merges.

```python
from collections import Counter

def train_bpe(word_counts, num_merges):
    words = {tuple(w): c for w, c in word_counts.items()}   # "log" -> ('l', 'o', 'g')
    merges = []
    for _ in range(num_merges):
        pairs = Counter()
        for syms, c in words.items():
            for a, b in zip(syms, syms[1:]):
                pairs[a, b] += c                             # weight by word frequency
        if not pairs:
            break
        (a, b), _ = pairs.most_common(1)[0]
        merges.append((a, b))
        new_words = {}
        for syms, c in words.items():
            out, i = [], 0
            while i < len(syms):
                if i + 1 < len(syms) and syms[i] == a and syms[i + 1] == b:
                    out.append(a + b); i += 2
                else:
                    out.append(syms[i]); i += 1
            new_words[tuple(out)] = c
        words = new_words
    return merges

train_bpe({"log": 6, "logs": 3, "blog": 2, "cog": 4}, 5)
# [('o', 'g'), ('l', 'og'), ('c', 'og'), ('log', 's'), ('b', 'log')]
```

Step through the same process on a short text. The `▁` symbol marks the start of a word, which is why `▁log` (a word on its own) and the `log` inside `blog` end up as different tokens, exactly as `" log"` and `"log"` are different tokens in real vocabularies.

```viz
{"type": "ml", "algorithm": "tokenization", "text": "log logs blog cog log cog",
 "title": "Byte-pair encoding on a small text",
 "caption": "Each step merges the most frequent adjacent pair. Frequent fragments become tokens first; rare words stay split."}
```

## Encoding new text: replay the merges in order

To encode a string the model has never seen, split it into characters and **replay the merge list in the order it was learned**. Encode "clogs":

1. Start: `c l o g s`
2. Merge 1 (`o g`): `c l og s`
3. Merge 2 (`l og`): `c log s`
4. Merge 3 (`c og`): no match, because `c` is now next to `log`, not `og`
5. Merge 4 (`log s`): `c logs`
6. Merge 5 (`b log`): no match

Result: `[c, logs]`, two tokens for a word that never appeared in training. Encoding "blogs" gives `[b, logs]`, not `[blog, s]`, because the merge that created `logs` has a higher priority (it was learned earlier) than the one that creates `blog`. BPE encoding is not "find the longest known piece"; it is a deterministic replay of training history. That is why the same word can split differently depending on capitalisation or a leading space, and why you must count tokens with the model's actual tokenizer rather than guessing.

## Byte-level fallback, down to the bytes

Byte-level tokenizers start from the 256 possible byte values rather than from characters, and text is first encoded as UTF-8. A character outside ASCII is several bytes, and if no merge covers them, each byte is its own token:

| Text | Code points | UTF-8 bytes | Tokens if no merge covers it |
|---|---|---|---|
| `a` | 1 | `61` | 1 |
| `é` | 1 | `c3 a9` | 2 |
| `猫` | 1 | `e7 8c ab` | 3 |
| `🙂` | 1 | `f0 9f 99 82` | 4 |
| `👍🏽` (thumbs up, skin tone) | 2 | 8 bytes | 8 |
| `👨‍👩‍👧` (family, joined by zero-width joiners) | 5 | 18 bytes | 18 |

One visible symbol can therefore cost up to 18 tokens. Two consequences follow. A single token may be *part* of a character, so a streaming client that decodes each token's bytes separately prints `�` until the rest arrives; the fix is to buffer incomplete UTF-8 sequences. And truncating a prompt "to N tokens" by slicing characters or bytes, rather than token IDs, can cut a character in half.

## Measured: the training mix sets the price

A tokenizer's merges come from its training text, so text unlike it stays in small pieces. To see the size of the effect, train the byte-level version of `train_bpe` above (bytes instead of characters, plus a GPT-style regex that splits words, numbers and punctuation and keeps the leading space) with 2,000 merges on 300,000 characters of English lesson text from this site, then encode one sentence and its translations:

| Input | Characters | Tokens | Characters per token | Tokens relative to English |
|---|---|---|---|---|
| "The customer wants to cancel the subscription before the next billing date." | 75 | 24 | 3.1 | 1.0× |
| Spanish translation | 83 | 44 | 1.9 | 1.8× |
| Japanese translation | 35 | 105 | 0.33 | 4.4× |
| A UUID, `7f3a9c2e-1b4d-…` | 36 | 36 | 1.0 | |

The first merges learned were ` a`, ` t`, `he`, `in`, `er` and ` the`: English fragments. Spanish reuses some of them (` can`, `ent`) and falls apart elsewhere; Japanese got no merges at all, so every one of its 105 UTF-8 bytes is a token; the hex UUID is one token per character. Production tokenizers are trained on far larger multilingual mixes and do much better on Spanish and Japanese than this toy, but the mechanism is identical: the less of a language or format the tokenizer saw, the more tokens the same content costs. Measure it with your model's own tokenizer on real samples.

## Why tokens matter: cost and limits

**Everything is metered in tokens.** API prices are quoted per million input and output tokens, context windows are measured in tokens, and generation speed is tokens per second. For English prose with modern tokenizers, a useful rule of thumb is about three quarters of a word per token (1,000 words is roughly 1,300 tokens), and about four characters per token.

**Work the opening's bill.** Suppose each English request is 1,500 input and 300 output tokens, at illustrative prices of \$3 and \$15 per million: $1{,}500 \times 3/10^6 + 300 \times 15/10^6 = \$0.0045 + \$0.0045 = \$0.009$ per request, or \$9,000 a day at a million requests. The Japanese rollout adds 30% more requests. For the bill to double, each new request must cost $r$ times an English one where $1 + 0.3r = 2$, so $r = 3.3$: a tokenizer ratio in the range of the toy experiment's 4.4×, from content that is the same length on screen. Budget per language with measured ratios, not per request. Agent loops multiply all of this, because the whole transcript is resent on every step, as the token trace in [Context management](/learn/ai-assisted-engineering/tools-and-workflows/context-management) shows.

**Formats cost tokens.** JSON keys, quotes, braces and indentation all cost tokens, on input and on output. A verbose schema repeated in every request, or pretty-printed tool results, is a line item. Code tokenizes differently from prose; runs of spaces for indentation are usually merged, but not always.

**Different model families have different tokenizers.** The same prompt produces different token counts on different providers' models. Use the provider's token-counting endpoint or the model's own tokenizer library, and log actual token usage from API responses rather than estimating.

## Why tokens matter: behaviour

**Spelling and counting letters.** A word such as "strawberry" typically reaches the model as two or three token IDs. The model never sees ten letters; it sees opaque integers, and whatever it knows about the letters inside each token it learned indirectly from training text. Counting characters, reversing strings and spotting a transposed letter are therefore unreliable. If a feature depends on exact characters, do that part in code.

**Copying rare strings.** Names, order IDs, hashes, base64 blobs and UUIDs are split into many short, rarely seen tokens (36 tokens for one UUID in the toy tokenizer, 20 or more in production ones), and copying a long run of them exactly is where models slip. Give the model short handles such as `[doc 3]` or `customer A` and map them back in code.

**Arithmetic.** Numbers split into irregular chunks: one number might be a single token and its neighbour two. Digit positions do not line up across numbers, which makes column arithmetic awkward for the model. Some tokenizers split digits individually or in fixed groups of three to help. Regardless, send exact arithmetic to a tool.

**Leading spaces and prompt boundaries.** `"Paris"` and `" Paris"` are different tokens. If your prompt ends with a trailing space, the model must continue from an unusual position (the space it would normally generate as part of the next token is already there), and output quality can dip. Most chat APIs handle this for you; raw completion endpoints do not.

## Special tokens and chat templates

Vocabularies also contain **special tokens** that never come from ordinary text: beginning and end of sequence, and the markers that delimit system, user, assistant and tool turns in a **chat template**. When you call a chat API with a list of messages, the server renders them into one flat token sequence with these markers between the turns. The model learned during post-training that text after an "assistant" marker is its own voice and that an end-of-turn token means stop.

That has a security consequence. If a serving stack lets the literal text of a special token inside user input be converted into the real control token, a user can forge a system or assistant turn. Mature stacks encode user-supplied text so that it can never produce control tokens (OpenAI's open-source `tiktoken` library, for example, raises an error by default when input text contains a special token's string); if you run your own inference server, check that yours does. It is one of the injection routes covered in [LLM security](/learn/ai-and-llms/building-with-llms/llm-security).

## Under the hood: what a production tokenizer runs

- **Pre-tokenisation.** A regular expression first splits text into chunks (a word with its leading space, a run of up to three digits, a run of punctuation, whitespace), and merges never cross chunk boundaries. That is why ` the` is one token while `the.` is two, and why tokenizers that split digits into groups of at most three handle numbers more consistently.
- **Bytes as printable characters.** GPT-2's byte-level BPE maps each of the 256 byte values to a printable Unicode character so the merge machinery can work on strings; the leading space appears as `Ġ` in its vocabulary files, which is the `▁` of SentencePiece by another name.
- **Encoding by rank.** Replaying 100,000 merges one by one per word would be slow. Implementations store each merge's rank and repeatedly merge the adjacent pair with the lowest rank present, which gives the same result as replaying in order, in $O(n \log n)$ per chunk with a heap, and cache the result for frequent chunks. `tiktoken` and Hugging Face's `tokenizers` implement this in Rust; tokenization is a small fraction of a request's latency.
- **The relatives.** WordPiece (used by BERT) merges the pair that most increases the corpus likelihood, $\text{count}(ab) / (\text{count}(a)\,\text{count}(b))$, rather than the most frequent. The unigram model (in SentencePiece) starts from a large vocabulary, prunes the pieces whose removal hurts likelihood least, and encodes with the most probable segmentation (Viterbi), which also allows sampling alternative segmentations during training.
- **Published vocabulary sizes**, at the time of writing, run from about 32,000 (Llama 2) through about 100,000 and 200,000 (OpenAI's `cl100k_base` and `o200k_base` encodings) and 128,000 (Llama 3) to about 256,000 (Gemma).

## Choosing a vocabulary size

A larger vocabulary makes sequences shorter, so each request is cheaper, more text fits in the context window and attention does less work. It also makes the model bigger and each token's prediction costlier. The input embedding table has $V \times d$ parameters: with $V = 100{,}000$ and $d = 4{,}096$ that is about 410 million, and the output layer that scores every vocabulary entry for every generated token is another matrix of the same size unless the two are shared. That output matrix costs $2Vd$ FLOPs per token: 0.82 GFLOPs at 100,000 entries, about 6% of a 7B model's 14 GFLOPs per token, and 2.1 GFLOPs (15%) at 256,000. Rare vocabulary entries also get few training updates and end up with poorly learned embeddings.

| Vocabulary | Tokens for the same text | Embedding + output parameters at $d = 4{,}096$ (unshared) | Output-layer FLOPs per token | Multilingual efficiency | Undertrained rare entries |
|---|---|---|---|---|---|
| 32,000 | most | 0.26 B | 0.26 GFLOP | poor outside the main languages | few |
| 100,000 | fewer | 0.82 B | 0.82 GFLOP | good for major languages | some |
| 256,000 | fewest | 2.1 B | 2.1 GFLOP | best | many |

## Failure modes in production

**The bill outgrows the traffic.** *Symptom:* cost per request jumps after a launch in a new market or a new document type. *Diagnosis:* tokens per request by language or format; the new traffic tokenizes several times worse, as the $r = 3.3$ calculation showed. *Fix:* log input and output tokens per request with language and feature tags, budget per segment, and test token counts on real samples before launch.

**Context-limit errors on some inputs only.** *Symptom:* most requests fit, but code, logs, non-English text or base64 attachments fail with "prompt too long". *Diagnosis:* the size check assumed four characters per token, while those inputs run near one character per token (or worse, one token per byte). *Fix:* count with the model's tokenizer before sending and truncate by token IDs, keeping the most relevant parts ([Context windows and the KV cache](/learn/ai-and-llms/how-llms-work/context-windows-and-kv-cache) covers what else the window must hold).

**Corrupted copies.** *Symptom:* the model's output contains an order ID or surname that is almost, but not exactly, the input. *Diagnosis:* long rare-token sequences copied by generation. *Fix:* short handles in the prompt, substitution in code, and validation of any identifier the model emits against the source.

**Forged turns.** *Symptom:* a user message containing the text of an end-of-turn marker makes the model behave as if the system spoke. *Diagnosis:* the serving stack converted user text into control tokens. *Fix:* encode user text with special tokens disallowed, and test it with the literal marker strings.

**Broken characters in streamed output.** *Symptom:* `�` flickers in a streaming UI for emoji and CJK text. *Diagnosis:* a token ended in the middle of a multi-byte character and the client decoded it alone. *Fix:* buffer bytes until they form complete UTF-8 sequences before rendering.

## Exercises

```exercise
id: bpe-merge-step
title: One BPE merge step
prompt: |
  Implement one training step of byte-pair encoding.

  `words` is a list of words, each a list of string symbols (a word that occurs
  twice in the corpus appears twice in the list). Count every adjacent pair of
  symbols across all words, including overlapping positions (`a a a` contains the
  pair `(a, a)` twice). Pick the pair with the highest count; break ties by
  choosing the pair whose first occurrence comes earliest when scanning the words
  in order, left to right.

  Then merge that pair everywhere: scan each word left to right and replace each
  occurrence of the two adjacent symbols with their concatenation, without
  overlapping (`a a a` becomes `aa a`).

  Return `{"merged": <the new symbol>, "words": <the updated words>}`. If no word
  has two or more symbols, return `{"merged": null, "words": words}` unchanged
  (`None` in Python).

  Note that a pair is two symbols, not a string: `("ab", "c")` and `("a", "bc")`
  are different pairs.
languages: [python, javascript]
entry: bpe_merge_step
starter:
  python: |
    def bpe_merge_step(words):
        # 1. count adjacent pairs (first-seen order breaks ties)
        # 2. merge the winner left to right in every word
        return {"merged": None, "words": words}
  javascript: |
    function bpe_merge_step(words) {
      // 1. count adjacent pairs (first-seen order breaks ties)
      // 2. merge the winner left to right in every word
      return { merged: null, words: words };
    }
tests:
  - args: [[["l", "o", "g"], ["l", "o", "g", "s"], ["c", "o", "g"]]]
    expected: {"merged": "og", "words": [["l", "og"], ["l", "og", "s"], ["c", "og"]]}
    label: the most frequent pair wins
  - args: [[["a", "b"], ["c", "d"]]]
    expected: {"merged": "ab", "words": [["ab"], ["c", "d"]]}
    label: ties go to the pair seen first
  - args: [[["a", "a", "a"]]]
    expected: {"merged": "aa", "words": [["aa", "a"]]}
    label: overlapping occurrences merge left to right
  - args: [[["x"], ["y"]]]
    expected: {"merged": null, "words": [["x"], ["y"]]}
    label: no pairs left to merge
  - args: [[["ab", "c"], ["a", "bc"], ["x", "y"], ["x", "y"]]]
    expected: {"merged": "xy", "words": [["ab", "c"], ["a", "bc"], ["xy"], ["xy"]]}
    hidden: true
    label: pairs are pairs, not concatenated strings
  - args: [[["▁lo", "w"], ["▁lo", "w", "er"], ["n", "e", "w"]]]
    expected: {"merged": "▁low", "words": [["▁low"], ["▁low", "er"], ["n", "e", "w"]]}
    hidden: true
    label: multi-character symbols
  - args: [[]]
    expected: {"merged": null, "words": []}
    hidden: true
    label: empty corpus
hints:
  - "Use a dictionary (Python) or Map (JavaScript) keyed by the pair; both preserve insertion order, so a strict greater-than comparison while scanning keeps the first-seen pair on ties."
  - "Do not key the counts by `a + b`: two different pairs can concatenate to the same string. Use a tuple in Python and something like `JSON.stringify([a, b])` in JavaScript."
  - "When merging, advance the index by 2 after a merge and by 1 otherwise."
```

```exercise
id: bpe-encode
title: Encode a word by replaying merges
prompt: |
  Encode `word` (a string) with a trained BPE tokenizer. `merges` is the
  merge list in the order it was learned; each entry is a pair `[a, b]` of
  symbols. Start from the word's characters, then apply each merge in order:
  scan left to right and replace every adjacent `a`, `b` with the single
  symbol `a + b`, without overlapping. Return the final list of symbols.

  This is not longest-match: with the lesson's merges, "blogs" encodes as
  `["b", "logs"]`, not `["blog", "s"]`.
languages: [python, javascript]
entry: bpe_encode
starter:
  python: |
    def bpe_encode(word, merges):
        # your code here
        return list(word)
  javascript: |
    function bpe_encode(word, merges) {
      // your code here
      return [...word];
    }
tests:
  - args: ["clogs", [["o", "g"], ["l", "og"], ["c", "og"], ["log", "s"], ["b", "log"]]]
    expected: ["c", "logs"]
    label: an unseen word from the lesson
  - args: ["blogs", [["o", "g"], ["l", "og"], ["c", "og"], ["log", "s"], ["b", "log"]]]
    expected: ["b", "logs"]
    label: earlier merges win, not longer pieces
  - args: ["loglog", [["o", "g"], ["l", "og"], ["c", "og"], ["log", "s"], ["b", "log"]]]
    expected: ["log", "log"]
    label: a merge applies at every position
  - args: ["xyz", [["o", "g"], ["l", "og"]]]
    expected: ["x", "y", "z"]
    label: no merge applies
  - args: ["", [["a", "b"]]]
    expected: []
    hidden: true
    label: empty word
  - args: ["aaa", [["a", "a"]]]
    expected: ["aa", "a"]
    hidden: true
    label: overlapping pairs merge left to right
  - args: ["aaaa", [["a", "a"], ["aa", "aa"]]]
    expected: ["aaaa"]
    hidden: true
    label: a merge of merged symbols
hints:
  - "Keep a list of current symbols; for each merge build a new list in one left-to-right pass."
  - "After merging at position i, skip to i + 2 so that one symbol is never used by two merges."
```

## Interviewer follow-ups

**"Why can't a model reliably count the r's in 'strawberry'?"** *Model answer:* it receives two or three token IDs, not ten characters; what it knows about the letters inside a token is learned indirectly, so character-level operations are unreliable. Route exact string work to code, or have the model spell the word out character by character first so each letter becomes its own token. *Common wrong answer:* "it cannot reason", when the information is missing from its input rather than mishandled.

**"How would you estimate the token cost of a feature before launch?"** *Model answer:* collect realistic samples per language and input type, count them with the target model's tokenizer or counting endpoint, multiply by input and output prices, add the system prompt and tool schemas that ride on every request, and plan for the tail (the longest 1% of inputs). After launch, reconcile with the usage numbers the API returns. *Common wrong answer:* "about four characters per token", which fails for code, non-English text and identifiers.

**"What does vocabulary size trade off?"** *Model answer:* shorter sequences (cheaper attention, more content per window, better multilingual efficiency) against bigger embedding and output matrices (0.82 GFLOPs per generated token at 100,000 entries and $d = 4{,}096$, 2.1 at 256,000) and rare entries that are poorly trained. *Common wrong answer:* "bigger is always better".

**"How is BPE different from WordPiece and unigram tokenization?"** *Model answer:* BPE merges the most frequent adjacent pair; WordPiece merges the pair that most increases likelihood; unigram prunes a large vocabulary by likelihood and encodes with the most probable segmentation. All three end with a subword vocabulary and a deterministic encoder, and the engineering consequences are the same. *Common wrong answer:* treating them as fundamentally different in what they cost you.

## What mid-level engineers get wrong

- **Estimating tokens from characters or words for every input.** Code, non-English text and identifiers break the four-characters rule.
- **Counting with the wrong tokenizer.** Each model family has its own; estimates from another can be off by a meaningful margin.
- **Truncating by characters.** It can cut a multi-byte character and still overflow the window.
- **Pasting long identifiers into prompts.** They cost many tokens and come back corrupted.
- **Asking the model for exact character or digit work.** Tokenization hides the characters; do it in code.
- **Rendering streamed tokens byte by byte.** Multi-byte characters arrive split across tokens.

## Senior signals

- You **count tokens with the target model's tokenizer** (or its token-counting endpoint) and log real usage, instead of estimating from word counts or another model family's tokenizer.
- You **budget per language and per format**, and can work backwards from a bill to the token ratio that explains it.
- You know BPE encoding is a **replay of merges by rank**, not longest match, and that byte-level fallback means one visible character can be many tokens.
- You recognise **tokenization artefacts** (letter counting, copying long identifiers, digit arithmetic, trailing spaces, split UTF-8 in streams) and route exact string and number work to code or tools.
- You replace long opaque identifiers in prompts with **short handles** and map them back afterwards.
- You know chat messages are rendered into **one token stream with special control tokens**, and that user text must never be able to produce them.

## Check yourself

```quiz
- q: >-
    A BPE tokenizer learned merges in this order: (o, g), (l, og), (c, og), (log, s), (b, log). How does it encode "blogs"?
  options: ["[blog, s]", "[blogs]", "[b, logs]", "[b, l, og, s]"]
  answer: 2
  explanation: >-
    Encoding replays merges in training order. After (o, g) and (l, og) the word is b log s; (c, og) does not apply; (log, s) fires next and gives b logs; by the time (b, log) is tried, log has already been absorbed into logs. BPE is not a longest-match lookup, so [blog, s] is the tempting wrong answer.
- q: >-
    Your feature launches in a new language and the cost per request rises far more than the change in request volume. What is the most likely explanation?
  options: ["The model writes longer answers in other languages by design", "The provider charges a higher per-token rate for non-English text", "Non-English prompts bypass the provider's prompt cache entirely", "The tokenizer splits that language into many more tokens per word"]
  answer: 3
  explanation: >-
    Pricing is per token, and tokenizers learn fewer merges for languages that were less represented in their training mix, so the same content costs more input and output tokens; in the toy experiment the Japanese sentence cost 4.4 times the English one. Answers may also be longer, but the tokenization effect is systematic; per-token rates do not depend on language.
- q: >-
    Traffic grows 30% when a new market launches, and the total bill doubles. If the old requests are unchanged, how many times the tokens of an old request must each new request use?
  options: ["About 1.3 times", "About 2 times", "About 3.3 times", "About 6.7 times"]
  answer: 2
  explanation: >-
    Total cost is 1 + 0.3r in units of the old bill, and setting it equal to 2 gives r = 1/0.3 ≈ 3.3. Doubling the bill with 30% more requests needs each new request to be far more expensive, which points at the tokenizer ratio for that market's language rather than at request volume.
- q: >-
    Why is it risky to ask a model to copy 40 order IDs of the form 7f3a9c2e-1b4d-4e8f-a6c1-0d2e3f4a5b6c from the prompt into its answer?
  options: ["The tokenizer strips unfamiliar hex strings before the model sees them", "Hyphens are control tokens, so the model cannot emit them in output", "Each ID splits into many rare tokens, so exact copying is highly error-prone", "Each ID matches a special token, so emitting one ends the response"]
  answer: 2
  explanation: >-
    Hex-and-hyphen strings fragment into many tokens with little training signal, which costs a lot of context, and reproducing long sequences of them exactly is where models slip. Give the model short handles and map them back to IDs in code. The tokenizer never drops the text; it encodes it expensively.
- q: >-
    A streaming chat UI shows a replacement character that flickers and then turns into the right emoji. What is happening?
  options: ["The model first sampled a wrong token and then corrected it", "A token ended mid-character, and the client decoded the partial bytes", "The emoji is a special token that the server escapes while streaming", "The font lacks the emoji until the whole response has been received"]
  answer: 1
  explanation: >-
    With byte-level tokens, one emoji can span several tokens (four to eighteen UTF-8 bytes), so the first token carries an incomplete byte sequence that decodes to a replacement character. The client should buffer until the bytes form complete UTF-8 sequences. Sampled tokens are never revised, and emoji are ordinary bytes, not special tokens.
- q: >-
    What happens when a byte-level BPE tokenizer meets a word, emoji or script it never saw during training?
  options: ["It emits an unknown-token placeholder, so that content is lost", "It raises an encoding error that the caller must handle", "It falls back to smaller pieces and, at worst, to single bytes", "It maps the input to the nearest known word in its vocabulary"]
  answer: 2
  explanation: >-
    Byte-level fallback means every possible string has an encoding. Unfamiliar text costs more tokens (up to one per UTF-8 byte) and gives the model less familiar input. Unknown-token placeholders were a problem of word-level vocabularies, not byte-level BPE.
```

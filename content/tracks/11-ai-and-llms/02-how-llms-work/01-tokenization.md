---
slug: tokenization
title: "Tokenization: BPE, vocabularies and why tokens matter"
description: How byte-pair encoding turns text into token IDs, worked merge by merge, and why tokens rather than words decide an LLM's cost, context limits and some of its strangest failures.
minutes: 25
difficulty: medium
tags: [llm, tokenization, bpe, vocabulary, cost]
problems: []
---
Three complaints land in the same week. Finance asks why the LLM feature's bill doubled when the Japanese-language rollout went live, although traffic only grew 30%. A support agent reports that the assistant misspelled a customer's surname while copying it from the ticket. And a product manager has a screenshot of the model insisting that "strawberry" contains two r's. They look unrelated. They are all the same fact: a language model never sees characters or words. It sees a sequence of integers, **token IDs**, produced by a **tokenizer** that was fixed before the model was trained.

Price, context limits and latency are all counted in tokens. Some failures that look like reasoning failures are really tokenization artefacts. A senior engineer building on LLMs should know exactly what a token is and how the text got chopped up.

## The problem tokenization solves

A neural network needs a fixed, finite set of inputs and outputs. The model has an embedding table with one row per vocabulary entry, and its last layer produces one score per vocabulary entry, as you saw in [Embeddings and similarity](/learn/ai-and-llms/ml-foundations/embeddings-and-similarity). Text, meanwhile, is unbounded: names, typos, URLs, code identifiers, emoji, a hundred scripts. The tokenizer maps the unbounded set of strings onto a finite vocabulary of pieces. There are three basic choices:

| Unit | Vocabulary size | Sequence length | Problem |
|---|---|---|---|
| Characters or bytes | 256 bytes | Long: roughly 4× more positions than subwords for English | Attention cost grows with the square of length, and the model must learn spelling from scratch |
| Whole words | Unbounded (millions) | Short | Every unseen word, name or typo is out-of-vocabulary; the embedding table explodes |
| **Subwords** | 32k to 256k | Moderate | Common words are one token, rare words are split into pieces |

Every major model family (Claude, GPT, Gemini, Llama) uses subword tokenization, in most cases with a **byte-level fallback**: any byte sequence that no learned piece covers is encoded byte by byte. Nothing is ever out-of-vocabulary; unusual text just costs more tokens.

The dominant algorithm is **byte-pair encoding** (BPE). WordPiece and SentencePiece's unigram model are close relatives that choose merges or pieces by slightly different criteria; the consequences for you are the same.

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

## Why tokens matter: cost and limits

**Everything is metered in tokens.** API prices are quoted per million input and output tokens, context windows are measured in tokens, and generation speed is tokens per second. For English prose with modern tokenizers, a useful rule of thumb is about three quarters of a word per token (so 1,000 words is roughly 1,300 tokens), but it is only a rule of thumb.

**Other languages cost more.** A tokenizer learns its merges from its training mix. Languages and scripts that were underrepresented get fewer merges, so the same sentence splits into more tokens, sometimes several times more than its English translation. That was the finance team's surprise: the Japanese traffic was fewer requests but many more tokens per request. Budget per language, and measure with real samples.

**Formats cost tokens.** JSON keys, quotes, braces and indentation all cost tokens, on input and on output. A verbose schema repeated in every request, or pretty-printed tool results, is a line item. Code tokenizes differently from prose; runs of spaces for indentation are usually merged, but not always.

**Different model families have different tokenizers.** The same prompt produces different token counts on Claude, GPT, Gemini and Llama models. Estimating one provider's cost with another's tokenizer can be off by a meaningful margin. Use the provider's token-counting endpoint or the model's own tokenizer library, and log actual token usage from API responses rather than estimating.

## Why tokens matter: behaviour

**Spelling and counting letters.** A word such as "strawberry" typically reaches the model as two or three token IDs. The model never sees ten letters; it sees opaque integers, and whatever it knows about the letters inside each token it learned indirectly from training text. Counting characters, reversing strings and spotting a transposed letter are therefore unreliable. If a feature depends on exact characters, do that part in code.

**Copying rare strings.** Names, order IDs, hashes, base64 blobs and UUIDs are split into many short, rarely seen tokens, and copying a long run of them exactly is where models slip. A single UUID can cost 20 or more tokens. Keep long identifiers out of the prompt when you can: give the model short handles such as `[doc 3]` or `customer A` and map them back in code.

**Arithmetic.** Numbers split into irregular chunks: one number might be a single token and its neighbour two. Digit positions do not line up across numbers, which makes column arithmetic awkward for the model. Some tokenizers split digits individually or in fixed groups of three to help. Regardless, send exact arithmetic to a tool.

**Leading spaces and prompt boundaries.** `"Paris"` and `" Paris"` are different tokens. If your prompt ends with a trailing space, the model must continue from an unusual position (the space it would normally generate as part of the next token is already there), and output quality can dip. Most chat APIs handle this for you; raw completion endpoints do not.

## Special tokens and chat templates

Vocabularies also contain **special tokens** that never come from ordinary text: beginning and end of sequence, and the markers that delimit system, user, assistant and tool turns in a **chat template**. When you call a chat API with a list of messages, the server renders them into one flat token sequence with these markers between the turns. The model learned during post-training that text after an "assistant" marker is its own voice and that an end-of-turn token means stop.

That has a security consequence. If a serving stack lets the literal text of a special token inside user input be converted into the real control token, a user can forge a system or assistant turn. Mature stacks encode user-supplied text so that it can never produce control tokens; if you run your own inference server, check that yours does. It is one of the injection routes covered in [LLM security](/learn/ai-and-llms/building-with-llms/llm-security).

## Choosing a vocabulary size

A larger vocabulary makes sequences shorter, so each request is cheaper, more text fits in the context window and attention (whose cost grows with the square of length) does less work. It also makes the model bigger and each token's prediction costlier. The input embedding table has $V \times d$ parameters: with a 100,000-token vocabulary and $d = 4{,}096$ that is about 410 million parameters, and the output layer that scores every vocabulary entry for every generated token is another matrix of the same size unless the two are shared. Rare vocabulary entries also get few training updates and end up with poorly learned embeddings. Current model families sit roughly between 32,000 and 256,000 entries, with the larger vocabularies favoured by models that aim to serve many languages efficiently.

## Exercise

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

## Senior signals

- You **count tokens with the target model's tokenizer** (or its token-counting endpoint) and log real usage, instead of estimating from word counts or another model family's tokenizer.
- You **budget per language and per format**: non-English traffic, JSON-heavy prompts and verbose tool outputs cost more tokens than you expect.
- You recognise **tokenization artefacts** (letter counting, copying long identifiers, digit arithmetic, trailing spaces) and route exact string and number work to code or tools.
- You replace long opaque identifiers in prompts with **short handles** and map them back afterwards.
- You know chat messages are rendered into **one token stream with special control tokens**, and that user text must never be able to produce them.

## Check yourself

```quiz
- q: >-
    A BPE tokenizer learned merges in this order: (o, g), (l, og), (c, og), (log, s), (b, log). How does it encode "blogs"?
  options: ["[blog, s]", "[b, logs]", "[b, l, og, s]", "[blogs]"]
  answer: 1
  explanation: >-
    Encoding replays merges in training order. After (o, g) and (l, og) the word is b log s; (c, og) does not apply; (log, s) fires next and gives b logs; by the time (b, log) is tried, log has already been absorbed into logs. BPE is not a longest-match lookup, so [blog, s] is the tempting wrong answer.
- q: >-
    Your feature launches in a new language and the cost per request rises far more than the change in request volume. What is the most likely explanation?
  options: ["The provider charges more for non-English requests", "Non-English prompts disable caching", "The tokenizer splits text in that language into many more tokens per word, so each request uses more input and output tokens", "The model generates longer answers in other languages by design"]
  answer: 2
  explanation: >-
    Pricing is per token, and tokenizers learn fewer merges for languages that were less represented in their training mix, so the same content costs more tokens. Measure token counts on real samples in each language. Answers may also be longer, but the tokenization effect is systematic and usually the larger one.
- q: >-
    Why is it risky to ask a model to copy 40 order IDs of the form 7f3a9c2e-1b4d-4e8f-a6c1-0d2e3f4a5b6c from the prompt into its answer?
  options: ["Each ID becomes many short, rarely seen tokens, which costs a lot of context and makes exact copying error-prone", "The IDs will be removed by the tokenizer", "Models cannot output hyphens", "IDs are special tokens and end the response"]
  answer: 0
  explanation: >-
    Hex-and-hyphen strings fragment into many tokens with little training signal, and reproducing long sequences of them exactly is where models slip. Give the model short handles and map them back to IDs in code. The tokenizer never drops the text; it just encodes it expensively.
- q: >-
    What happens when a byte-level BPE tokenizer meets a word, emoji or script it never saw during training?
  options: ["It emits an unknown-token placeholder and the content is lost", "It raises an error", "It maps the word to the nearest known word", "It falls back to smaller learned pieces and ultimately to individual bytes, so the text is always encodable, just in more tokens"]
  answer: 3
  explanation: >-
    Byte-level fallback means every possible string has an encoding. Unfamiliar text simply costs more tokens and gives the model less familiar input. Unknown-token placeholders were a problem of word-level vocabularies.
- q: >-
    A team estimates the monthly cost of a Llama-based deployment by counting tokens with a GPT tokenizer library. What is wrong?
  options: ["Nothing; all tokenizers produce the same counts", "Different model families use different vocabularies and merge rules, so token counts for the same text differ; count with the target model's own tokenizer", "Llama models are priced per word, not per token", "Tokenizer libraries only count input tokens"]
  answer: 1
  explanation: >-
    Each family trains its own tokenizer, so the same text yields different counts, sometimes by a meaningful margin. Use the model's tokenizer or the provider's token-counting endpoint, and reconcile against the usage figures returned by real requests.
```

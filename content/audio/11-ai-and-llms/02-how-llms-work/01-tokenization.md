---
lesson: tokenization
source: 560784c4909a2f43
fit: partial
desk:
  - "The BPE merge trace on log, logs, blog and cog, with the pair-count tables and the train BPE code"
  - "Encoding clogs and blogs by replaying the merge list, step by step"
  - "The UTF-8 byte table, from a single letter to the 18-byte family emoji"
  - "The vocabulary-size table, and the under-the-hood notes on pre-tokenisation, encoding by rank, WordPiece and unigram"
  - "Exercises: one BPE merge step, and encoding a word by replaying merges"
---
## Introduction

Three complaints land in the same week. Finance asks why the bill for the LLM feature doubled when the Japanese-language rollout went live, although traffic only grew 30 percent. A support agent reports that the assistant misspelled a customer's surname while copying it from the ticket. And a product manager has a screenshot of the model insisting that "strawberry" has two r's.

They look unrelated. They are all the same fact. A language model never sees characters or words. It sees a sequence of integers, called token IDs, produced by a tokenizer that was fixed before the model was trained.

Price, context limits and latency are all counted in tokens, and some failures that look like reasoning failures are really tokenization. Three ideas, then. How byte-pair encoding chops text into pieces. Why the same content can cost four times as much in another language. And which model failures are really the tokenizer's fault.

## Why subwords

A neural network needs a fixed, finite set of inputs and outputs. The model has an embedding table with one row per vocabulary entry, and its last layer produces one score per vocabulary entry. Text, meanwhile, is unbounded: names, typos, web addresses, code identifiers, emoji, a hundred scripts. The tokenizer maps that unbounded set of strings onto a finite vocabulary of pieces.

There are three basic choices. Characters or bytes give you a tiny vocabulary of 256, but sequences roughly four times longer than subwords for English, and attention cost grows with the square of the length. Whole words give short sequences, but every unseen word, name or typo is out of vocabulary, and the embedding table explodes into the millions.

Subwords sit in between, with vocabularies of 32 thousand to 256 thousand. Common words are one token; rare words are split into pieces. Every major model family uses them, in most cases with a byte-level fallback: any byte sequence no learned piece covers is encoded byte by byte. So nothing is ever out of vocabulary. Unusual text just costs more tokens.

## Byte-pair encoding

The dominant algorithm is byte-pair encoding, BPE. Its training loop is one sentence: repeatedly glue together the most frequent adjacent pair of symbols, record the merge, and stop when the vocabulary is big enough.

Picture a tiny corpus of four words: log six times, logs three times, blog twice, and cog four times. Every word starts spelled out letter by letter. The most frequent adjacent pair is "o, g", which appears in all four words, 15 times in total. So the first merge glues o and g into one symbol. Recount, and "l" next to "og" appears 11 times, so the second merge makes "log". Three more merges make cog, logs and blog. After five merges, every word in the corpus is a single token, and 50 symbols have become 15.

Here is the key idea. The ordered list of merges is the tokenizer. Production tokenizers run the same loop over a large sample of their training data until they have tens or hundreds of thousands of merges.

To encode text the model has never seen, you split it into characters and replay the merges in the order they were learned. Before I tell you: with those five merges, how does the word "blogs" come out? As "blog" plus "s"?

[pause]

No. It comes out as "b" plus "logs". The merge that makes "logs" was learned before the one that makes "blog", so it fires first and swallows the "log" that "blog" would have needed. BPE encoding is not "find the longest known piece". It is a deterministic replay of training history. That is why the same word can split differently with a capital letter or a leading space, and why you must count tokens with the model's actual tokenizer rather than guess.

## Bytes, and the price of a language

Byte-level tokenizers start from the 256 possible byte values, and text is first encoded as UTF-8. Any character outside plain ASCII is several bytes, and if no merge covers it, each byte is its own token. An accented e is two bytes. The Japanese character for cat is three. A smiley emoji is four. A family emoji, three people joined by invisible joiners, is 18 bytes, so one visible symbol can cost up to 18 tokens.

Two consequences follow. A single token can be part of a character, so a streaming client that decodes each token on its own briefly shows a replacement character until the rest arrives; the fix is to buffer incomplete byte sequences. And truncating a prompt by slicing characters or bytes, rather than token IDs, can cut a character in half.

Now the experiment that explains the bill. A tokenizer's merges come from its training text, so text unlike it stays in small pieces. The lesson trained a toy byte-level tokenizer with 2,000 merges on 300 thousand characters of English, then encoded one sentence about a customer cancelling a subscription, and its translations.

The English sentence took 24 tokens. The Spanish took 1.8 times as many. The Japanese took 105 tokens, 4.4 times the English. Japanese got no merges at all, so every one of its UTF-8 bytes was a token. A UUID came out at one token per character.

The first merges learned were English fragments: "the", "he", "in", "er". Production tokenizers are trained on far larger multilingual mixes and do much better than this toy, but the mechanism is identical. The less of a language or format the tokenizer saw, the more tokens the same content costs.

## The cost arithmetic

Everything is metered in tokens. Prices are quoted per million input and output tokens, context windows are measured in tokens, and generation speed is tokens per second. For English prose, OpenAI's published rule of thumb is about four characters per token, or three quarters of a word. A thousand words is roughly 1,300 tokens.

Work the opening's bill. Say an English request is 1,500 input tokens and 300 output tokens, at illustrative prices of 3 dollars and 15 dollars per million. Each half costs about half a cent, so a request is just under a cent, and a million requests a day is 9 thousand dollars.

The Japanese rollout adds 30 percent more requests, and the bill doubles. So the old traffic is one bill, and the new traffic must add another whole bill on its own. Thirty percent of the requests carrying a whole bill means each new request costs about 3.3 times an English one. That is squarely in the range of the toy experiment's 4.4, from content that is the same length on screen. Budget per language, with measured ratios, not per request.

Formats cost tokens too. JSON keys, quotes, braces and indentation are all tokens, on input and output, so a verbose schema repeated in every request is a line item. And different model families have different tokenizers, so the same prompt gives different counts on different providers. Use the provider's counting endpoint or the model's own tokenizer, and log the real usage the API returns.

## When tokens change behaviour

Spelling and counting letters. "Strawberry" reaches the model as one to three token IDs. In one of OpenAI's encodings, strawberry with a leading space is a single token, and without the space it is three. The model never sees ten letters. Whatever it knows about the letters inside a token, it learned indirectly. So counting characters, reversing strings and spotting a transposed letter are unreliable. If a feature depends on exact characters, do that part in code.

Copying rare strings. Names, order IDs, hashes and UUIDs split into many short, rarely seen tokens, around 35 for one UUID, and copying a long run of them exactly is where models slip. That is the misspelled surname. Give the model short handles, like "document 3" or "customer A", and map them back in code.

Arithmetic. Numbers split into irregular chunks, so digit positions do not line up across numbers. Some tokenizers split digits individually or in groups of at most three to help. Either way, send exact arithmetic to a tool.

Special tokens. A vocabulary also holds control tokens that never come from ordinary text: the markers that separate system, user, assistant and tool turns. A chat request is rendered into one flat token stream with those markers between the turns. If your serving stack lets the literal text of a marker in user input become the real control token, a user can forge a system turn. Mature stacks encode user text so it can never produce a control token; if you run your own inference server, check that yours does.

## Vocabulary size

A larger vocabulary makes sequences shorter, so requests are cheaper, more fits in the window, and attention does less work. It also makes the model bigger. At 100 thousand entries, the embedding table alone is about 410 million parameters, and the output layer that scores every entry for every generated token costs about 6 percent of a 7 billion parameter model's work per token. At 256 thousand entries, that rises to about 15 percent. And rare entries get few training updates, so they end up poorly learned.

## In the interview

Here is the classic. Why can't a model reliably count the r's in "strawberry"?

[pause]

It receives one to three token IDs, not ten characters, and what it knows about the letters inside a token is learned indirectly. Route exact string work to code, or have the model spell the word out first so each letter becomes its own token. The common wrong answer is "it cannot reason", when the information is missing from its input rather than mishandled.

And the practical one: how would you estimate the token cost of a feature before launch? Collect realistic samples per language and input type, count them with the target model's tokenizer, multiply by input and output prices, add the system prompt and tool schemas that ride on every request, and plan for the longest 1 percent of inputs. After launch, reconcile with the usage the API reports. The wrong answer is "about four characters per token", which fails for code, non-English text and identifiers.

## Recap

Four things to remember. A model sees token IDs, and BPE encoding is a replay of learned merges in order, not a longest-match lookup. Byte-level fallback means nothing is out of vocabulary, but one visible character can be many tokens. The training mix sets the price: a language the tokenizer rarely saw can cost several times more for the same content, so budget per language with your model's own tokenizer. And letter counting, copying long identifiers and digit arithmetic are tokenization problems: do them in code, and give the model short handles.

At your desk: the merge-by-merge trace and its code, the encoding replay, the UTF-8 byte table, the vocabulary-size table, and the two BPE exercises.

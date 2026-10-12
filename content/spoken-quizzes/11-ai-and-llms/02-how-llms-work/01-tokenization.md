---
lesson: tokenization
source: b07d90ec0dd914ec
---
## 1

A BPE tokenizer learned five merges, in this order: o with g, then l with og, then c with og, then log with s, then b with log. How does it encode the word "blogs"?

A, "blog", then "s". B, the single token "blogs". C, "b", then "logs". D, "b", "l", "og", "s".

[think]

The answer is C: "b", then "logs".

Encoding replays the merges in training order. After the first two merges, the word is "b", "log", "s". The merge with c does not apply. The merge of log with s fires next, giving "b", "logs", so by the time b with log is tried, "log" has already been absorbed into "logs". BPE is not a longest-match lookup, which is why "blog", then "s", is the tempting wrong answer.

## 2

Your feature launches in a new language, and the cost per request rises far more than the change in request volume. What is the most likely explanation?

A, the model writes longer answers in other languages by design. B, the provider charges a higher per-token rate for non-English text. C, non-English prompts bypass the provider's prompt cache entirely. D, the tokenizer splits that language into many more tokens per word.

[think]

The answer is D: the tokenizer splits that language into many more tokens per word.

Pricing is per token, and tokenizers learn fewer merges for languages that were less represented in their training mix, so the same content costs more input and output tokens. In the lesson's toy experiment, the Japanese sentence cost 4.4 times the English one. Answers may also be longer, but the tokenization effect is systematic, and per-token rates do not depend on language.

## 3

Traffic grows 30 percent when a new market launches, and the total bill doubles. If the old requests are unchanged, how many times the tokens of an old request must each new request use?

A, about 1.3 times. B, about 6.7 times. C, about 2 times. D, about 3.3 times.

[think]

The answer is D: about 3.3 times.

In units of the old bill, the total is 1, plus 0.3 times the ratio. Setting that equal to 2 gives a ratio of 1 over 0.3, about 3.3. Doubling the bill with only 30 percent more requests needs each new request to be far more expensive, which points at the tokenizer ratio for that market's language, not at request volume.

## 4

Why is it risky to ask a model to copy 40 order IDs, each a long hex string with hyphens in the style of a UUID, from the prompt into its answer?

A, the tokenizer strips unfamiliar hex strings before the model sees them. B, hyphens are control tokens, so the model cannot emit them in output. C, each ID splits into many rare tokens, so exact copying is highly error-prone. D, each ID matches a special token, so emitting one ends the response.

[think]

The answer is C: each ID splits into many rare tokens, so exact copying is highly error-prone.

Hex-and-hyphen strings fragment into many tokens with little training signal, which costs a lot of context, and reproducing long sequences of them exactly is where models slip. Give the model short handles, and map them back to the IDs in code. The tokenizer never drops the text; it just encodes it expensively.

## 5

A streaming chat interface shows a replacement character that flickers, and then turns into the right emoji. What is happening?

A, a token ended mid-character, and the client decoded the partial bytes. B, the model first sampled a wrong token, and then corrected it. C, the emoji is a special token that the server escapes while streaming. D, the font lacks the emoji until the whole response has been received.

[think]

The answer is A: a token ended mid-character, and the client decoded the partial bytes.

With byte-level tokens, one emoji, which is four to eighteen bytes of UTF-8, can span several tokens, so the first token carries an incomplete byte sequence that decodes to a replacement character. The client should buffer until the bytes form complete UTF-8 sequences. Sampled tokens are never revised, and emoji are ordinary bytes, not special tokens.

## 6

What happens when a byte-level BPE tokenizer meets a word, emoji or script it never saw during training?

A, it emits an unknown-token placeholder, so that content is lost. B, it raises an encoding error that the caller must handle. C, it falls back to smaller pieces and, at worst, to single bytes. D, it maps the input to the nearest known word in its vocabulary.

[think]

The answer is C: it falls back to smaller pieces and, at worst, to single bytes.

Byte-level fallback means every possible string has an encoding. Unfamiliar text costs more tokens, up to one per UTF-8 byte, and gives the model less familiar input. Unknown-token placeholders were a problem of word-level vocabularies, not of byte-level BPE.

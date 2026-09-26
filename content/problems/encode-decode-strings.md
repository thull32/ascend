---
slug: encode-decode-strings
title: Encode and Decode Strings
difficulty: medium
patterns: [hash-map]
lists: [ascend-150]
companies: [google, meta]
order: 6
lesson: interview-patterns/sequence-patterns/hash-map-patterns
hints:
  - Joining with a delimiter fails as soon as a string contains the delimiter. Escaping the delimiter works but makes decoding a character-by-character state machine.
  - Length-prefix each string. If the decoder knows how many characters to read, the content can contain anything at all.
  - Use a terminator after the length so the decoder knows where the digits stop, for example `5#hello`.
signatures:
  python:
    name: round_trip
    starter: |
      def encode(strs: list[str]) -> str:
          pass

      def decode(s: str) -> list[str]:
          pass

      def round_trip(strs: list[str]) -> list[str]:
          # The tests call this. Do not edit it; implement encode and decode above.
          return decode(encode(strs))
  javascript:
    name: round_trip
    starter: |
      function encode(strs) {
      }

      function decode(s) {
      }

      function round_trip(strs) {
        // The tests call this. Do not edit it; implement encode and decode above.
        return decode(encode(strs));
      }
tests:
  - args: [["hello", "world"]]
    expected: ["hello", "world"]
  - args: [["one", "", "three"]]
    expected: ["one", "", "three"]
    label: empty string in the middle
  - args: [[]]
    expected: []
    label: no strings
  - args: [[""]]
    expected: [""]
    label: a single empty string
  - args: [["", ""]]
    expected: ["", ""]
  - args: [["a#b", "#", "12#"]]
    expected: ["a#b", "#", "12#"]
    label: strings containing the delimiter
  - args: [["3#abc"]]
    expected: ["3#abc"]
    hidden: true
    label: a string that looks like an encoded chunk
  - args: [["ünïcödé", "日本語", "  spaces  "]]
    expected: ["ünïcödé", "日本語", "  spaces  "]
    hidden: true
time_limit_ms: 4000
---
Design a pair of functions to serialise a list of strings into a single string and deserialise it back.

- `encode(strs)` takes a list of strings and returns one string.
- `decode(s)` takes a string produced by `encode` and returns the original list, with every element exactly as it was.

The strings may contain any characters, including whatever separator or marker you choose to use. The list may be empty and may contain empty strings. The tests call `round_trip(strs)`, which is `decode(encode(strs))`, and check that the result equals the input.

### Examples

| Input | Round trip | Note |
|---|---|---|
| `["hello", "world"]` | `["hello", "world"]` | |
| `["a#b", "#", "12#"]` | `["a#b", "#", "12#"]` | Any delimiter you pick may appear inside the data |
| `[""]` | `[""]` | Must be distinguishable from `[]` |

### Constraints

- `0 ≤ len(strs) ≤ 200`
- `0 ≤ len(strs[i]) ≤ 200`
- Characters may be any Unicode code point.

### Follow-up

The interviewer asks: "This encoding will be written to disk by version 1 of the service and read by version 2 a year later. What would you add?" And then: "Encoding a list of one million tiny strings is slow. Where does the time go?"

## Solution

### The naive approach

Join with a separator that "will never appear", such as `","` or `"\x00"`. It fails the moment the data contains that character, and "never appears" is an assumption about data you do not control. Escaping fixes correctness: write `\,` for a literal comma and `\\` for a literal backslash, and decode with a small state machine that tracks whether the previous character was an escape. That works, but the decoder has to look at every character and the encoded size depends on the content.

### The insight

The decoder's real problem is not "where does this string end?" but "how many characters should I read?" If you tell it up front, the content becomes opaque bytes and no character inside it can confuse the parser. This is length-prefix framing, and it is how most binary protocols (Protocol Buffers, Thrift, TLS records, HTTP/2 frames) delimit variable-length fields.

### The optimal approach

Encode each string as `<length>#<content>`. The `#` is not a delimiter for the content; it terminates the decimal length so the decoder knows where the digits stop. Decoding reads digits up to `#`, converts them, then slices exactly that many characters.

```python
def encode(strs: list[str]) -> str:
    return "".join(f"{len(s)}#{s}" for s in strs)


def decode(s: str) -> list[str]:
    out: list[str] = []
    i = 0
    while i < len(s):
        j = s.index("#", i)          # end of the length field
        n = int(s[i:j])
        start = j + 1
        out.append(s[start:start + n])
        i = start + n
    return out


def round_trip(strs: list[str]) -> list[str]:
    return decode(encode(strs))
```

Trace `["a#b", "#"]`: encoded as `"3#a#b1##"`. Decode: read `3`, skip `#`, take three characters `a#b`, now at index 5; read `1`, skip `#`, take one character `#`. Done. The `#` characters inside the data were never examined as delimiters because the decoder jumped over them by count.

Time `O(total characters)` for both directions; space `O(total characters)` for the output. Empty list encodes to `""` and decodes to `[]`; `[""]` encodes to `"0#"` and decodes to `[""]`. Those two cases are the ones to test out loud.

### Common mistakes

- Using `s.split("#")` anywhere in the decoder. The whole point is that `#` may appear in the data.
- Storing the length without a terminator (`"5hello"`): the decoder cannot tell `"1"` + `"2abc"` from `"12"` + `"abc"`.
- Counting bytes in one function and characters in the other. Python `len` counts code points; JavaScript `length` counts UTF-16 units. Either is fine as long as the encoder and decoder agree, and both live in the same language here. Across languages you must fix the unit, usually bytes of UTF-8.
- Forgetting the empty-string case, so `[""]` and `[]` collide.

### How to discuss it

Say why delimiters fail, mention escaping as a valid but fiddlier alternative, then propose length prefixing and name the protocols that use it. Code both directions and trace an adversarial input containing your marker character. For the versioning follow-up: add a version byte or header at the front so a v2 reader can detect a v1 payload, and keep the length field self-describing so unknown trailing fields can be skipped. For the performance follow-up: a million tiny strings means a million small allocations and string formats; a byte buffer with a fixed-width binary length (four bytes, big-endian) removes the decimal formatting, the terminator search, and most of the allocation, which is what a real serialiser does.
